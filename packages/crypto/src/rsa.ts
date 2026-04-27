import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

function normalizePemKey(key: string): string {
  return key.replace(/\\n/g, '\n')
}

function loadKey(keyEnv: string | undefined, pathEnv: string | undefined, defaultPaths: string[]): string {
  if (keyEnv) {
    return normalizePemKey(keyEnv)
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

  throw new Error(
    `RSA key not found. Set JWT_PRIVATE_KEY or JWT_PRIVATE_KEY_PATH (or ensure one of ${defaultPaths.join(', ')} exists).`
  )
}

function getPrivateKey(): string {
  return loadKey(process.env.JWT_PRIVATE_KEY, process.env.JWT_PRIVATE_KEY_PATH, [
    './keys/jwt_private.pem',
    './keys/private.pem',
  ])
}

function getPublicKey(): string {
  return loadKey(process.env.JWT_PUBLIC_KEY, process.env.JWT_PUBLIC_KEY_PATH, [
    './keys/jwt_public.pem',
    './keys/public.pem',
  ])
}

/**
 * Sign data with RSA-2048 private key, returns base64 signature
 */
export function rsaSign(data: string): string {
  const privateKey = getPrivateKey()
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(data)
  sign.end()
  return sign.sign(privateKey, 'base64')
}

/**
 * Verify RSA-2048 signature with public key
 */
export function rsaVerify(data: string, signature: string): boolean {
  try {
    const publicKey = getPublicKey()
    const verify = crypto.createVerify('RSA-SHA256')
    verify.update(data)
    verify.end()
    return verify.verify(publicKey, signature, 'base64')
  } catch {
    return false
  }
}

/**
 * Generate a new RSA-2048 key pair programmatically
 */
export function generateRsaKeyPair(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  return { privateKey, publicKey }
}
