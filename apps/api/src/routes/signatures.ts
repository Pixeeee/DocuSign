import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { prisma } from '@esign/db'
import {
  authenticate,
  requireMFA,
  AuthenticatedRequest,
} from '../middleware/authenticate'
import { idempotencyMiddleware } from '../middleware/idempotency'
import { auditLog } from '../middleware/audit'
import { x402PaymentMiddleware } from '../middleware/x402'
import { downloadFromS3, uploadToS3 } from '../services/s3.service'
import { embedSignatureOnPdf } from '../services/pdf.service'
import { logger } from '@esign/utils/logger'

const router: import('express').Router = Router()

function getParam(req: Request, name: string): string | undefined {
  const v = (req.params as any)[name]
  return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined
}

const signSchema = z.object({
  signatureData: z.string().optional(), // base64 image of signature
  position: z.object({
    page: z.number().int().min(1),
    x: z.number().min(0),
    y: z.number().min(0),
    width: z.number().min(50).optional(),
    height: z.number().min(30).optional(),
  }),
  paymentToken: z.string().optional(),
})

// ─── Sign Document ─────────────────────────────────────────────

router.post(
  '/:documentId/sign',
  authenticate,
  requireMFA,
  idempotencyMiddleware,
  x402PaymentMiddleware,   // ← HTTP 402 payment enforcement
  auditLog({
    action: 'DOCUMENT_SIGNED',
    getDocumentId: (req) => getParam(req, 'documentId'),
  }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const documentId = getParam(req, 'documentId')
      const { signatureData, position } = signSchema.parse(req.body)

      // ── Fetch document ──────────────────────────────────────────

      const document = await prisma.document.findFirst({
        where: {
          id: documentId,
          status: { in: ['DRAFT', 'PENDING_SIGNATURE', 'PARTIALLY_SIGNED'] },
          OR: [
            { uploadedById: req.user!.id },
            {
              signatures: {
                some: { signerId: req.user!.id, status: 'PENDING' },
              },
            },
          ],
        },
      })

      if (!document) {
        return res.status(404).json({ error: 'Document not found or not available for signing' })
      }

      // ── Check expiry ────────────────────────────────────────────

      if (document.expiresAt && document.expiresAt < new Date()) {
        await prisma.document.update({
          where: { id: document.id },
          data: { status: 'EXPIRED' },
        })
        return res.status(410).json({ error: 'Document has expired' })
      }

      // ── Download original PDF ───────────────────────────────────

      const pdfBuffer = await downloadFromS3(document.s3Key)

      // ── Embed signature ─────────────────────────────────────────

      const signatureId = uuidv4()
      const now = new Date()

      const { signedBuffer, sha3Hash, rsaSignature } = await embedSignatureOnPdf(
        pdfBuffer,
        position,
        {
          signerName: `${req.user!.email}`,
          signerEmail: req.user!.email,
          signedAt: now,
          ipAddress: req.ip || '',
          documentId: document.id,
          signatureId,
        },
        signatureData
      )

      // ── Upload signed PDF to S3 ─────────────────────────────────

      const { s3Key: signedS3Key } = await uploadToS3(
        signedBuffer,
        `signed-${document.fileName}`,
        'application/pdf',
        `signed/${req.user!.id}`
      )

      // ── Persist signature record ────────────────────────────────

      const [signature] = await prisma.$transaction([
        prisma.signature.create({
          data: {
            id: signatureId,
            documentId: document.id,
            signerId: req.user!.id,
            signatureData: signatureData
              ? `[base64-truncated:${signatureData.length}]`
              : null,
            rsaSignature,
            sha3HashAtSign: sha3Hash,
            ipAddress: req.ip || 'unknown',
            userAgent: req.headers['user-agent'] || undefined,
            status: 'SIGNED',
            signedAt: now,
          },
        }),
        prisma.document.update({
          where: { id: document.id },
          data: {
            s3SignedKey: signedS3Key,
            status: 'SIGNED',
          },
        }),
      ])

      logger.info('Document signed', {
        documentId,
        signatureId,
        userId: req.user!.id,
      })

      res.status(201).json({
        signature: {
          id: signature.id,
          documentId,
          sha3Hash,
          rsaSignature,
          signedAt: signature.signedAt,
          status: signature.status,
        },
        message: 'Document signed successfully',
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Signature route failed', {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        documentId: getParam(req, 'documentId'),
        userId: req.user?.id,
      })

      return res.status(500).json({ error: `Signing failed: ${errorMessage}` })
    }
  }
)

// ─── List Signatures for a Document ───────────────────────────

router.get(
  '/:documentId',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    const document = await prisma.document.findFirst({
      where: {
        id: getParam(req, 'documentId'),
        uploadedById: req.user!.id,
      },
    })

    if (!document) {
      return res.status(404).json({ error: 'Document not found' })
    }

    const signatures = await prisma.signature.findMany({
      where: { documentId: getParam(req, 'documentId') },
      include: {
        signer: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    res.json({ signatures })
  }
)

// ─── Verify Signature ──────────────────────────────────────────

router.get(
  '/:documentId/verify/:signatureId',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    const { rsaVerify } = await import('@esign/crypto')

    const signature = await prisma.signature.findFirst({
      where: {
        id: getParam(req, 'signatureId'),
        documentId: getParam(req, 'documentId'),
        status: 'SIGNED',
      },
      include: {
        signer: {
          select: { email: true, firstName: true, lastName: true },
        },
      },
    })

    if (!signature) {
      return res.status(404).json({ error: 'Signature not found' })
    }

    const isValid = signature.rsaSignature
      ? rsaVerify(signature.sha3HashAtSign, signature.rsaSignature)
      : false

    res.json({
      valid: isValid,
      signature: {
        id: signature.id,
        signer: signature.signer,
        sha3Hash: signature.sha3HashAtSign,
        signedAt: signature.signedAt,
        ipAddress: signature.ipAddress,
      },
    })
  }
)

export default router