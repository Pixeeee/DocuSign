// apps/web/app/auth/hooks/useAuthOptimized.ts
// Optimized auth hook with debouncing, caching, and optimistic feedback

'use client'

import { useCallback, useRef, useState } from 'react'
import { signIn } from 'next-auth/react'
import axios, { AxiosError } from 'axios'

export interface AuthProgressState {
  stage: 'idle' | 'validating' | 'submitting' | 'success'
  message: string
  error: string | null
}

// Debounce helper for form validation
function useDebounce<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<NodeJS.Timeout>()

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      timeoutRef.current = setTimeout(() => callback(...args), delay)
    },
    [callback, delay]
  )
}

// Email validation cache
const emailValidationCache = new Map<string, { valid: boolean; timestamp: number }>()
const EMAIL_CACHE_TTL = 60000 // 1 minute

async function validateEmailAvailable(email: string): Promise<boolean> {
  const cached = emailValidationCache.get(email)
  if (cached && Date.now() - cached.timestamp < EMAIL_CACHE_TTL) {
    return cached.valid
  }

  try {
    const response = await axios.get(
      `${process.env.NEXT_PUBLIC_API_URL}/api/auth/check-email`,
      { params: { email } }
    )
    const valid = response.data.available
    emailValidationCache.set(email, { valid, timestamp: Date.now() })
    return valid
  } catch (error) {
    // On error, assume it's available to not block user
    return true
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// OPTIMIZED LOGIN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function useLoginOptimized() {
  const [state, setState] = useState<AuthProgressState>({
    stage: 'idle',
    message: '',
    error: null,
  })

  const handleLogin = useCallback(
    async (email: string, password: string, totpCode?: string) => {
      setState({ stage: 'validating', message: 'Verifying credentials...', error: null })

      try {
        // Attempt sign in (NextAuth handles the API call)
        const result = await signIn('credentials', {
          email,
          password,
          totpCode,
          redirect: false,
        })

        if (!result?.ok) {
          setState({
            stage: 'idle',
            message: '',
            error: result?.error || 'Login failed',
          })
          return false
        }

        // Optimistic redirect (don't wait for session confirmation)
        setState({ stage: 'success', message: 'Login successful!', error: null })
        return true
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Login failed'
        setState({ stage: 'idle', message: '', error: message })
        return false
      }
    },
    []
  )

  return { state, handleLogin }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// OPTIMIZED REGISTRATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function useRegisterOptimized() {
  const [state, setState] = useState<AuthProgressState>({
    stage: 'idle',
    message: '',
    error: null,
  })

  // Debounced email validation
  const checkEmailDebounced = useDebounce(async (email: string) => {
    setState((prev) => ({ ...prev, stage: 'validating', message: 'Checking email...' }))
    const available = await validateEmailAvailable(email)
    if (!available) {
      setState({
        stage: 'idle',
        message: '',
        error: 'Email already registered',
      })
    } else {
      setState({ stage: 'idle', message: '', error: null })
    }
  }, 500)

  const handleRegister = useCallback(
    async (
      email: string,
      password: string,
      firstName: string,
      lastName: string
    ) => {
      setState({ stage: 'submitting', message: 'Creating account...', error: null })

      try {
        const response = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/api/auth/register`,
          {
            email,
            password,
            firstName,
            lastName,
          }
        )

        if (response.status === 201) {
          // Auto sign-in after registration (optimistic)
          const loginResult = await signIn('credentials', {
            email,
            password,
            redirect: false,
          })

          if (loginResult?.ok) {
            setState({ stage: 'success', message: 'Account created!', error: null })
            return true
          }
        }

        setState({
          stage: 'idle',
          message: '',
          error: 'Registration failed',
        })
        return false
      } catch (error) {
        const err = error as AxiosError<{ error?: string }>
        const message = err.response?.data?.error || 'Registration failed'
        setState({ stage: 'idle', message: '', error: message })
        return false
      }
    },
    []
  )

  return { state, handleRegister, checkEmailDebounced }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// OPTIMIZED TOKEN REFRESH
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function useRefreshTokenOptimized() {
  const refreshTimeoutRef = useRef<NodeJS.Timeout>()

  const scheduleRefresh = useCallback((refreshToken: string, expiresIn: number) => {
    // Schedule refresh 1 minute before token expires
    const refreshAt = (expiresIn - 60) * 1000

    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current)
    }

    refreshTimeoutRef.current = setTimeout(() => {
      axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/refresh`, {
        refreshToken,
      })
        .catch((error) => {
          console.error('[Auth] Token refresh failed:', error)
          // Redirect to login on failure
          window.location.href = '/auth/login'
        })
    }, refreshAt)
  }, [])

  return { scheduleRefresh }
}
