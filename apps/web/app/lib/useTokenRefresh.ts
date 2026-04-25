/**
 * useTokenRefresh Hook
 * Automatically refreshes access token before expiry
 */

'use client'

import { useEffect, useRef, useCallback } from 'react'
import {
  willTokenExpireSoon,
  refreshAccessToken,
  storeTokens,
  getRefreshToken,
} from './tokenUtils'

interface UseTokenRefreshOptions {
  accessToken: string
  checkIntervalMs?: number // Check every 1 minute by default
  refreshThresholdMs?: number // Refresh when 5 minutes left
  apiUrl?: string
  onTokenRefreshed?: (accessToken: string, refreshToken: string) => void
  onRefreshFailed?: () => void
}

export function useTokenRefresh({
  accessToken,
  checkIntervalMs = 60 * 1000, // 1 minute
  refreshThresholdMs = 5 * 60 * 1000, // 5 minutes
  apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
  onTokenRefreshed,
  onRefreshFailed,
}: UseTokenRefreshOptions) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const isRefreshingRef = useRef(false)

  const refreshToken = useCallback(async () => {
    if (!accessToken || isRefreshingRef.current) return

    const refreshTokenValue = getRefreshToken()
    if (!refreshTokenValue) {
      console.warn('[TokenRefresh] No refresh token available')
      onRefreshFailed?.()
      return
    }

    isRefreshingRef.current = true

    try {
      const result = await refreshAccessToken(refreshTokenValue, apiUrl)
      if (result) {
        console.log('[TokenRefresh] Token refreshed successfully')
        storeTokens(result.accessToken, result.refreshToken)
        onTokenRefreshed?.(result.accessToken, result.refreshToken)
      } else {
        console.error('[TokenRefresh] Token refresh failed')
        onRefreshFailed?.()
      }
    } catch (error) {
      console.error('[TokenRefresh] Token refresh error:', error)
      onRefreshFailed?.()
    } finally {
      isRefreshingRef.current = false
    }
  }, [accessToken, apiUrl, onTokenRefreshed, onRefreshFailed])

  useEffect(() => {
    if (!accessToken) {
      // Clear interval if no token
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    // Check immediately on token change
    if (willTokenExpireSoon(accessToken, refreshThresholdMs)) {
      refreshToken()
    }

    // Set up periodic check
    intervalRef.current = setInterval(() => {
      if (willTokenExpireSoon(accessToken, refreshThresholdMs)) {
        refreshToken()
      }
    }, checkIntervalMs)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [accessToken, refreshThresholdMs, checkIntervalMs, refreshToken])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [])
}
