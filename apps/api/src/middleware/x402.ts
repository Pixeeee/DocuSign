import { Request, Response, NextFunction } from 'express'
// Use runtime require to avoid TypeScript resolution failures for workspace packages
// when type declarations aren't available to the consumer project.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const payments = require('@esign/payments') as any
const {
  buildX402Header,
  buildStellarPaymentOption,
  verifyX402Payment,
  verifyStellarPayment,
  checkSubscriptionCoverage,
} = payments
import { prisma } from '@esign/db'
import { getIdempotency, setIdempotency } from '@esign/utils'
import { AuthenticatedRequest } from './authenticate'
import { logger } from '@esign/utils/logger'

/**
 * X402 Payment enforcement middleware
 * Flow:
 * 1. Check if user has subscription coverage → skip payment
 * 2. Check X-Payment header → verify with facilitator
 * 3. Return 402 Payment Required if no valid payment
 * 
 * In development mode, payment can be skipped with X-Skip-Payment header
 */
export async function x402PaymentMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  // Skip payment verification in development if header is set
  if (
    process.env.NODE_ENV === 'development' &&
    req.headers['x-skip-payment'] === 'true'
  ) {
    logger.info('Skipping X402 payment (development mode)')
    return next()
  }

  // In development mode, accept any payment token without verification
  if (process.env.NODE_ENV === 'development') {
    const rawPaymentHeader = req.headers['x-payment']
    if (rawPaymentHeader) {
      logger.info('Development mode: accepting payment token without verification')
      return next()
    }
  }

  const rawDocumentId = req.params.documentId
  const documentId =
    typeof rawDocumentId === 'string'
      ? rawDocumentId
      : Array.isArray(rawDocumentId)
      ? rawDocumentId[0]
      : undefined
  const userId = req.user!.id

  // ── Check document and get teamId ──────────────────────────

  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { teamId: true, title: true },
  })

  // ── Subscription coverage check ────────────────────────────

  const hasCoverage = await checkSubscriptionCoverage(userId, document?.teamId)

  if (hasCoverage) {
    return next()
  }

  // ── Check X-Payment header ─────────────────────────────────

  const rawPaymentHeader = req.headers['x-payment']
  const paymentHeader =
    typeof rawPaymentHeader === 'string'
      ? rawPaymentHeader
      : Array.isArray(rawPaymentHeader)
      ? rawPaymentHeader[0]
      : undefined

  const DEFAULT_X402_PRICE = '0.000091'
  const DEFAULT_STELLAR_PRICE = '0.1'
  const configuredPrice = process.env.X402_PRICE_PER_SIGN
  const price = configuredPrice || DEFAULT_X402_PRICE
  const stellarPrice = process.env.STELLAR_PRICE_PER_SIGN || DEFAULT_STELLAR_PRICE
  const resource = `/api/signatures/${documentId}/sign`

  if (!paymentHeader) {
    // Return 402 with payment details
    const paymentRequired = buildX402Header(resource, price)
    const stellarPaymentRequired = buildStellarPaymentOption(resource, stellarPrice)

    if (configuredPrice && configuredPrice !== DEFAULT_X402_PRICE) {
      logger.warn('X402 price configured differently than expected', {
        configuredPrice,
        expectedPrice: DEFAULT_X402_PRICE,
      })
    }

    logger.info('Payment required for signing', {
      documentId,
      userId,
      basePrice: price,
      stellarPrice,
    })

    return res.status(402).json({
      error: 'Payment Required',
      message: 'Payment required to sign this document',
      x402Version: 1,
      amount: price,
      currency: 'ETH',
      stellarAmount: stellarPrice,
      stellarCurrency: 'XLM',
      stellarDestination: stellarPaymentRequired.payTo,
      stellarHorizonUrl: stellarPaymentRequired.horizonUrl,
      accepts: [paymentRequired, stellarPaymentRequired],
    })
  }

  // ── Verify payment ─────────────────────────────────────────

  const isStellarPayment = paymentHeader.startsWith('stellar:')
  const requiredAmount = isStellarPayment ? stellarPrice : price
  const paymentCurrency = isStellarPayment ? 'XLM' : 'ETH'

  // Check idempotency (prevent double-spending)
  const paymentCacheKey = `payment:${paymentHeader.slice(0, 64)}`
  const cached = await getIdempotency<{ valid: boolean }>(paymentCacheKey)
  
  if (cached?.valid) {
    logger.warn('Payment token reuse attempted', { documentId, userId })
    return res.status(402).json({
      error: 'Payment token already used',
      code: 'PAYMENT_TOKEN_REUSED',
    })
  }

  const verification = isStellarPayment
    ? await verifyStellarPayment(paymentHeader, resource, requiredAmount)
    : await verifyX402Payment(paymentHeader, resource, requiredAmount)

  if (!verification.valid) {
    logger.warn('Invalid payment', {
      documentId,
      userId,
      currency: paymentCurrency,
      error: verification.error,
    })
    return res.status(402).json({
      error: 'Invalid payment',
      message: verification.error || 'Payment verification failed',
    })
  }

  const rawIdempotencyHeader = req.headers['x-idempotency-key']
  const idempotencyKey =
    typeof rawIdempotencyHeader === 'string'
      ? rawIdempotencyHeader
      : Array.isArray(rawIdempotencyHeader)
      ? rawIdempotencyHeader[0]
      : verification.paymentId!

  const pendingPayment = {
    paymentCacheKey,
    idempotencyKey,
    userId,
    documentId,
    resource,
    price: requiredAmount,
    currency: paymentCurrency,
    paymentId: verification.paymentId!,
    txHash: verification.txHash,
  }

  res.locals.x402PendingPayment = pendingPayment

  res.on('finish', async () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return

    try {
      const existing = await getIdempotency<{ valid: boolean }>(paymentCacheKey)
      if (existing?.valid) return

      await setIdempotency(paymentCacheKey, { valid: true }, 86400)

      await prisma.payment.create({
        data: {
          userId,
          documentId,
          type: 'SINGLE_SIGN',
          status: 'COMPLETED',
          amount: requiredAmount,
          currency: paymentCurrency,
          txHash: verification.txHash,
          x402PaymentId: verification.paymentId!,
          idempotencyKey,
          metadata: { resource, verifiedAt: new Date().toISOString() },
        },
      })

      logger.info('X402 payment verified and recorded', {
        documentId,
        userId,
        txHash: verification.txHash,
        amount: requiredAmount,
        currency: paymentCurrency,
      })
    } catch (err) {
      logger.error('Failed to persist X402 payment after success', {
        error: err instanceof Error ? err.message : String(err),
        documentId,
        userId,
        paymentCacheKey,
      })
    }
  })

  next()
}
