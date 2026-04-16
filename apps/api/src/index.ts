// ─── MUST be first: Load environment variables ─────────────────
import 'express-async-errors'
import dotenv from 'dotenv'
import path from 'path'

// Try to load from .env.local (local development)
// On Render/production, env vars are provided by the platform
const envPath = path.join(process.cwd(), '.env.local')
const envResult = dotenv.config({ path: envPath })

console.log(`[dotenv] Loading from: ${envPath}`)
console.log(`[dotenv] DATABASE_URL set: ${!!process.env.DATABASE_URL}`)
console.log(`[dotenv] REDIS_URL set: ${!!process.env.REDIS_URL}`)
console.log(`[dotenv] Environment: ${process.env.NODE_ENV || 'development'}`)
console.log(`[dotenv] Parsed keys: ${Object.keys(envResult.parsed || {}).join(', ')}`)

// Wait for DATABASE_URL to be available (with retries for Render deployment)
async function waitForDatabase() {
  const maxRetries = 30 // 30 seconds total (1 second per retry)
  let retries = 0

  while (!process.env.DATABASE_URL && retries < maxRetries) {
    if (retries === 0) {
      console.log('[startup] Waiting for DATABASE_URL to be set by Render...')
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
    retries++
    
    // Reload dotenv in case it's been set now
    dotenv.config({ path: envPath })
  }

  if (!process.env.DATABASE_URL) {
    console.error('❌ CRITICAL: DATABASE_URL not found after 30 second timeout!')
    if (envResult.error) {
      console.error(`   .env.local not found: ${envResult.error.message}`)
    }
    console.error('   Manually set DATABASE_URL or link database in Render dashboard.')
    process.exit(1)
  }

  console.log('[startup] ✅ DATABASE_URL is now available')
}

import express, { Application, Request, Response, NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import { rateLimit } from 'express-rate-limit'
import { RedisStore } from 'rate-limit-redis'
import { getRedis, isRedisAvailable } from '@esign/utils'
import { logger } from '@esign/utils/logger'

const app = express() as any
const PORT = process.env.PORT || 4000

// Routes will be loaded dynamically inside the async startup function
let authRoutes: any
let documentRoutes: any
let signatureRoutes: any
let paymentRoutes: any
let teamRoutes: any
let userRoutes: any
let webhookRoutes: any
let requestRoutes: any

// ─── Security Middleware ───────────────────────────────────────

app.set('trust proxy', 1)

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}))

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key', 'X-API-Key', 'X-Payment', 'X-Skip-Payment'],
}))

app.use(compression())

// ─── Body Parsers ──────────────────────────────────────────────

// Webhooks need raw body
app.use('/api/webhooks', express.raw({ type: 'application/json' }))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// ─── Global Rate Limiting ──────────────────────────────────────

const redis = getRedis()

// Use Redis store if available, otherwise use in-memory (default)
const globalLimiterConfig: any = {
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 min
  max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Too many requests. Please try again later.',
    retryAfter: 15,
  },
}

if (isRedisAvailable()) {
  globalLimiterConfig.store = new RedisStore({
    sendCommand: (...args: any[]) => (redis.call as any)(...args) as any,
  })
}

const globalLimiter = rateLimit(globalLimiterConfig)

const authLimiterConfig: any = {
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
}

if (isRedisAvailable()) {
  authLimiterConfig.store = new RedisStore({
    sendCommand: (...args: any[]) => (redis.call as any)(...args) as any,
    prefix: 'rl:auth:',
  })
}

const authLimiter = rateLimit(authLimiterConfig)

app.use('/api/', globalLimiter as any)
app.use('/api/auth/', authLimiter as any)

// ─── Async Startup ─────────────────────────────────────────────

async function startServer() {
  try {
    // Dynamically import routes AFTER dotenv is loaded
    authRoutes = (await import('./routes/auth')).default
    documentRoutes = (await import('./routes/documents')).default
    signatureRoutes = (await import('./routes/signatures')).default
    paymentRoutes = (await import('./routes/payments')).default
    teamRoutes = (await import('./routes/teams')).default
    userRoutes = (await import('./routes/users')).default
    webhookRoutes = (await import('./routes/webhooks')).default
    requestRoutes = (await import('./routes/requests')).default

    console.log('✓ All routes imported successfully')

    // ───────────── Register Routes ─────────────────────

    app.use('/api/auth', authRoutes)
    app.use('/api/users', userRoutes)
    app.use('/api/documents', documentRoutes)
    app.use('/api/signatures', signatureRoutes)
    app.use('/api/payments', paymentRoutes)
    app.use('/api/teams', teamRoutes)
    app.use('/api/webhooks', webhookRoutes)
    app.use('/api/requests', requestRoutes)

    app.get('/api/health', (_req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version,
      })
    })

    // ───────────── Error Handler ──────────────────────

    app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
      logger.error('Unhandled error', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
        ip: req.ip,
      })

      if (res.headersSent) return

      const statusCode = (err as any).statusCode || 500
      res.status(statusCode).json({
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
      })
    })

    // ───────────── Start Listening ────────────────────

    app.listen(PORT, () => {
      logger.info(`ESIGN API running on port ${PORT}`)
      logger.info(`Environment: ${process.env.NODE_ENV}`)
    })
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

// Initialize: Wait for DATABASE_URL, then start server
(async () => {
  try {
    await waitForDatabase()
    await startServer()
  } catch (error) {
    console.error('Fatal startup error:', error)
    process.exit(1)
  }
})()