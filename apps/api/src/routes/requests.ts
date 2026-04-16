import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '@esign/db'
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate'
import { auditLog } from '../middleware/audit'

const router: import('express').Router = Router()

function getParam(req: Request, name: string): string | undefined {
  const v = (req.params as any)[name]
  return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined
}

// ─── Validation Schemas ────────────────────────────────────────

const CreateSignatureRequestSchema = z.object({
  documentId: z.string().min(1, 'Document ID is required'),
  requestedToId: z.string().min(1, 'Requested to user ID is required'),
  teamId: z.string().optional(),
  message: z.string().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
})

const UpdateSignatureRequestSchema = z.object({
  status: z.enum(['ACCEPTED', 'DECLINED']).optional(),
  declinedReason: z.string().optional().nullable(),
  message: z.string().optional().nullable(),
})

// ─── Create Signature Request ───────────────────────────────────

router.post(
  '/',
  authenticate,
  auditLog({
    action: 'DOCUMENT_SIGNED',
    getDocumentId: (req) => (req.body as any).documentId,
  }) as any,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = CreateSignatureRequestSchema.parse(req.body)

      // Verify document exists and user has access
      const document = await prisma.document.findUnique({
        where: { id: body.documentId },
        include: { uploadedBy: true, team: true },
      })

      if (!document) {
        return res.status(404).json({ error: 'Document not found' })
      }

      // Check if user owns the document or is a team member
      const isOwner = document.uploadedById === req.user!.id
      const isTeamMember = body.teamId && document.teamId === body.teamId

      if (!isOwner && !isTeamMember) {
        return res.status(403).json({ error: 'Unauthorized to request signatures on this document' })
      }

      // Verify the requested user exists
      const requestedTo = await prisma.user.findUnique({
        where: { id: body.requestedToId },
      })

      if (!requestedTo) {
        return res.status(404).json({ error: 'Requested user not found' })
      }

      // Create the signature request
      const signatureRequest = await prisma.signatureRequest.create({
        data: {
          documentId: body.documentId,
          requestedById: req.user!.id,
          requestedToId: body.requestedToId,
          teamId: body.teamId,
          message: body.message,
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
        },
        include: {
          document: true,
          requestedBy: true,
          requestedTo: true,
        },
      })

      res.status(201).json({
        message: 'Signature request created successfully',
        data: signatureRequest,
      })
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors })
      }
      res.status(500).json({ error: error.message || 'Failed to create signature request' })
    }
  }
)

// ─── Get Signature Request by ID ────────────────────────────────

router.get(
  '/:id',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = getParam(req, 'id')
      if (!id) return res.status(400).json({ error: 'ID parameter is required' })

      const signatureRequest = await prisma.signatureRequest.findUnique({
        where: { id },
        include: {
          document: true,
          requestedBy: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
            },
          },
          requestedTo: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
            },
          },
        },
      })

      if (!signatureRequest) {
        return res.status(404).json({ error: 'Signature request not found' })
      }

      // Verify user is involved in this request
      const isInvolved = signatureRequest.requestedById === req.user!.id || signatureRequest.requestedToId === req.user!.id
      if (!isInvolved) {
        return res.status(403).json({ error: 'Unauthorized to view this signature request' })
      }

      res.json({ data: signatureRequest })
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch signature request' })
    }
  }
)

// ─── Get Signature Requests (Sent and Received) ──────────────────

router.get(
  '/',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { type = 'received', status, page = '1', limit = '10' } = req.query

      const pageNum = Math.max(1, parseInt(page as string) || 1)
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 10))
      const skip = (pageNum - 1) * limitNum

      const whereClause: any = {}

      if (type === 'sent') {
        whereClause.requestedById = req.user!.id
      } else if (type === 'received') {
        whereClause.requestedToId = req.user!.id
      } else {
        return res.status(400).json({ error: 'Invalid type. Use "sent" or "received"' })
      }

      if (status) {
        whereClause.status = status
      }

      const [signatureRequests, total] = await Promise.all([
        prisma.signatureRequest.findMany({
          where: whereClause,
          include: {
            document: {
              select: {
                id: true,
                title: true,
                fileName: true,
                createdAt: true,
              },
            },
            requestedBy: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
            requestedTo: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limitNum,
        }),
        prisma.signatureRequest.count({ where: whereClause }),
      ])

      res.json({
        data: signatureRequests,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      })
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch signature requests' })
    }
  }
)

// ─── Accept Signature Request ───────────────────────────────────

router.post(
  '/:id/accept',
  authenticate,
  auditLog({
    action: 'DOCUMENT_SIGNED',
    getDocumentId: (req) => getParam(req, 'id'),
  }) as any,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = getParam(req, 'id')
      if (!id) return res.status(400).json({ error: 'ID parameter is required' })

      const signatureRequest = await prisma.signatureRequest.findUnique({
        where: { id },
        include: { document: true },
      })

      if (!signatureRequest) {
        return res.status(404).json({ error: 'Signature request not found' })
      }

      // Verify user is the one being requested
      if (signatureRequest.requestedToId !== req.user!.id) {
        return res.status(403).json({ error: 'Unauthorized to accept this request' })
      }

      // Cannot accept if already in a terminal state
      if (['ACCEPTED', 'DECLINED', 'EXPIRED', 'COMPLETED'].includes(signatureRequest.status)) {
        return res.status(400).json({ error: `Cannot accept request with status: ${signatureRequest.status}` })
      }

      const updated = await prisma.signatureRequest.update({
        where: { id },
        data: { status: 'ACCEPTED' },
        include: {
          document: true,
          requestedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
          requestedTo: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      })

      res.json({
        message: 'Signature request accepted',
        data: updated,
      })
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to accept signature request' })
    }
  }
)

// ─── Decline Signature Request ──────────────────────────────────

router.post(
  '/:id/decline',
  authenticate,
  auditLog({
    action: 'DOCUMENT_SIGNED',
    getDocumentId: (req) => getParam(req, 'id'),
  }) as any,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = getParam(req, 'id')
      if (!id) return res.status(400).json({ error: 'ID parameter is required' })

      const body = z.object({ reason: z.string().optional() }).parse(req.body)

      const signatureRequest = await prisma.signatureRequest.findUnique({
        where: { id },
        include: { document: true },
      })

      if (!signatureRequest) {
        return res.status(404).json({ error: 'Signature request not found' })
      }

      // Verify user is the one being requested
      if (signatureRequest.requestedToId !== req.user!.id) {
        return res.status(403).json({ error: 'Unauthorized to decline this request' })
      }

      // Cannot decline if already in a terminal state
      if (['ACCEPTED', 'DECLINED', 'EXPIRED', 'COMPLETED'].includes(signatureRequest.status)) {
        return res.status(400).json({ error: `Cannot decline request with status: ${signatureRequest.status}` })
      }

      const updated = await prisma.signatureRequest.update({
        where: { id },
        data: {
          status: 'DECLINED',
          declinedReason: body.reason,
        },
        include: {
          document: true,
          requestedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
          requestedTo: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      })

      res.json({
        message: 'Signature request declined',
        data: updated,
      })
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors })
      }
      res.status(500).json({ error: error.message || 'Failed to decline signature request' })
    }
  }
)

// ─── Cancel Signature Request ───────────────────────────────────

router.post(
  '/:id/cancel',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = getParam(req, 'id')
      if (!id) return res.status(400).json({ error: 'ID parameter is required' })

      const signatureRequest = await prisma.signatureRequest.findUnique({
        where: { id },
        include: { document: true },
      })

      if (!signatureRequest) {
        return res.status(404).json({ error: 'Signature request not found' })
      }

      // Verify user is the one who requested the signature
      if (signatureRequest.requestedById !== req.user!.id) {
        return res.status(403).json({ error: 'Only the requester can cancel this request' })
      }

      // Cannot cancel if already completed or declined
      if (['DECLINED', 'COMPLETED'].includes(signatureRequest.status)) {
        return res.status(400).json({ error: `Cannot cancel request with status: ${signatureRequest.status}` })
      }

      const updated = await prisma.signatureRequest.update({
        where: { id },
        data: { status: 'EXPIRED' },
        include: {
          document: true,
          requestedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
          requestedTo: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      })

      res.json({
        message: 'Signature request cancelled',
        data: updated,
      })
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to cancel signature request' })
    }
  }
)

// ─── Update Signature Request ───────────────────────────────────

router.patch(
  '/:id',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = getParam(req, 'id')
      if (!id) return res.status(400).json({ error: 'ID parameter is required' })

      const body = UpdateSignatureRequestSchema.parse(req.body)

      const signatureRequest = await prisma.signatureRequest.findUnique({
        where: { id },
      })

      if (!signatureRequest) {
        return res.status(404).json({ error: 'Signature request not found' })
      }

      // Verify user is involved and can make this update
      const isRequester = signatureRequest.requestedById === req.user!.id
      const isRecipient = signatureRequest.requestedToId === req.user!.id

      if (!isRequester && !isRecipient) {
        return res.status(403).json({ error: 'Unauthorized to update this request' })
      }

      const updated = await prisma.signatureRequest.update({
        where: { id },
        data: {
          ...(body.status && { status: body.status }),
          ...(body.declinedReason !== undefined && { declinedReason: body.declinedReason }),
          ...(body.message !== undefined && { message: body.message }),
        },
        include: {
          document: true,
          requestedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
          requestedTo: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      })

      res.json({
        message: 'Signature request updated',
        data: updated,
      })
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors })
      }
      res.status(500).json({ error: error.message || 'Failed to update signature request' })
    }
  }
)

// ─── Delete Signature Request (Admin only) ──────────────────────

router.delete(
  '/:id',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = getParam(req, 'id')
      if (!id) return res.status(400).json({ error: 'ID parameter is required' })

      const signatureRequest = await prisma.signatureRequest.findUnique({
        where: { id },
      })

      if (!signatureRequest) {
        return res.status(404).json({ error: 'Signature request not found' })
      }

      // Only requester can delete
      if (signatureRequest.requestedById !== req.user!.id) {
        return res.status(403).json({ error: 'Only the requester can delete this request' })
      }

      await prisma.signatureRequest.delete({
        where: { id },
      })

      res.json({ message: 'Signature request deleted successfully' })
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to delete signature request' })
    }
  }
)

export default router
