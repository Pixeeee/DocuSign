import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import fs from 'fs'
import path from 'path'
import { isTokenBlacklisted } from '@esign/utils'
import { prisma } from '@esign/db'

function normalizePemKey(key: string): string {
  return key.replace(/\\n/g, '\n')
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string
    email: string
    role: string
    plan: string
    totpEnabled: boolean
    mfaVerified?: boolean
  }
  apiKey?: {
    userId: string
    permissions: string[]
  }
}

function loadKeyValue(keyEnv: string | undefined, pathEnv: string | undefined, defaultPaths: string[]): string {
  if (keyEnv) {
    return normalizePemKey(keyEnv)
  }

  const keyPath = pathEnv
  if (keyPath) {
    return fs.readFileSync(path.resolve(keyPath), 'utf8')
  }

  for (const fallbackPath of defaultPaths) {
    const resolved = path.resolve(fallbackPath)
    if (fs.existsSync(resolved)) {
      return fs.readFileSync(resolved, 'utf8')
    }
  }

  throw new Error(`JWT public key not found. Set JWT_PUBLIC_KEY or JWT_PUBLIC_KEY_PATH, or add one of: ${defaultPaths.join(', ')}`)
}

function getPublicKey(): string {
  return loadKeyValue(process.env.JWT_PUBLIC_KEY, process.env.JWT_PUBLIC_KEY_PATH, [
    './keys/jwt_public.pem',
    './keys/public.pem',
  ])
}

/**
 * Verify JWT RS256 access token
 */
export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization
    const apiKeyHeader = req.headers['x-api-key'] as string

    // ── API Key auth ────────────────────────────────────────────
    if (apiKeyHeader) {
      return authenticateApiKey(apiKeyHeader, req, res, next)
    }

    // ── Bearer JWT auth ─────────────────────────────────────────
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' })
    }

    const token = authHeader.slice(7)

    // Check blacklist
    if (await isTokenBlacklisted(token)) {
      return res.status(401).json({ error: 'Token has been revoked' })
    }

    const publicKey = getPublicKey()
    const decoded = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
    }) as jwt.JwtPayload

    if (!decoded.sub) {
      return res.status(401).json({ error: 'Invalid token payload' })
    }

    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      plan: decoded.plan,
      totpEnabled: decoded.totpEnabled,
      mfaVerified: decoded.mfaVerified,
    }

    next()
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' })
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: 'Invalid token' })
    }
    next(error)
  }
}

/**
 * Require MFA verification for sensitive operations
 */
export function requireMFA(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  if (req.user.totpEnabled && !req.user.mfaVerified) {
    return res.status(403).json({
      error: 'MFA verification required',
      code: 'MFA_REQUIRED',
    })
  }

  next()
}

/**
 * Validate API key auth
 */
async function authenticateApiKey(
  keyHeader: string,
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const crypto = await import('crypto')
    const prefix = keyHeader.slice(0, 8)
    const keyHash = crypto.createHash('sha256').update(keyHeader).digest('hex')

    const apiKey = await prisma.apiKey.findFirst({
      where: {
        prefix,
        keyHash,
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
    })

    if (!apiKey) {
      return res.status(401).json({ error: 'Invalid API key' })
    }

    // Update last used
    await prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    })

    req.apiKey = {
      userId: apiKey.userId,
      permissions: apiKey.permissions,
    }

    next()
  } catch (error) {
    next(error)
  }
}

/**
 * Require specific roles
 */
export function requireRole(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' })
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }
    next()
  }
}
