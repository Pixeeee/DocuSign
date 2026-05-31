import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

function getKey(): Buffer {
  const key = process.env.AES_ENCRYPTION_KEY
  if (!key) throw new Error('AES_ENCRYPTION_KEY not set')
  if (!/^[0-9a-f]{64}$/i.test(key)) {
    throw new Error('AES_ENCRYPTION_KEY must be 64 hex characters (32 bytes)')
  }
  return Buffer.from(key, 'hex')
}

export interface EncryptedPayload {
  ciphertext: string   // base64
  iv: string           // base64
  authTag: string      // base64
}

export function encrypt(plaintext: string): EncryptedPayload {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  
  let ciphertext = cipher.update(plaintext, 'utf8', 'base64')
  ciphertext += cipher.final('base64')
  const authTag = cipher.getAuthTag()

  return {
    ciphertext,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  }
}

export function decrypt(payload: EncryptedPayload): string {
  const key = getKey()
  const iv = Buffer.from(payload.iv, 'base64')
  const authTag = Buffer.from(payload.authTag, 'base64')
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  
  let plaintext = decipher.update(payload.ciphertext, 'base64', 'utf8')
  plaintext += decipher.final('utf8')
  return plaintext
}

export function encryptToString(plaintext: string): string {
  const payload = encrypt(plaintext)
  return JSON.stringify(payload)
}

export function decryptFromString(encryptedString: string): string {
  const payload: EncryptedPayload = JSON.parse(encryptedString)
  return decrypt(payload)
}
