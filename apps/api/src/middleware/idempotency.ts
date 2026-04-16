import { Request, Response, NextFunction } from 'express'
import { getIdempotency, setIdempotency } from '@esign/utils'
import { v4 as uuidv4 } from 'uuid'

/**
 * Idempotency middleware — prevents duplicate payments/signatures
 * Client sends: X-Idempotency-Key header
 */
export async function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Only apply to state-mutating methods
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
    return next()
  }

  const idempotencyKey = req.headers['x-idempotency-key'] as string

  if (!idempotencyKey) {
    // Generate one automatically for payments route
    if (req.path.includes('/payments') || req.path.includes('/sign')) {
      req.headers['x-idempotency-key'] = uuidv4()
      return next()
    }
    return next()
  }

  // Validate format (UUID)
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidPattern.test(idempotencyKey)) {
    return res.status(400).json({ error: 'X-Idempotency-Key must be a valid UUID' })
  }

  // Check if we've seen this key before
  const cached = await getIdempotency<{ status: number; body: object }>(idempotencyKey)

  if (cached) {
    // Return the cached response
    return res.status(cached.status).json({
      ...cached.body,
      _idempotent: true,
    })
  }

  // Intercept response to cache it
  const originalJson = res.json.bind(res)
  res.json = function (body) {
    if (res.statusCode < 500) {
      setIdempotency(idempotencyKey, { status: res.statusCode, body }, 86400)
        .catch(console.error)
    }
    return originalJson(body)
  }

  next()
}