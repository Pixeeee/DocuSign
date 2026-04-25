import jwt from 'jsonwebtoken'
import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { prisma, User } from '@esign/db'

function loadKeyValue(keyEnv: string | undefined, pathEnv: string | undefined, defaultPaths: string[]): string {
  if (keyEnv) {
    return keyEnv
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

  throw new Error(`JWT key not found. Set JWT_PRIVATE_KEY or JWT_PRIVATE_KEY_PATH, or add one of: ${defaultPaths.join(', ')}`)
}

function getPrivateKey(): string {
  return loadKeyValue(process.env.JWT_PRIVATE_KEY, process.env.JWT_PRIVATE_KEY_PATH, [
    './keys/jwt_private.pem',
    './keys/private.pem',
  ])
}

function getPublicKey(): string {
  return loadKeyValue(process.env.JWT_PUBLIC_KEY, process.env.JWT_PUBLIC_KEY_PATH, [
    './keys/jwt_public.pem',
    './keys/public.pem',
  ])
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export function generateTokens(user: User, mfaVerified = false): TokenPair {
  const privateKey = getPrivateKey()

  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    plan: user.plan,
    totpEnabled: user.totpEnabled,
    mfaVerified,
    jti: uuidv4(),
  }

  const accessToken = jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    expiresIn: (process.env.JWT_EXPIRES_IN || '15m') as jwt.SignOptions['expiresIn'],
    issuer: 'esign-api',
    audience: 'esign-web',
  })

  const refreshToken = jwt.sign(
    { sub: user.id, jti: uuidv4(), type: 'refresh' },
    privateKey,
    {
      algorithm: 'RS256',
      expiresIn: (process.env.REFRESH_TOKEN_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'],
      issuer: 'esign-api',
    }
  )

  return {
    accessToken,
    refreshToken,
    expiresIn: 15 * 60, // 15 minutes in seconds
  }
}

export async function storeSession(
  userId: string,
  tokens: TokenPair,
  req: { ip?: string; headers: { 'user-agent'?: string } },
  async?: boolean
) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  if (async) {
    // Fire and forget - don't await
    prisma.session.create({
      data: {
        userId,
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        expiresAt,
      },
    }).catch(err => console.error('Session store failed:', err))
  } else {
    // Block and wait
    await prisma.session.create({
      data: {
        userId,
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        expiresAt,
      },
    })
  }
}

export async function rotateRefreshToken(refreshToken: string): Promise<TokenPair | null> {
  const publicKey = getPublicKey()

  try {
    const decoded = jwt.verify(refreshToken, publicKey, {
      algorithms: ['RS256'],
    }) as jwt.JwtPayload

    if (decoded.type !== 'refresh') return null

    const session = await prisma.session.findUnique({
      where: { refreshToken },
      include: { user: true },
    })

    if (!session || session.expiresAt < new Date()) return null

    const newTokens = generateTokens(session.user)

    // Rotate: delete old session, create new
    await prisma.$transaction([
      prisma.session.delete({ where: { id: session.id } }),
      prisma.session.create({
        data: {
          userId: session.userId,
          token: newTokens.accessToken,
          refreshToken: newTokens.refreshToken,
          ipAddress: session.ipAddress,
          userAgent: session.userAgent,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      }),
    ])

    return newTokens
  } catch {
    return null
  }
}