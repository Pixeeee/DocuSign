'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './forgot-password.module.css'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // TODO: Call your password reset API here
      // const response = await fetch('/api/auth/forgot-password', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ email })
      // })
      // if (!response.ok) throw new Error('Failed to send reset email')

      // Simulated delay
      await new Promise((r) => setTimeout(r, 1000))
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {/* Left: Illustration */}
        <div className={styles.left}>
          <div className={styles.leftGrid} aria-hidden="true" />

          <div className={styles.cardStack} aria-hidden="true">
            <div className={`${styles.card} ${styles.cardB1}`} />
            <div className={`${styles.card} ${styles.cardB2}`} />
            <div className={`${styles.card} ${styles.cardHero}`}>
              <div className={styles.cardInner}>
                <span className={styles.lockIcon}>🔐</span>
                <div className={styles.signRule} />
                <p className={styles.resetText}>Reset Access</p>
              </div>
            </div>
          </div>

          <div className={styles.leftBrand}>
            <div className={styles.leftRule} />
            <p className={styles.leftLabel}>INK COVENANT — Password Recovery</p>
          </div>

          <div className={styles.dotMatrix} aria-hidden="true">
            {Array.from({ length: 25 }).map((_, i) => (
              <span key={i} className={styles.dot} />
            ))}
          </div>
        </div>

        {/* Right: Form */}
        <div className={styles.right}>
          <div className={styles.formContainer}>
            {!submitted ? (
              <>
                <div className={styles.formHead}>
                  <h1 className={styles.formTitle}>Forgot password?</h1>
                  <p className={styles.formSub}>
                    No worries. Enter your email and we'll send you a reset link.
                  </p>
                </div>

                {error && <div className={styles.alertBox}>{error}</div>}

                <form onSubmit={handleSubmit} className={styles.form}>
                  <div className={styles.field}>
                    <label className={styles.label}>Email address</label>
                    <input
                      type="email"
                      className={styles.input}
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>

                  <button type="submit" className={styles.primaryBtn} disabled={loading}>
                    {loading && <span className={styles.spinner} />}
                    Send reset link
                  </button>
                </form>

                <div className={styles.footer}>
                  <p>
                    Remember your password?{' '}
                    <button
                      type="button"
                      className={styles.link}
                      onClick={() => router.push('/auth/login')}
                    >
                      Sign in
                    </button>
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className={styles.formHead}>
                  <h1 className={styles.formTitle}>Check your email</h1>
                  <p className={styles.formSub}>
                    We've sent a password reset link to <strong>{email}</strong>. Check your inbox and follow the link to reset your password.
                  </p>
                </div>

                <div className={styles.successBox}>
                  <div className={styles.successIcon}>✓</div>
                  <p className={styles.successText}>Password reset email sent successfully</p>
                </div>

                <div className={styles.footer}>
                  <p>
                    Didn't receive the email?{' '}
                    <button
                      type="button"
                      className={styles.link}
                      onClick={() => {
                        setSubmitted(false)
                        setEmail('')
                      }}
                    >
                      Try again
                    </button>
                  </p>
                  <p>
                    <button
                      type="button"
                      className={styles.link}
                      onClick={() => router.push('/auth/login')}
                    >
                      Back to sign in
                    </button>
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
