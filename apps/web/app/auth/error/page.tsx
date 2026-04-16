'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import styles from './error.module.css'

const ERROR_MESSAGES: Record<string, { title: string; message: string }> = {
  Configuration: {
    title: 'Configuration Error',
    message: 'Server configuration error. Please contact support.',
  },
  AccessDenied: {
    title: 'Access Denied',
    message: 'You do not have permission to sign in. Please try another account.',
  },
  Verification: {
    title: 'Link Expired',
    message: 'The verification link is invalid or has expired. Please request a new one.',
  },
  OAuthSignin: {
    title: 'OAuth Error',
    message: 'Unable to sign in with the selected provider. Please try again.',
  },
  OAuthCallback: {
    title: 'OAuth Error',
    message: 'Error in OAuth callback. Please try signing in again.',
  },
  OAuthCreateAccount: {
    title: 'Account Creation Error',
    message: 'Unable to create account with OAuth. Please contact support.',
  },
  EmailCreateAccount: {
    title: 'Email Error',
    message: 'Unable to create account with email. Please try again.',
  },
  Callback: {
    title: 'Callback Error',
    message: 'An error occurred in the authentication callback.',
  },
  EmailSignInError: {
    title: 'Sign In Error',
    message: 'Unable to sign in. Please check your credentials and try again.',
  },
  SessionCallback: {
    title: 'Session Error',
    message: 'Error creating session. Please try signing in again.',
  },
  Default: {
    title: 'Authentication Error',
    message: 'An error occurred during sign in. Please try again.',
  },
}

function ErrorIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      style={{ color: '#8A8785' }}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}

function ErrorContent() {
  const params = useSearchParams()
  const errorCode = params.get('error') || 'Default'
  const errorData = ERROR_MESSAGES[errorCode] || ERROR_MESSAGES.Default

  return (
    <div className={styles.page}>
      <div className={styles.left}>
        <div className={styles.leftGrid} />
        <div className={styles.iconContainer}>
          <ErrorIcon />
        </div>
        <div className={styles.errorCode}>{errorCode || 'ERROR'}</div>
      </div>

      <div className={styles.right}>
        <div className={styles.content}>
          <h1 className={styles.title}>{errorData.title}</h1>
          <p className={styles.message}>{errorData.message}</p>

          <div className={styles.actions}>
            <a href="/auth/login" className={styles.primaryBtn}>
              Back to Sign In
            </a>
            <a href="/" className={styles.ghostBtn}>
              Go Home
            </a>
          </div>

          <p className={styles.support}>
            Need help?{' '}
            <a href="mailto:support@esign.io" className={styles.supportLink}>
              Contact Support
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ErrorContent />
    </Suspense>
  )
}