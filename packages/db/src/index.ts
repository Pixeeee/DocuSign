import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

// Validate DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  throw new Error('❌ DATABASE_URL environment variable is not set. Cannot initialize database.')
}

console.log('✓ [DB] DATABASE_URL is set, initializing pool...')

function getRuntimeDatabaseUrl(databaseUrl: string): string {
  try {
    const parsed = new URL(databaseUrl)
    parsed.searchParams.delete('pgbouncer')
    return parsed.toString()
  } catch {
    return databaseUrl
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const poolMax = Number.parseInt(process.env.DB_POOL_MAX || '5', 10)
const runtimeDatabaseUrl = getRuntimeDatabaseUrl(process.env.DATABASE_URL)

const pool = new Pool({
  connectionString: runtimeDatabaseUrl,
  max: Number.isFinite(poolMax) && poolMax > 0 ? poolMax : 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // Increased from 2s to 10s
  statement_timeout: 30000, // Add statement timeout
  application_name: 'esign-api',
})

pool.on('error', (err) => {
  console.error('🔌 [DB Pool] Connection error:', err.message)
  console.error('🔌 [DB Pool] Code:', (err as any).code)
})

pool.on('connect', () => {
  console.log('🔌 [DB Pool] New client connected')
})

pool.on('remove', () => {
  console.log('🔌 [DB Pool] Client removed from pool')
})

const adapter = new PrismaPg(pool)

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

// Explicitly export from @prisma/client to avoid Next.js CommonJS module warnings
export { PrismaClient, type Prisma } from '@prisma/client'
export type { User, Team, TeamMember, Document, SigningField, Signature, Payment, Subscription, Session, ApiKey } from '@prisma/client'
export { Role, PlanType, DocumentStatus, SignatureStatus, PaymentStatus, PaymentType, AuditAction } from '@prisma/client'

export default prisma
