import { Router, Request, Response } from 'express'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { prisma } from '@esign/db'
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate'
import { requireMFA } from '../middleware/authenticate'
import { auditLog } from '../middleware/audit'
import { encryptToString } from '@esign/crypto'

const router: import('express').Router = Router()

function getParam(req: Request, name: string): string | undefined {
  const v = (req.params as any)[name]
  return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined
}

// ─── Get Current User ──────────────────────────────────────────

router.get(
  '/me',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        role: true,
        plan: true,
        isVerified: true,
        totpEnabled: true,
        lastLoginAt: true,
        createdAt: true,
        _count: {
          select: {
            documents: true,
            signatures: true,
            payments: true,
          },
        },
      },
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    res.json({ user })
  }
)

// ─── Update Profile ────────────────────────────────────────────

router.patch(
  '/me',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      firstName: z.string().min(1).max(50).optional(),
      lastName: z.string().min(1).max(50).optional(),
      avatarUrl: z.string().url().optional().nullable(),
    })

    const data = schema.parse(req.body)

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        updatedAt: true,
      },
    })

    res.json({ user })
  }
)

// ─── Change Password ───────────────────────────────────────────

router.patch(
  '/me/password',
  authenticate,
  requireMFA,
  async (req: AuthenticatedRequest, res: Response) => {
    const { currentPassword, newPassword } = z
      .object({
        currentPassword: z.string().min(1),
        newPassword: z
          .string()
          .min(12, 'Password must be at least 12 characters')
          .regex(/[A-Z]/, 'Must contain uppercase')
          .regex(/[a-z]/, 'Must contain lowercase')
          .regex(/[0-9]/, 'Must contain number')
          .regex(/[^A-Za-z0-9]/, 'Must contain special character'),
      })
      .parse(req.body)

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
    if (!user) return res.status(404).json({ error: 'User not found' })
    if (!user.passwordHash) {
      return res.status(400).json({ error: 'Password is not configured for this account' })
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' })
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'New password must differ from current password' })
    }

    const passwordHash = await bcrypt.hash(newPassword, 14)

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    })

    // Invalidate all existing sessions except current
    await prisma.session.deleteMany({
      where: {
        userId: user.id,
        token: { not: req.headers.authorization?.slice(7) },
      },
    })

    res.json({ message: 'Password updated successfully. Other sessions have been logged out.' })
  }
)

// ─── Disable MFA ───────────────────────────────────────────────

router.delete(
  '/me/mfa',
  authenticate,
  requireMFA,
  async (req: AuthenticatedRequest, res: Response) => {
    const { password } = z.object({ password: z.string().min(1) }).parse(req.body)

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
    if (!user) return res.status(404).json({ error: 'User not found' })
    if (!user.passwordHash) {
      return res.status(400).json({ error: 'Password is not configured for this account' })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return res.status(401).json({ error: 'Invalid password' })

    await prisma.user.update({
      where: { id: user.id },
      data: {
        totpSecret: null,
        totpEnabled: false,
        totpVerified: false,
      },
    })

    res.json({ message: 'MFA disabled successfully' })
  }
)

// ─── List API Keys ─────────────────────────────────────────────

router.get(
  '/me/api-keys',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    const apiKeys = await prisma.apiKey.findMany({
      where: { userId: req.user!.id, isActive: true },
      select: {
        id: true,
        name: true,
        prefix: true,
        permissions: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json({ apiKeys })
  }
)

// ─── Create API Key ────────────────────────────────────────────

router.post(
  '/me/api-keys',
  authenticate,
  requireMFA,
  auditLog({ action: 'API_KEY_CREATED' }),
  async (req: AuthenticatedRequest, res: Response) => {
    const { name, permissions, expiresAt } = z
      .object({
        name: z.string().min(1).max(100),
        permissions: z
          .array(z.string())
          .default(['documents:read', 'documents:write', 'signatures:write']),
        expiresAt: z.string().datetime().optional(),
      })
      .parse(req.body)

    // Generate raw key: prefix (8 chars) + secret (40 chars)
    const rawKey = `esk_${crypto.randomBytes(30).toString('hex')}`
    const prefix = rawKey.slice(0, 8)
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex')

    await prisma.apiKey.create({
      data: {
        userId: req.user!.id,
        name,
        keyHash,
        prefix,
        permissions,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    })

    // Return raw key ONCE — never stored again
    res.status(201).json({
      message: 'API key created. Copy it now — it will not be shown again.',
      key: rawKey,
      prefix,
      permissions,
    })
  }
)

// ─── Revoke API Key ────────────────────────────────────────────

router.delete(
  '/me/api-keys/:keyId',
  authenticate,
  auditLog({ action: 'API_KEY_REVOKED' }),
  async (req: AuthenticatedRequest, res: Response) => {
    const apiKey = await prisma.apiKey.findFirst({
      where: { id: getParam(req, 'keyId'), userId: req.user!.id },
    })

    if (!apiKey) return res.status(404).json({ error: 'API key not found' })

    await prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { isActive: false },
    })

    res.json({ message: 'API key revoked' })
  }
)

// ─── Get Audit Log ─────────────────────────────────────────────

router.get(
  '/me/audit-log',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    const { page = '1', limit = '20', action } = req.query as Record<string, string>

    const pageNum = Math.max(1, parseInt(page))
    const limitNum = Math.min(100, parseInt(limit))

    const where = {
      userId: req.user!.id,
      ...(action && { action: action as any }),
    }

    const [logs, total] = await prisma.$transaction([
      prisma.auditLog.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          action: true,
          ipAddress: true,
          userAgent: true,
          metadata: true,
          createdAt: true,
          document: { select: { id: true, title: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ])

    res.json({
      logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    })
  }
)

// ─── Get Active Sessions ───────────────────────────────────────

router.get(
  '/me/sessions',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    const sessions = await prisma.session.findMany({
      where: {
        userId: req.user!.id,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json({ sessions })
  }
)

// ─── Revoke Session ────────────────────────────────────────────

router.delete(
  '/me/sessions/:sessionId',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    await prisma.session.deleteMany({
      where: {
        id: getParam(req, 'sessionId'),
        userId: req.user!.id,
      },
    })

    res.json({ message: 'Session revoked' })
  }
)

export default router
