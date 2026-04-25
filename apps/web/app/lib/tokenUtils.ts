/**
 * Token management utilities
 * Handles automatic token refresh before expiry
 */

export interface StoredToken {
  token: string
  expiresAt: number
}

/**
 * Decode JWT payload without verification (client-side only)
 */
export function decodeToken(token: string): any {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    
    const decoded = JSON.parse(
      Buffer.from(parts[1], 'base64').toString('utf-8')
    )
    return decoded
  } catch (error) {
    console.error('[TokenUtils] Failed to decode token:', error)
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
    
    // exp is in seconds, convert to milliseconds
    return decoded.exp * 1000
  } catch (error) {
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
  } catch (error) {
    return false
  }
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
 * Get current access token from session or storage
 */
export function getAccessToken(session: any): string {
  // Check session first (client-side only)
  if (typeof window !== 'undefined' && session?.user?.accessToken) {
    return session.user.accessToken
  }
  
  // Fall back to localStorage
  if (typeof window !== 'undefined') {
    return localStorage.getItem('accessToken') || ''
  }
  
  return ''
}

/**
 * Get current refresh token from storage
 */
export function getRefreshToken(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('refreshToken') || ''
  }
  return ''
}

/**
 * Store tokens in localStorage
 */
export function storeTokens(accessToken: string, refreshToken: string): void {
  if (typeof window !== 'undefined') {
    if (accessToken) localStorage.setItem('accessToken', accessToken)
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken)
  }
}

/**
 * Clear tokens from storage
 */
export function clearTokens(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
  }
}
