// apps/web/app/auth/components/LoginFormOptimized.tsx
// Optimized login form with instant feedback and minimal perceived latency

'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useLoginOptimized } from '../hooks/useAuthOptimized'
import styles from '../login.module.css'

interface LoginFormOptimizedProps {
  onSuccess?: () => void
}

export function LoginFormOptimized({ onSuccess }: LoginFormOptimizedProps) {
  const router = useRouter()
  const { state, handleLogin } = useLoginOptimized()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [mfaRequired, setMfaRequired] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Form validation state (instant feedback)
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')

  const isLoading = state.stage === 'validating' || state.stage === 'submitting'

  // Real-time email validation
  const validateEmail = useCallback((value: string) => {
    const trimmed = value.trim()
    if (!trimmed) {
      setEmailError('Email is required')
      return false
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError('Invalid email address')
      return false
    }
    setEmailError('')
    return true
  }, [])

  // Real-time password validation
  const validatePassword = useCallback((value: string) => {
    if (!value) {
      setPasswordError('Password is required')
      return false
    }
    if (value.length < 1) {
      setPasswordError('Password is required')
      return false
    }
    setPasswordError('')
    return true
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate form (instant feedback)
    const emailValid = validateEmail(email)
    const passwordValid = validatePassword(password)

    if (!emailValid || !passwordValid) {
      return
    }

    // Call optimized login handler
    const success = await handleLogin(email, password, mfaRequired ? totpCode : undefined)

    if (success) {
      // Optimistic redirect (don't wait for full page load)
      onSuccess?.()
      setTimeout(() => router.push('/dashboard'), 100)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {/* Status Messages */}
      {state.error && (
        <div className={styles.alertError} role="alert">
          <span className={styles.alertIcon}>⚠️</span>
          <span>{state.error}</span>
        </div>
      )}

      {state.message && !state.error && (
        <div className={styles.alertSuccess} role="status">
          <span className={styles.alertIcon}>✓</span>
          <span>{state.message}</span>
        </div>
      )}

      {/* Email Field */}
      <div className={styles.formGroup}>
        <label htmlFor="email" className={styles.label}>
          Email Address
        </label>
        <div className={styles.inputWrapper}>
          <input
            id="email"
            type="email"
            className={`${styles.input} ${emailError ? styles.inputError : ''}`}
            placeholder="you@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              validateEmail(e.target.value)
            }}
            onBlur={(e) => validateEmail(e.target.value)}
            disabled={isLoading}
            autoComplete="email"
            required
          />
          {emailError && <span className={styles.fieldError}>{emailError}</span>}
        </div>
      </div>

      {/* Password Field */}
      <div className={styles.formGroup}>
        <label htmlFor="password" className={styles.label}>
          Password
        </label>
        <div className={styles.inputWrapper}>
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            className={`${styles.input} ${passwordError ? styles.inputError : ''}`}
            placeholder="••••••••"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              validatePassword(e.target.value)
            }}
            onBlur={(e) => validatePassword(e.target.value)}
            disabled={isLoading}
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            className={styles.togglePassword}
            onClick={() => setShowPassword(!showPassword)}
            disabled={isLoading}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? '👁️' : '👁️'}
          </button>
          {passwordError && <span className={styles.fieldError}>{passwordError}</span>}
        </div>
      </div>

      {/* MFA Code Field (Conditional) */}
      {mfaRequired && (
        <div className={styles.formGroup}>
          <label htmlFor="totp" className={styles.label}>
            6-Digit Code
          </label>
          <input
            id="totp"
            type="text"
            className={styles.input}
            placeholder="000000"
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
            disabled={isLoading}
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
            required={mfaRequired}
          />
        </div>
      )}

      {/* Status Indicator */}
      <div className={styles.statusIndicator}>
        {isLoading && (
          <>
            <span className={styles.spinner} />
            <span className={styles.statusText}>
              {state.stage === 'validating' ? 'Verifying...' : 'Signing in...'}
            </span>
          </>
        )}
        {state.stage === 'success' && (
          <>
            <span className={styles.successIcon}>✓</span>
            <span className={styles.statusText}>Redirecting to dashboard...</span>
          </>
        )}
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        className={`${styles.button} ${styles.buttonPrimary}`}
        disabled={isLoading || !email || !password}
      >
        {isLoading ? (
          <>
            <span className={styles.spinner} style={{ marginRight: '8px' }} />
            {mfaRequired ? 'Verifying MFA...' : 'Signing in...'}
          </>
        ) : (
          '🔐 Sign In'
        )}
      </button>

      {/* Forgot Password Link */}
      <div className={styles.footer}>
        <a href="/auth/forgot-password" className={styles.link}>
          Forgot password?
        </a>
      </div>
    </form>
  )
}
