import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const STORAGE_DIR = path.join(process.cwd(), '.storage', 'uploads')
const STORAGE_ROOT = path.resolve(STORAGE_DIR)

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true })
  console.log(`✓ [Local Storage] Created directory: ${STORAGE_DIR}`)
}

function getDownloadSecret(): string {
  const secret = process.env.DOWNLOAD_URL_SECRET || process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET
  if (!secret) {
    throw new Error('DOWNLOAD_URL_SECRET, NEXTAUTH_SECRET, or JWT_SECRET must be set for local download URLs')
  }
  return secret
}

function signDownloadToken(s3Key: string, expiresAt: number): string {
  return crypto
    .createHmac('sha256', getDownloadSecret())
    .update(`${s3Key}.${expiresAt}`)
    .digest('hex')
}

function safeEquals(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a, 'hex')
  const bBuffer = Buffer.from(b, 'hex')
  return aBuffer.length === bBuffer.length && crypto.timingSafeEqual(aBuffer, bBuffer)
}

function resolveStoragePath(s3Key: string): string {
  if (!s3Key || path.isAbsolute(s3Key)) {
    throw new Error('Invalid storage key')
  }

  const filePath = path.resolve(STORAGE_ROOT, s3Key)
  if (filePath !== STORAGE_ROOT && !filePath.startsWith(`${STORAGE_ROOT}${path.sep}`)) {
    throw new Error('Invalid storage key')
  }

  return filePath
}

export function verifyLocalDownloadToken(
  s3Key: string,
  expiresAt: number,
  token: string
): boolean {
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false
  if (!/^[0-9a-f]{64}$/i.test(token)) return false
  return safeEquals(signDownloadToken(s3Key, expiresAt), token)
}

/**
 * Upload a file buffer to local file system
 */
export async function uploadToLocalStorage(
  buffer: Buffer,
  originalName: string,
  contentType = 'application/pdf',
  folder = 'documents'
): Promise<{ s3Key: string; size: number }> {
  const uniqueId = crypto.randomBytes(16).toString('hex')
  const sanitizedName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const s3Key = `${folder}/${new Date().getFullYear()}/${uniqueId}-${sanitizedName}`

  // Create folder structure
  const filePath = resolveStoragePath(s3Key)
  const fileDir = path.dirname(filePath)

  if (!fs.existsSync(fileDir)) {
    fs.mkdirSync(fileDir, { recursive: true })
  }

  // Write file
  fs.writeFileSync(filePath, buffer)

  console.log(`✓ [Local Storage] Uploaded: ${s3Key}`)

  return { s3Key, size: buffer.length }
}

/**
 * Download a file from local storage
 */
export async function downloadFromLocalStorage(s3Key: string): Promise<Buffer> {
  const filePath = resolveStoragePath(s3Key)

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${s3Key}`)
  }

  return fs.readFileSync(filePath)
}

/**
 * Delete a file from local storage
 */
export async function deleteFromLocalStorage(s3Key: string): Promise<void> {
  const filePath = resolveStoragePath(s3Key)

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
    console.log(`✓ [Local Storage] Deleted: ${s3Key}`)
  }
}

/**
 * Get signed URL for download (returns full URL for local storage)
 */
export async function getSignedUrlForLocalStorage(
  s3Key: string,
  expiresIn = 3600
): Promise<string> {
  // Build full URL with protocol and host from API_URL environment variable
  const apiUrl = (process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '')
  const expiresAt = Date.now() + expiresIn * 1000
  const token = signDownloadToken(s3Key, expiresAt)
  const downloadUrl = `${apiUrl}/api/documents/download?key=${encodeURIComponent(s3Key)}&expires=${expiresAt}&token=${token}`
  console.log(`[Local Storage] Generated presigned URL:`, downloadUrl)
  return downloadUrl
}

/**
 * Check if file exists
 */
export async function fileExistsInLocalStorage(s3Key: string): Promise<boolean> {
  const filePath = resolveStoragePath(s3Key)
  return fs.existsSync(filePath)
}
