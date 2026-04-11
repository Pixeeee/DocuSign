'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [step, setStep] = useState<'credentials' | 'mfa'>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [totpRequired, setTotpRequired] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const credentials: Record<string, string> = {
        email,
        password,
      }
      if (step === 'mfa') {
        credentials.totpCode = totpCode
      }

      const result = await signIn('credentials', {
        ...credentials,
        redirect: false,
      })

      if (result?.error) {
        if (step === 'credentials') {
          setTotpRequired(true)
          setStep('mfa')
          setError('Enter your MFA code')
          return
        }

        setError('Invalid credentials or TOTP code')
        return
      }

      if (result?.ok) {
        router.push('/dashboard')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="d-flex align-items-center justify-content-center min-vh-100"
      style={{ background: '#f0f2f5' }}
    >
      <div className="card shadow-sm" style={{ width: '100%', maxWidth: 420 }}>
        <div className="card-body p-4">

          {/* Header */}
          <div className="text-center mb-4">
            <div style={{ fontSize: '2rem' }}>✍️</div>
            <h4 className="fw-bold mb-0">ESign Platform</h4>
            <p className="text-muted small">
              {step === 'mfa' ? 'Enter your MFA code' : 'Sign in to your account'}
            </p>
          </div>

          {error && (
            <div className="alert alert-danger py-2 small">{error}</div>
          )}

          <form onSubmit={handleSubmit}>
            {step === 'credentials' && (
              <>
                <div className="mb-3">
                  <label className="form-label fw-semibold small">Email</label>
                  <input
                    type="email"
                    className="form-control"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div className="mb-3">
                  <div className="d-flex justify-content-between">
                    <label className="form-label fw-semibold small">Password</label>
                    <a href="/auth/forgot-password" className="small text-decoration-none">
                      Forgot password?
                    </a>
                  </div>
                  <input
                    type="password"
                    className="form-control"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </>
            )}

            {step === 'mfa' && (
              <div className="mb-3">
                <label className="form-label fw-semibold small">
                  6-digit authenticator code
                </label>
                <input
                  type="text"
                  className="form-control form-control-lg text-center"
                  placeholder="000000"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                  required
                />
                <div className="form-text">
                  Open your authenticator app and enter the current code.
                </div>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary w-100"
              disabled={loading}
            >
              {loading
                ? <span className="spinner-border spinner-border-sm me-2" />
                : null}
              {step === 'mfa' ? 'Verify Code' : 'Sign In'}
            </button>

            {step === 'mfa' && (
              <button
                type="button"
                className="btn btn-link w-100 mt-1 small"
                onClick={() => { setStep('credentials'); setTotpCode('') }}
              >
                ← Back
              </button>
            )}
          </form>

          {step === 'credentials' && (
            <p className="text-center text-muted small mt-4 mb-0">
              Don&apos;t have an account?{' '}
              <a href="/auth/register" className="text-decoration-none fw-semibold">
                Sign up
              </a>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}