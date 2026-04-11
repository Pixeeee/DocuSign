import Redis from 'ioredis'

type MemoryStoreEntry = {
  value: string
  expiresAt: number
}

let redisClient: Redis | null = null
let redisAvailable = false
const memoryStore = new Map<string, MemoryStoreEntry>()

const memoryCleanupInterval = setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of memoryStore) {
    if (entry.expiresAt <= now) {
      memoryStore.delete(key)
    }
  }
}, 60_000)

memoryCleanupInterval.unref?.()

export function getRedis(): Redis {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
    const redisPassword = process.env.REDIS_PASSWORD

    if (!process.env.REDIS_URL) {
      console.warn('[Redis] REDIS_URL not set; defaulting to localhost fallback')
    }

    try {
      redisClient = new Redis(redisUrl, {
        password: redisPassword,
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => {
          if (times > 3) {
            console.warn('[Redis] Redis unavailable after 3 retries, will use in-memory fallback')
            redisAvailable = false
            return null // Stop retrying
          }
          return Math.min(times * 100, 3000)
        },
        lazyConnect: false,
        enableReadyCheck: false,
        enableOfflineQueue: false,
      })

      redisClient.on('error', (err: Error) => {
        redisAvailable = false
        console.warn('[Redis] Connection error (will use fallback):', err.message)
      })

      redisClient.on('connect', () => {
        redisAvailable = true
        console.log('[Redis] Connected successfully')
      })
    } catch (err) {
      console.warn('[Redis] Failed to create client, will use in-memory fallback')
      redisAvailable = false
    }
  }
  return redisClient as Redis
}

export function isRedisAvailable(): boolean {
  return redisAvailable && redisClient !== null
}

// ─── Session helpers ───────────────────────────────────────────

export async function setSession(key: string, value: object, ttlSeconds = 900) {
  const expiresAt = Date.now() + ttlSeconds * 1000

  if (!isRedisAvailable()) {
    memoryStore.set(`session:${key}`, {
      value: JSON.stringify(value),
      expiresAt,
    })
    return
  }

  const redis = getRedis()
  await redis.setex(`session:${key}`, ttlSeconds, JSON.stringify(value))
}

export async function getSession<T>(key: string): Promise<T | null> {
  if (!isRedisAvailable()) {
    const entry = memoryStore.get(`session:${key}`)
    if (!entry || entry.expiresAt <= Date.now()) {
      memoryStore.delete(`session:${key}`)
      return null
    }
    return JSON.parse(entry.value) as T
  }

  const redis = getRedis()
  const data = await redis.get(`session:${key}`)
  return data ? JSON.parse(data) : null
}

export async function deleteSession(key: string) {
  if (!isRedisAvailable()) {
    memoryStore.delete(`session:${key}`)
    return
  }

  const redis = getRedis()
  await redis.del(`session:${key}`)
}

// ─── Idempotency helpers ───────────────────────────────────────

export async function setIdempotency(key: string, value: object, ttlSeconds = 86400) {
  const expiresAt = Date.now() + ttlSeconds * 1000

  if (!isRedisAvailable()) {
    memoryStore.set(`idempotency:${key}`, {
      value: JSON.stringify(value),
      expiresAt,
    })
    return
  }

  const redis = getRedis()
  await redis.setex(`idempotency:${key}`, ttlSeconds, JSON.stringify(value))
}

export async function getIdempotency<T>(key: string): Promise<T | null> {
  if (!isRedisAvailable()) {
    const entry = memoryStore.get(`idempotency:${key}`)
    if (!entry || entry.expiresAt <= Date.now()) {
      memoryStore.delete(`idempotency:${key}`)
      return null
    }
    return JSON.parse(entry.value) as T
  }

  const redis = getRedis()
  const data = await redis.get(`idempotency:${key}`)
  return data ? JSON.parse(data) : null
}

// ─── Blacklist token (logout) ──────────────────────────────────

export async function blacklistToken(token: string, ttlSeconds: number) {
  if (!isRedisAvailable()) {
    memoryStore.set(`blacklist:${token}`, {
      value: '1',
      expiresAt: Date.now() + ttlSeconds * 1000,
    })
    return
  }

  const redis = getRedis()
  await redis.setex(`blacklist:${token}`, ttlSeconds, '1')
}

export async function isTokenBlacklisted(token: string): Promise<boolean> {
  if (!isRedisAvailable()) {
    const entry = memoryStore.get(`blacklist:${token}`)
    if (!entry || entry.expiresAt <= Date.now()) {
      memoryStore.delete(`blacklist:${token}`)
      return false
    }
    return true
  }

  const redis = getRedis()
  const val = await redis.get(`blacklist:${token}`)
  return val !== null
}

// ─── Rate limit key ────────────────────────────────────────────

export function rateLimitKey(prefix: string, identifier: string) {
  return `ratelimit:${prefix}:${identifier}`
}