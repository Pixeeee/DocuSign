import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import { prisma } from '@esign/db'
import { logger } from '@esign/utils/logger'

const router: import('express').Router = Router()

// Webhook secret from .env
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET
if (!WEBHOOK_SECRET) {
  throw new Error('WEBHOOK_SECRET must be set for webhook verification')
}

// ─── Signature Verification ────────────────────────────────────

function verifyWebhookSignature(
  rawBody: Buffer,
  signature: string,
  secret: string
): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')

  const sig = signature.startsWith('sha256=') ? signature.slice(7) : signature

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(sig, 'hex')
    )
  } catch {
    return false
  }
}

// ─── X402 Payment Webhook ──────────────────────────────────────

router.post(
  '/x402',
  async (req: Request, res: Response) => {
    const signature = req.headers['x-webhook-signature'] as string

    if (!signature) {
      return res.status(400).json({ error: 'Missing webhook signature' })
    }

    const rawBody = req.body as Buffer
    const isValid = verifyWebhookSignature(rawBody, signature, WEBHOOK_SECRET)

    if (!isValid) {
      logger.warn('Invalid webhook signature', { path: '/webhooks/x402' })
      return res.status(401).json({ error: 'Invalid signature' })
    }

    let event: { type: string; data: any }

    try {
      event = JSON.parse(rawBody.toString())
    } catch {
      return res.status(400).json({ error: 'Invalid JSON payload' })
    }

    logger.info('X402 webhook received', { type: event.type })

    try {
      switch (event.type) {

        // ── Payment confirmed on-chain ────────────────────────
        case 'payment.confirmed': {
          const { paymentId, txHash, amount, walletAddress } = event.data

          await prisma.payment.updateMany({
            where: { x402PaymentId: paymentId },
            data: {
              status: 'COMPLETED',
              txHash,
              walletAddress,
            },
          })

          logger.info('Payment confirmed via webhook', { paymentId, txHash })
          break
        }

        // ── Payment failed ────────────────────────────────────
        case 'payment.failed': {
          const { paymentId, reason } = event.data

          await prisma.payment.updateMany({
            where: { x402PaymentId: paymentId },
            data: {
              status: 'FAILED',
              metadata: { failureReason: reason },
            },
          })

          logger.warn('Payment failed via webhook', { paymentId, reason })
          break
        }

        // ── Payment refunded ──────────────────────────────────
        case 'payment.refunded': {
          const { paymentId, txHash } = event.data

          await prisma.payment.updateMany({
            where: { x402PaymentId: paymentId },
            data: {
              status: 'REFUNDED',
              metadata: { refundTxHash: txHash },
            },
          })

          logger.info('Payment refunded via webhook', { paymentId, txHash })
          break
        }

        // ── Subscription renewed ──────────────────────────────
        case 'subscription.renewed': {
          const { teamId, periodEnd, signaturesLimit } = event.data

          await prisma.subscription.updateMany({
            where: { teamId, status: 'active' },
            data: {
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(periodEnd),
              signaturesUsed: 0,
              signaturesLimit: signaturesLimit ?? 100,
            },
          })

          logger.info('Subscription renewed via webhook', { teamId })
          break
        }

        // ── Subscription cancelled ────────────────────────────
        case 'subscription.cancelled': {
          const { teamId } = event.data

          await prisma.subscription.updateMany({
            where: { teamId, status: 'active' },
            data: { status: 'cancelled' },
          })

          await prisma.team.updateMany({
            where: { id: teamId },
            data: { plan: 'FREE' },
          })

          logger.info('Subscription cancelled via webhook', { teamId })
          break
        }

        default:
          logger.info('Unhandled webhook event type', { type: event.type })
      }
    } catch (err) {
      logger.error('Webhook handler error', { type: event.type, error: err })
      // Still return 200 to prevent retries for DB errors
      return res.status(200).json({ received: true, warning: 'Handler error logged' })
    }

    res.status(200).json({ received: true })
  }
)

// ─── Webhook Health ────────────────────────────────────────────

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

export default router
