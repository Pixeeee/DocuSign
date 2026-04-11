import { Router, Request, Response } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { prisma } from '@esign/db'
import {
  authenticate,
  requireMFA,
  AuthenticatedRequest,
} from '../middleware/authenticate'
import { auditLog } from '../middleware/audit'
import { uploadToS3, getPresignedDownloadUrl, downloadFromS3 } from '../services/s3.service'
import { sha3HashFile } from '@esign/crypto'
import { validatePdf, getPdfPageCount } from '../services/pdf.service'
import { logger } from '@esign/utils/logger'

const router: import('express').Router = Router()

function getParam(req: Request, name: string): string | undefined {
  const v = (req.params as any)[name]
  return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined
}

// ─── Multer — memory storage (no disk) ────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed'))
    }
    cb(null, true)
  },
})

// ─── Upload Document ───────────────────────────────────────────

router.post(
  '/upload',
  authenticate as any,
  requireMFA as any,
  upload.single('document') as any,
  auditLog({
    action: 'DOCUMENT_UPLOADED',
    getDocumentId: (_req) => undefined,
    getMetadata: (req) => ({ fileName: req.file?.originalname }),
  }) as any,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const { title, description, teamId } = z
      .object({
        title: z.string().min(1).max(200),
        description: z.string().max(1000).optional(),
        teamId: z.string().optional(),
      })
      .parse(req.body)

    const fileBuffer = req.file.buffer

    try {
      // Validate PDF
      const isValid = await validatePdf(fileBuffer)
      if (!isValid) {
        return res.status(400).json({ error: 'Invalid or corrupted PDF file' })
      }

      // SHA-3 hash
      const sha3Hash = sha3HashFile(fileBuffer)

      // Upload to S3 (S3 applies SSE-KMS at rest)
      const { s3Key, size } = await uploadToS3(
        fileBuffer,
        req.file.originalname,
        'application/pdf',
        `documents/${req.user!.id}`
      )

      const pageCount = await getPdfPageCount(fileBuffer)

      const document = await prisma.document.create({
        data: {
          title,
          description,
          fileName: req.file.originalname,
          fileSize: size,
          mimeType: 'application/pdf',
          s3Key,
          sha3Hash,
          uploadedById: req.user!.id,
          teamId: teamId || null,
          metadata: { pageCount },
          status: 'DRAFT',
        },
      })

      logger.info('Document uploaded', {
        documentId: document.id,
        userId: req.user!.id,
        size,
      })

      res.status(201).json({
        document: {
          id: document.id,
          title: document.title,
          fileName: document.fileName,
          fileSize: document.fileSize,
          sha3Hash: document.sha3Hash,
          status: document.status,
          pageCount,
          createdAt: document.createdAt,
        },
      })
    } catch (uploadError) {
      logger.error('Document upload failed', {
        error: uploadError instanceof Error ? uploadError.message : uploadError,
        stack: uploadError instanceof Error ? uploadError.stack : undefined,
        userId: req.user?.id,
      })

      return res.status(500).json({
        error: 'Failed to upload document. Please verify storage configuration and try again.',
      })
    }
  }
)

// ─── List Documents ────────────────────────────────────────────

router.get(
  '/',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    const { page = '1', limit = '20', status } = req.query as Record<string, string>

    const pageNum = Math.max(1, parseInt(page))
    const limitNum = Math.min(100, parseInt(limit))
    const skip = (pageNum - 1) * limitNum

    const where = {
      uploadedById: req.user!.id,
      ...(status && { status: status as any }),
    }

    const [documents, total] = await prisma.$transaction([
      prisma.document.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          signatures: {
            select: { id: true, status: true, signedAt: true },
          },
          _count: { select: { signatures: true } },
        },
      }),
      prisma.document.count({ where }),
    ])

    res.json({
      documents,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    })
  }
)

// ─── Direct File Download (for local storage) ────────────────────
// NOTE: MUST come before /:id route to prevent :id from matching /download
// NOTE: No authentication middleware - presigned URLs are self-contained

router.get(
  '/download',
  async (req: Request, res: Response) => {
    const key = req.query.key as string

    if (!key) {
      return res.status(400).json({ error: 'File key is required' })
    }

    try {
      // Verify the file exists and is accessible
      // For local storage, we do a basic existence check
      // In production with expiring URLs, you'd also check timestamp
      const fileBuffer = await downloadFromS3(key)
      const fileName = key.split('/').pop() || 'download'

      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="${decodeURIComponent(fileName)}"`)
      res.setHeader('Content-Length', fileBuffer.length)

      res.send(fileBuffer)
    } catch (error) {
      console.error('[Documents] Download error:', error)
      res.status(500).json({ error: 'Failed to download file' })
    }
  }
)

// ─── Get Document ──────────────────────────────────────────────

router.get(
  '/:id',
  authenticate,
  auditLog({
    action: 'DOCUMENT_VIEWED',
    getDocumentId: (req) => getParam(req, 'id'),
  }),
  async (req: AuthenticatedRequest, res: Response) => {
    const document = await prisma.document.findFirst({
      where: {
        id: getParam(req, 'id'),
        uploadedById: req.user!.id,
      },
      include: {
        signatures: {
          include: {
            signer: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        },
        signingFields: true,
      },
    })

    if (!document) {
      return res.status(404).json({ error: 'Document not found' })
    }

    res.json({ document })
  }
)

// ─── Get Download URL ──────────────────────────────────────────

router.get(
  '/:id/download',
  authenticate,
  requireMFA,
  auditLog({
    action: 'DOCUMENT_DOWNLOADED',
    getDocumentId: (req) => getParam(req, 'id'),
  }),
  async (req: AuthenticatedRequest, res: Response) => {
    const document = await prisma.document.findFirst({
      where: {
        id: getParam(req, 'id'),
        uploadedById: req.user!.id,
      },
    })

    if (!document) {
      return res.status(404).json({ error: 'Document not found' })
    }

    const s3Key = document.s3SignedKey || document.s3Key
    const url = await getPresignedDownloadUrl(s3Key, 900)

    console.log('[Documents] Download URL endpoint:', {
      documentId: document.id,
      s3Key,
      url,
      isSigned: !!document.s3SignedKey,
    })

    res.json({
      url,
      expiresIn: 900,
      fileName: document.fileName,
      isSigned: !!document.s3SignedKey,
    })
  }
)

// ─── Delete Document ───────────────────────────────────────────

router.delete(
  '/:id',
  authenticate,
  requireMFA,
  async (req: AuthenticatedRequest, res: Response) => {
    const document = await prisma.document.findFirst({
      where: {
        id: getParam(req, 'id'),
        uploadedById: req.user!.id,
        status: { in: ['DRAFT', 'CANCELLED'] },
      },
    })

    if (!document) {
      return res.status(404).json({ error: 'Document not found or cannot be deleted' })
    }

    await prisma.document.update({
      where: { id: document.id },
      data: { status: 'CANCELLED' },
    })

    res.json({ message: 'Document deleted' })
  }
)

export default router