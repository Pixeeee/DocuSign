// apps/api/src/routes/auth-check.ts
// Lightweight endpoints for auth form validation

import { Request, Response, Router } from 'express'
import { z } from 'zod'
import { prisma } from '@esign/db'
import { redis } from '@esign/utils/redis'

const router = Router()

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CHECK EMAIL AVAILABILITY (for registration form)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Usage: GET /api/auth/check-email?email=user@example.com
// Response: { available: boolean }
// Caching: 60 second Redis cache
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const EMAIL_CHECK_CACHE_PREFIX = 'email:check:'
const EMAIL_CHECK_CACHE_TTL = 60 // 1 minute

router.get('/check-email', async (req: Request, res: Response) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.query)
    const emailLower = email.toLowerCase()

    // Try cache first (instant response)
    try {
      const cached = await redis.get(`${EMAIL_CHECK_CACHE_PREFIX}${emailLower}`)
      if (cached !== null) {
        const available = cached === 'true'
        return res.json({ available, cached: true })
      }
    } catch (error) {
      console.warn('[Auth] Redis cache check failed:', error)
    }

    // Check database (index on email makes this fast)
    const existing = await prisma.user.findUnique({
      where: { email: emailLower },
      select: { id: true },
    })

    const available = !existing

    // Cache result
    try {
      await redis.setex(
        `${EMAIL_CHECK_CACHE_PREFIX}${emailLower}`,
        EMAIL_CHECK_CACHE_TTL,
        available.toString()
      )
    } catch (error) {
      console.warn('[Auth] Failed to cache email check:', error)
    }

    res.json({ available, cached: false })
  } catch (error) {
    console.error('[Auth] Email check error:', error)
    res.status(400).json({ error: 'Invalid email' })
  }
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PASSWORD STRENGTH CHECK (for registration form)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Usage: POST /api/auth/check-password
// Request: { password: string }
// Response: { score: number, feedback: string[] }
// No caching (runs client-side for instant feedback)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface PasswordCheckResult {
  score: 0 | 1 | 2 | 3 | 4
  strength: 'very-weak' | 'weak' | 'fair' | 'good' | 'strong'
  feedback: string[]
}

function checkPasswordStrength(password: string): PasswordCheckResult {
  const feedback: string[] = []
  let score = 0

  // Length
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (password.length >= 16) score++
  else feedback.push('Use at least 12 characters')

  // Uppercase
  if (/[A-Z]/.test(password)) score++
  else feedback.push('Include uppercase letters')

  // Lowercase
  if (/[a-z]/.test(password)) score++
  else feedback.push('Include lowercase letters')

  // Numbers
  if (/[0-9]/.test(password)) score++
  else feedback.push('Include numbers')

  // Special characters
  if (/[^A-Za-z0-9]/.test(password)) score++
  else feedback.push('Include special characters (!@#$%^&*)')

  // Common patterns
  if (!/(.)\1{2,}/.test(password)) score++
  else feedback.push('Avoid repeating characters')

  // Map score to strength
  const strengthMap: Array<'very-weak' | 'weak' | 'fair' | 'good' | 'strong'> = [
    'very-weak',
    'very-weak',
    'weak',
    'fair',
    'good',
    'strong',
  ]

  return {
    score: Math.min(score, 4) as 0 | 1 | 2 | 3 | 4,
    strength: strengthMap[Math.min(score, 5)],
    feedback,
  }
}

router.post('/check-password', async (req: Request, res: Response) => {
  try {
    const { password } = z.object({ password: z.string() }).parse(req.body)

    const result = checkPasswordStrength(password)

    res.json(result)
  } catch (error) {
    console.error('[Auth] Password check error:', error)
    res.status(400).json({ error: 'Invalid request' })
  }
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HEALTH CHECK (for monitoring)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get('/health', async (req: Request, res: Response) => {
  try {
    // Check DB connection
    await prisma.user.count()

    // Check Redis connection
    await redis.ping()

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Auth] Health check failed:', error)
    res.status(503).json({
      status: 'degraded',
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

export default router
