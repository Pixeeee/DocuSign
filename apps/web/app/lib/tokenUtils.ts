/**
 * Token management utilities.
 * Refresh tokens stay in the server-side NextAuth JWT and are not persisted
 * in browser storage.
 */

export interface StoredToken {
  token: string
  expiresAt: number
}

/**
 * Decode JWT payload without verification (client-side only)
 */
export function decodeToken(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const paddedPayload = payload.padEnd(payload.length + (4 - payload.length % 4) % 4, '=')
    const decodedText =
      typeof window !== 'undefined'
        ? decodeURIComponent(
            atob(paddedPayload)
              .split('')
              .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
              .join('')
          )
        : Buffer.from(paddedPayload, 'base64').toString('utf-8')

    const decoded = JSON.parse(decodedText)
    return decoded
  } catch {
    return null
  }
}

/**
 * Get token expiry time in milliseconds
 */
export function getTokenExpiryMs(token: string): number | null {
  try {
    const decoded = decodeToken(token)
    if (!decoded?.exp) return null
    if (typeof decoded.exp !== 'number') return null
    
    // exp is in seconds, convert to milliseconds
    return decoded.exp * 1000
  } catch {
    return null
  }
}

/**
 * Check if token will expire within specified time
 */
export function willTokenExpireSoon(token: string, withinMs = 5 * 60 * 1000): boolean {
  try {
    const expiryMs = getTokenExpiryMs(token)
    if (!expiryMs) return false
    
    const now = Date.now()
    return expiryMs - now <= withinMs
  } catch {
    return false
  }
}

function isTokenExpired(token: string): boolean {
  const expiryMs = getTokenExpiryMs(token)
  return !!expiryMs && expiryMs <= Date.now()
}

function pickFreshestToken(...tokens: Array<string | undefined | null>): string {
  return tokens
    .filter((token): token is string => !!token && !isTokenExpired(token))
    .sort((a, b) => (getTokenExpiryMs(b) || 0) - (getTokenExpiryMs(a) || 0))[0] || ''
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(
  refreshToken: string,
  apiUrl: string
): Promise<{ accessToken: string; refreshToken: string } | null> {
  try {
    const response = await fetch(`${apiUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })

    if (!response.ok) {
      console.warn('[TokenUtils] Token refresh failed:', response.status)
      return null
    }

    const data = await response.json()
    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    }
  } catch (error) {
    console.error('[TokenUtils] Token refresh error:', error)
    return null
  }
}

/**
 * Get current access token from the active NextAuth session.
 */
export function getAccessToken(session: { user?: { accessToken?: string | null } } | null | undefined): string {
  return pickFreshestToken(session?.user?.accessToken)
}

/**
 * Refresh tokens are intentionally unavailable to client components.
 */
export function getRefreshToken(): string {
  return ''
}

/**
 * No-op kept for existing call sites while token storage is migrated.
 */
export function storeTokens(_accessToken: string, _refreshToken: string): void {
  void _accessToken
  void _refreshToken
  return
}

/**
 * No browser token storage is used.
 */
export function clearTokens(): void {
  return
}
