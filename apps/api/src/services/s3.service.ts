import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import crypto from 'crypto'
import { logger } from '@esign/utils/logger'

// Use local storage in development or when explicitly forced
import {
  uploadToLocalStorage,
  downloadFromLocalStorage,
  deleteFromLocalStorage,
  getSignedUrlForLocalStorage,
  fileExistsInLocalStorage,
} from './local-storage.service'

const USE_LOCAL_STORAGE =
  process.env.NODE_ENV === 'development' ||
  process.env.FORCE_LOCAL_STORAGE === 'true'

const awsCredentials =
  process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  ...(awsCredentials ? { credentials: awsCredentials } : {}),
  // Use custom endpoint for MinIO/LocalStack during local development
  ...(process.env.AWS_S3_ENDPOINT ? {
    endpoint: process.env.AWS_S3_ENDPOINT,
    forcePathStyle: true, // Required for MinIO
  } : {}),
})

const BUCKET = process.env.AWS_S3_BUCKET
const KMS_KEY_ID = process.env.AWS_KMS_KEY_ID

if (!USE_LOCAL_STORAGE && !BUCKET) {
  throw new Error('Missing AWS_S3_BUCKET environment variable. Configure AWS_S3_BUCKET for S3 uploads.')
}

/**
 * Upload a file buffer to S3 with SSE-KMS encryption (or local storage in dev)
 */
export async function uploadToS3(
  buffer: Buffer,
  originalName: string,
  contentType = 'application/pdf',
  folder = 'documents'
): Promise<{ s3Key: string; size: number }> {
  if (USE_LOCAL_STORAGE) {
    return uploadToLocalStorage(buffer, originalName, contentType, folder)
  }

  const uniqueId = crypto.randomBytes(16).toString('hex')
  const sanitizedName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const s3Key = `${folder}/${new Date().getFullYear()}/${uniqueId}-${sanitizedName}`

  const command = new PutObjectCommand({
    Bucket: BUCKET!,
    Key: s3Key,
    Body: buffer,
    ContentType: contentType,
    ServerSideEncryption: KMS_KEY_ID ? 'aws:kms' : 'AES256',
    SSEKMSKeyId: KMS_KEY_ID,
    Metadata: {
      'uploaded-at': new Date().toISOString(),
      'original-name': sanitizedName,
    },
  })

  try {
    await s3Client.send(command)
  } catch (error) {
    logger.error('S3 upload failed', {
      bucket: BUCKET,
      region: process.env.AWS_REGION || 'us-east-1',
      kmsKeyId: process.env.AWS_KMS_KEY_ID,
      forceLocal: process.env.FORCE_LOCAL_STORAGE === 'true',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    throw error
  }

  return { s3Key, size: buffer.length }
}

/**
 * Get a pre-signed download URL (15 minute expiry)
 */
export async function getPresignedDownloadUrl(
  s3Key: string,
  expiresInSeconds = 900
): Promise<string> {
  if (USE_LOCAL_STORAGE) {
    return getSignedUrlForLocalStorage(s3Key, expiresInSeconds)
  }

  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
    ResponseContentDisposition: 'attachment',
  })

  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds })
}

/**
 * Download file from S3 as Buffer
 */
export async function downloadFromS3(s3Key: string): Promise<Buffer> {
  if (USE_LOCAL_STORAGE) {
    return downloadFromLocalStorage(s3Key)
  }

  const command = new GetObjectCommand({ Bucket: BUCKET, Key: s3Key })
  const response = await s3Client.send(command)

  const chunks: Uint8Array[] = []
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

/**
 * Delete object from S3
 */
export async function deleteFromS3(s3Key: string): Promise<void> {
  if (USE_LOCAL_STORAGE) {
    return deleteFromLocalStorage(s3Key)
  }

  const command = new DeleteObjectCommand({ Bucket: BUCKET, Key: s3Key })
  await s3Client.send(command)
}

/**
 * Check if object exists in S3
 */
export async function existsInS3(s3Key: string): Promise<boolean> {
  if (USE_LOCAL_STORAGE) {
    return fileExistsInLocalStorage(s3Key)
  }

  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: s3Key }))
    return true
  } catch {
    return false
  }
}