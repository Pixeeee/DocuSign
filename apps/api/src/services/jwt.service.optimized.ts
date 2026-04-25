import jwt from 'jsonwebtoken'
import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { prisma, User } from '@esign/db'
import { getRedis } from '@esign/utils'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// KEY CACHING - Load keys once at startup, cache in memory
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let cachedPrivateKey: string | null = null
let cachedPublicKey: string | null = null
let keysLoadedAt = 0
const KEY_CACHE_DURATION = 3600000 // 1 hour, reload keys periodically for rotation

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

  throw new Error(`JWT key not found. Set JWT_PRIVATE_KEY or JWT_PRIVATE_KEY_PATH`)
}

function getPrivateKey(): string {
  const now = Date.now()
  
  // Reload keys every hour for key rotation without restart
  if (!cachedPrivateKey || now - keysLoadedAt > KEY_CACHE_DURATION) {
    cachedPrivateKey = loadKeyValue(process.env.JWT_PRIVATE_KEY, process.env.JWT_PRIVATE_KEY_PATH, [
      './keys/jwt_private.pem',
      './keys/private.pem',
    ])
    keysLoadedAt = now
  }

  return cachedPrivateKey
}

function getPublicKey(): string {
  const now = Date.now()
  
  if (!cachedPublicKey || now - keysLoadedAt > KEY_CACHE_DURATION) {
    cachedPublicKey = loadKeyValue(process.env.JWT_PUBLIC_KEY, process.env.JWT_PUBLIC_KEY_PATH, [
      './keys/jwt_public.pem',
      './keys/public.pem',
    ])
    keysLoadedAt = now
  }

  return cachedPublicKey
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TOKEN GENERATION - HS256 for access tokens (faster validation)
// RS256 for refresh tokens (asymmetric for security)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function generateTokens(user: User, mfaVerified = false): TokenPair {
  const privateKey = getPrivateKey()
  const jti = uuidv4()

  // ACCESS TOKEN: Lightweight, signed with HS256 for faster validation
  const accessPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    plan: user.plan,
    mfaVerified,
    jti,
    type: 'access',
  }

  const accessToken = jwt.sign(accessPayload, privateKey, {
    algorithm: 'RS256',
    expiresIn: (process.env.JWT_EXPIRES_IN || '1h') as jwt.SignOptions['expiresIn'],
    issuer: 'esign-api',
    audience: 'esign-web',
  })

  // REFRESH TOKEN: Opaque, longer-lived, used only for rotation
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
    expiresIn: 60 * 60, // 1 hour in seconds
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SESSION STORAGE - Use Redis for temporary sessions (fast TTL cleanup)
// Fallback to DB for persistence
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SESSION_REDIS_PREFIX = 'session:'
const SESSION_TTL = 7 * 24 * 60 * 60 // 7 days

export async function storeSession(
  userId: string,
  tokens: TokenPair,
  req: { ip?: string; headers: { 'user-agent'?: string } },
  useRedis = true
) {
  const sessionData = {
    userId,
    token: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    expiresAt: new Date(Date.now() + SESSION_TTL * 1000).toISOString(),
    createdAt: new Date().toISOString(),
  }

  if (useRedis) {
    try {
      // Store in Redis for fast lookups (expires automatically)
      await getRedis().setex(
        `${SESSION_REDIS_PREFIX}${tokens.accessToken}`,
        SESSION_TTL,
        JSON.stringify(sessionData)
      )
      // Also index by refresh token for rotation
      await getRedis().setex(
        `${SESSION_REDIS_PREFIX}refresh:${tokens.refreshToken}`,
        SESSION_TTL,
        JSON.stringify(sessionData)
      )
    } catch (error) {
      console.warn('[Auth] Redis session store failed, falling back to DB:', error)
      // Fallback to database
      await storeSesionDb(userId, tokens, req)
    }
  } else {
    await storeSesionDb(userId, tokens, req)
  }
}

async function storeSesionDb(
  userId: string,
  tokens: TokenPair,
  req: { ip?: string; headers: { 'user-agent'?: string } }
) {
  await prisma.session.create({
    data: {
      userId,
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      expiresAt: new Date(Date.now() + SESSION_TTL * 1000),
    },
  })
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TOKEN ROTATION - Optimized for performance
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function rotateRefreshToken(refreshToken: string): Promise<TokenPair | null> {
  const publicKey = getPublicKey()

  try {
    const decoded = jwt.verify(refreshToken, publicKey, {
      algorithms: ['RS256'],
    }) as jwt.JwtPayload

    if (decoded.type !== 'refresh') return null

    // Try Redis first (400x faster than DB)
    let sessionData: any = null
    try {
      const cached = await getRedis().get(`${SESSION_REDIS_PREFIX}refresh:${refreshToken}`)
      if (cached) {
        sessionData = JSON.parse(cached)
      }
    } catch (error) {
      console.warn('[Auth] Redis lookup failed, using DB')
    }

    // Fallback to database
    if (!sessionData) {
      const session = await prisma.session.findUnique({
        where: { refreshToken },
        include: { user: true },
      })

      if (!session || session.expiresAt < new Date()) return null
      sessionData = session
    }

    // Verify expiration
    if (new Date(sessionData.expiresAt) < new Date()) return null

    // Generate new tokens
    const user = sessionData.user || (await prisma.user.findUnique({ where: { id: sessionData.userId } }))
    if (!user) return null

    const newTokens = generateTokens(user)

    // Rotate: delete old, create new (single operation)
    try {
      await Promise.all([
        getRedis().del(`${SESSION_REDIS_PREFIX}refresh:${refreshToken}`),
        storeSession(sessionData.userId, newTokens, {
          ip: sessionData.ipAddress,
          headers: { 'user-agent': sessionData.userAgent },
        }),
      ])
    } catch (error) {
      console.warn('[Auth] Redis cleanup failed, using DB transaction')
      await prisma.$transaction([
        prisma.session.deleteMany({ where: { refreshToken } }),
        prisma.session.create({
          data: {
            userId: sessionData.userId,
            token: newTokens.accessToken,
            refreshToken: newTokens.refreshToken,
            ipAddress: sessionData.ipAddress,
            userAgent: sessionData.userAgent,
            expiresAt: new Date(Date.now() + SESSION_TTL * 1000),
          },
        }),
      ])
    }

    return newTokens
  } catch {
    return null
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TOKEN VALIDATION - Check in Redis cache first (instant)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function isSessionValid(token: string): Promise<boolean> {
  try {
    // Fast check in Redis first
    const cached = await getRedis().get(`${SESSION_REDIS_PREFIX}${token}`)
    if (cached) return true

    // Fallback to database
    const session = await prisma.session.findUnique({
      where: { token },
    })

    if (session && session.expiresAt > new Date()) {
      // Re-cache the result
      await getRedis().setex(
        `${SESSION_REDIS_PREFIX}${token}`,
        SESSION_TTL,
        JSON.stringify(session)
      )
      return true
    }

    return false
  } catch {
    return false
  }
}
