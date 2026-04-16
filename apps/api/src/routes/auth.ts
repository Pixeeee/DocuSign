//apps/api/src/routes/auth.ts
import bcrypt from 'bcryptjs'
import speakeasy from 'speakeasy'
import QRCode from 'qrcode'
import { Request, Response, Router } from 'express'
import { z } from 'zod'
import { prisma } from '@esign/db'
import { generateTokens, storeSession, rotateRefreshToken } from '../services/jwt.service'
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate'
import { auditLog } from '../middleware/audit'
import { blacklistToken } from '@esign/utils'
import { encryptToString, decryptFromString } from '@esign/crypto'

const router = Router()

// ─── Validation Schemas ────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[A-Z]/, 'Must contain uppercase')
    .regex(/[a-z]/, 'Must contain lowercase')
    .regex(/[0-9]/, 'Must contain number')
    .regex(/[^A-Za-z0-9]/, 'Must contain special character'),
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
})

// ✅ Correct — truly optional
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totpCode: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().length(6).optional()
  ),
})

// ─── Register ──────────────────────────────────────────────────

router.post(
  '/register',
  auditLog({ action: 'USER_REGISTER' }),
  async (req: Request, res: Response) => {
    try {
      const { email, password, firstName, lastName } = registerSchema.parse(req.body)

      // Check existing
      const existing = await prisma.user.findUnique({ where: { email } })
      if (existing) {
        return res.status(409).json({ error: 'Email already registered' })
      }

      const passwordHash = await bcrypt.hash(password, 14)

      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          firstName,
          lastName,
        },
      })

      const tokens = generateTokens(user)
      await storeSession(user.id, tokens, req as any)

      return res.status(201).json({
        message: 'Registration successful',
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          plan: user.plan,
          totpEnabled: user.totpEnabled,
        },
        ...tokens,
      })
    } catch (error) {
      console.error('Registration error:', error)
      throw error
    }
  }
)

// ─── Login ─────────────────────────────────────────────────────

router.post(
  '/login',
  auditLog({ action: 'USER_LOGIN' }),
  async (req: Request, res: Response) => {
    try {
      const { email, password, totpCode } = loginSchema.parse(req.body)

      const user = await prisma.user.findUnique({ where: { email } })
      if (!user || !user.isActive) {
        return res.status(401).json({ error: 'Invalid credentials' })
      }

      const validPassword = await bcrypt.compare(password, user.passwordHash)
      if (!validPassword) {
        // Artificial delay to prevent timing attacks
        await new Promise(r => setTimeout(r, 200))
        return res.status(401).json({ error: 'Invalid credentials' })
      }

      // ── TOTP MFA check ─────────────────────────────────────────
      let mfaVerified = false

      if (user.totpEnabled && user.totpSecret) {
        if (!totpCode) {
          return res.status(200).json({
            mfaRequired: true,
            message: 'Enter your MFA code',
          })
        }

        const decryptedSecret = decryptFromString(user.totpSecret)
        const valid = speakeasy.totp.verify({
          secret: decryptedSecret,
          encoding: 'base32',
          token: totpCode,
          window: 2,
        })

        if (!valid) {
          return res.status(401).json({ error: 'Invalid MFA code' })
        }

        mfaVerified = true
      }

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      })

      const tokens = generateTokens(user, mfaVerified)
      await storeSession(user.id, tokens, req as any)

      return res.json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          plan: user.plan,
          role: user.role,
          totpEnabled: user.totpEnabled,
        },
        ...tokens,
      })
    } catch (error) {
      console.error('Login error:', error)
      throw error
    }
  }
)

// ─── Logout ────────────────────────────────────────────────────

router.post(
  '/logout',
  authenticate,
  auditLog({ action: 'USER_LOGOUT' }),
  async (req: AuthenticatedRequest, res: Response) => {
    const token = req.headers.authorization?.slice(7)!
    await blacklistToken(token, 15 * 60) // TTL = access token lifetime

    await prisma.session.deleteMany({
      where: {
        token,
        userId: req.user!.id,
      },
    })

    res.json({ message: 'Logged out successfully' })
  }
)

// ─── Refresh Token ─────────────────────────────────────────────

router.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body
  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token required' })
  }

  const tokens = await rotateRefreshToken(refreshToken)
  if (!tokens) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' })
  }

  res.json(tokens)
})

// ─── Setup TOTP MFA ────────────────────────────────────────────

router.post(
  '/mfa/setup',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } })

    if (user.totpEnabled) {
      return res.status(409).json({ error: 'MFA already enabled' })
    }

    const secret = speakeasy.generateSecret({
      name: `${process.env.TOTP_APP_NAME || 'ESign'} (${user.email})`,
      issuer: process.env.TOTP_ISSUER || 'ESign',
    })

    // Store encrypted TOTP secret (not yet verified)
    await prisma.user.update({
      where: { id: user.id },
      data: {
        totpSecret: encryptToString(secret.base32),
        totpVerified: false,
      },
    })

    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!)

    res.json({
      secret: secret.base32,
      qrCode: qrCodeUrl,
      message: 'Scan the QR code in your authenticator app, then verify with /mfa/verify',
    })
  }
)

// ─── Verify & Enable TOTP MFA ──────────────────────────────────

router.post(
  '/mfa/verify',
  authenticate,
  auditLog({ action: 'USER_MFA_ENABLED' }),
  async (req: AuthenticatedRequest, res: Response) => {
    const { code } = z.object({ code: z.string().length(6) }).parse(req.body)

    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } })

    if (!user.totpSecret) {
      return res.status(400).json({ error: 'MFA setup not initiated' })
    }

    const decryptedSecret = decryptFromString(user.totpSecret)
    const valid = speakeasy.totp.verify({
      secret: decryptedSecret,
      encoding: 'base32',
      token: code,
      window: 2,
    })

    if (!valid) {
      return res.status(400).json({ error: 'Invalid verification code' })
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { totpEnabled: true, totpVerified: true },
    })

    res.json({ message: 'MFA enabled successfully' })
  }
)

export default router