'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import styles from './register.module.css'

interface FormData {
  email: string
  password: string
  confirmPassword: string
  firstName: string
  lastName: string
  agreedToTerms: boolean
}

type StepKey = 'account' | 'profile' | 'confirm'

interface Step {
  key: StepKey
  label: string
  completed: boolean
}

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

const LeftPanel = () => (
  <div className={styles.left}>
    {/* Grid texture */}
    <div className={styles.leftGrid} aria-hidden="true" />

    {/* Card stack illustration */}
    <div className={styles.cardStack} aria-hidden="true">
      <div className={`${styles.card} ${styles.cardB1}`} />
      <div className={`${styles.card} ${styles.cardB2}`} />
      <div className={`${styles.card} ${styles.cardHero}`}>
        <div className={styles.cardInner}>
          <span className={styles.signWord}>SIGN</span>
          <div className={styles.signRule} />
          <span className={styles.hereWord}>HERE</span>

          {/* Ruled lines */}
          <div className={styles.ruledLines}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={styles.ruleLine}>
                <span className={styles.xMark}>×</span>
                <span className={styles.ruleBar} />
              </div>
            ))}
          </div>

          {/* Signature strokes */}
          <svg className={styles.sigSvg} viewBox="0 0 340 80" fill="none">
            <path d="M8 24 Q38 8 66 20 Q100 4 128 16" stroke="#5A5A5A" strokeWidth="2" strokeLinecap="round"/>
            <path d="M150 30 Q182 14 212 26 Q244 10 272 22" stroke="#5A5A5A" strokeWidth="2" strokeLinecap="round"/>
            <path d="M10 56 Q50 40 88 52 Q132 36 170 48 Q208 32 246 44" stroke="#484848" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
      </div>
    </div>

    {/* Bottom brand */}
    <div className={styles.leftBrand}>
      <div className={styles.leftRule} />
      <p className={styles.leftLabel}>
        INK COVENANT — Join the Platform
      </p>
    </div>

    {/* Dot matrix */}
    <div className={styles.dotMatrix} aria-hidden="true">
      {Array.from({ length: 25 }).map((_, i) => (
        <span key={i} className={styles.dot} />
      ))}
    </div>
  </div>
)

function getPasswordStrength(password: string): string {
  let score = 0
  if (password.length >= 8) score++
  if (/[A-Z]/.test(password)) score++
  if (/[a-z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++

  if (score < 2) return 'weak'
  if (score < 4) return 'good'
  return 'strong'
}

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState<FormData>({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    agreedToTerms: false,
  })

  const [step, setStep] = useState<StepKey>('account')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [transitioning, setTrans] = useState(false)

  const steps: Step[] = [
    { key: 'account', label: 'Account', completed: step !== 'account' },
    { key: 'profile', label: 'Profile', completed: step === 'confirm' },
    { key: 'confirm', label: 'Confirm', completed: false },
  ]

  const strength = getPasswordStrength(form.password)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target as HTMLInputElement
    if (type === 'checkbox') {
      setForm((f) => ({ ...f, [name]: (e.target as HTMLInputElement).checked }))
    } else {
      setForm((f) => ({ ...f, [name]: value }))
    }
  }

  const handleNext = () => {
    setError('')

    if (step === 'account') {
      if (!form.email || !form.password || !form.confirmPassword) {
        setError('Please fill in all fields')
        return
      }
      if (form.password !== form.confirmPassword) {
        setError('Passwords do not match')
        return
      }
      if (form.password.length < 8) {
        setError('Password must be at least 8 characters')
        return
      }
      setStep('profile')
    } else if (step === 'profile') {
      if (!form.firstName || !form.lastName) {
        setError('Please enter your name')
        return
      }
      setStep('confirm')
    }
  }

  const handleBack = () => {
    if (step === 'profile') setStep('account')
    else if (step === 'confirm') setStep('profile')
  }

  const handleSignIn = () => {
    setTrans(true)
    setTimeout(() => {
      router.push('/auth/login')
    }, 380)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!form.agreedToTerms) {
      setError('Please accept the terms and conditions')
      return
    }

    setLoading(true)

    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/auth/register`,
        {
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          password: form.password,
        }
      )

      const { accessToken, refreshToken } = response.data
      if (accessToken) localStorage.setItem('accessToken', accessToken)
      if (refreshToken) localStorage.setItem('refreshToken', refreshToken)

      router.push('/auth/login?registered=true')
    } catch (err) {
      const axiosError = err as { response?: { data?: { error?: string } } }
      setError(axiosError.response?.data?.error || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={`${styles.card2} ${transitioning ? styles.cardSlide : ''}`}>
        {/* Left: always visible illustration */}
        <LeftPanel />

        {/* Right: multi-step form area */}
        <div className={styles.right}>
          {/* Step 1: Account */}
          <div className={`${styles.formPanel} ${step === 'account' ? styles.panelVisible : styles.panelHidden}`}>
            <div className={styles.formHead}>
              <h1 className={styles.formTitle}>Create Your Account</h1>
              <p className={styles.formSub}>Step 1 of 3: Account Details</p>
            </div>

            {/* Stepper */}
            <div className={styles.stepper}>
              {steps.map((s, i) => (
                <div key={s.key} className={styles.stepItem}>
                  <div className={`${styles.stepDot} ${step === s.key || s.completed ? styles.stepDotActive : ''}`}>
                    {s.completed ? <CheckIcon /> : <span>{i + 1}</span>}
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`${styles.stepLine} ${s.completed ? styles.stepLineActive : ''}`} />
                  )}
                </div>
              ))}
            </div>

            {error && <div className={styles.alertBox}>{error}</div>}

            <form onSubmit={(e) => { e.preventDefault(); handleNext(); }} className={styles.form}>
              <div className={styles.field}>
                <label className={styles.label}>Email Address</label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  className={styles.input}
                  required
                  autoFocus
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Password</label>
                <input
                  type="password"
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="Minimum 8 characters"
                  className={styles.input}
                  required
                />
                {form.password && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '-6px' }}>
                    <div style={{ flex: 1, height: '3px', background: '#E0DDD8', borderRadius: '2px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          borderRadius: '2px',
                          background: strength === 'weak' ? '#CD5854' : strength === 'good' ? '#D4A857' : '#5FA25F',
                          transition: 'width 0.3s ease, background 0.3s ease',
                          width: strength === 'weak' ? '33%' : strength === 'good' ? '66%' : '100%',
                        }}
                      />
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 400, color: strength === 'weak' ? '#CD5854' : strength === 'good' ? '#D4A857' : '#5FA25F', minWidth: '36px', textAlign: 'right' }}>
                      {strength.charAt(0).toUpperCase() + strength.slice(1)}
                    </span>
                  </div>
                )}
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Confirm Password</label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  placeholder="Re-enter password"
                  className={styles.input}
                  required
                />
                {form.confirmPassword && form.password !== form.confirmPassword && (
                  <div className={styles.fieldHint} style={{ color: '#CD5854' }}>
                    Passwords do not match
                  </div>
                )}
              </div>

              <button type="submit" className={styles.primaryBtn}>
                Continue
              </button>
            </form>

            <p className={styles.termsNote}>
              Already have an account?{' '}
              <button 
                type="button"
                onClick={handleSignIn}
                className={styles.termsLink}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}
              >
                Sign in
              </button>
            </p>
          </div>

          {/* Step 2: Profile */}
          <div className={`${styles.formPanel} ${step === 'profile' ? styles.panelVisible : styles.panelHidden}`}>
            <button className={styles.backBtn} onClick={handleBack}>
              ← Back
            </button>

            <div className={styles.formHead}>
              <h1 className={styles.formTitle}>Create Your Account</h1>
              <p className={styles.formSub}>Step 2 of 3: Profile Information</p>
            </div>

            {/* Stepper */}
            <div className={styles.stepper}>
              {steps.map((s, i) => (
                <div key={s.key} className={styles.stepItem}>
                  <div className={`${styles.stepDot} ${step === s.key || s.completed ? styles.stepDotActive : ''}`}>
                    {s.completed ? <CheckIcon /> : <span>{i + 1}</span>}
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`${styles.stepLine} ${s.completed ? styles.stepLineActive : ''}`} />
                  )}
                </div>
              ))}
            </div>

            {error && <div className={styles.alertBox}>{error}</div>}

            <form onSubmit={(e) => { e.preventDefault(); handleNext(); }} className={styles.form}>
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label className={styles.label}>First Name</label>
                  <input
                    type="text"
                    name="firstName"
                    value={form.firstName}
                    onChange={handleChange}
                    placeholder="Jane"
                    className={styles.input}
                    required
                  />
                </div>
              </div>

              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label className={styles.label}>Last Name</label>
                  <input
                    type="text"
                    name="lastName"
                    value={form.lastName}
                    onChange={handleChange}
                    placeholder="Smith"
                    className={styles.input}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                <button type="button" onClick={handleBack} className={styles.secondaryBtn}>
                  Back
                </button>
                <button type="submit" className={styles.primaryBtn}>
                  Review
                </button>
              </div>
            </form>
          </div>

          {/* Step 3: Confirm */}
          <div className={`${styles.formPanel} ${step === 'confirm' ? styles.panelVisible : styles.panelHidden}`}>
            <button className={styles.backBtn} onClick={handleBack}>
              ← Back
            </button>

            <div className={styles.formHead}>
              <h1 className={styles.formTitle}>Create Your Account</h1>
              <p className={styles.formSub}>Step 3 of 3: Review & Confirm</p>
            </div>

            {/* Stepper */}
            <div className={styles.stepper}>
              {steps.map((s, i) => (
                <div key={s.key} className={styles.stepItem}>
                  <div className={`${styles.stepDot} ${step === s.key || s.completed ? styles.stepDotActive : ''}`}>
                    {s.completed ? <CheckIcon /> : <span>{i + 1}</span>}
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`${styles.stepLine} ${s.completed ? styles.stepLineActive : ''}`} />
                  )}
                </div>
              ))}
            </div>

            {error && <div className={styles.alertBox}>{error}</div>}

            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.reviewCard}>
                <div className={styles.reviewSection}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 600, color: '#5C5A57' }}>
                    Account Details
                  </h4>
                  <p style={{ margin: '4px 0', fontSize: '14px', color: '#080808' }}>
                    {form.email}
                  </p>
                </div>

                <div className={styles.reviewSection}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 600, color: '#5C5A57' }}>
                    Profile Information
                  </h4>
                  <p style={{ margin: '4px 0', fontSize: '14px', color: '#080808' }}>
                    {form.firstName} {form.lastName}
                  </p>
                </div>
              </div>

              <div className={styles.fieldRow}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    name="agreedToTerms"
                    checked={form.agreedToTerms}
                    onChange={handleChange}
                    style={{
                      width: '18px',
                      height: '18px',
                      marginTop: '2px',
                      cursor: 'pointer',
                      accentColor: '#080808',
                    }}
                  />
                  <span style={{ fontSize: '13px', color: '#5C5A57' }}>
                    I agree to the{' '}
                    <a
                      href="/terms"
                      style={{ color: '#080808', fontWeight: 600, textDecoration: 'none' }}
                    >
                      Terms & Conditions
                    </a>
                  </span>
                </label>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                <button type="button" onClick={handleBack} className={styles.secondaryBtn}>
                  Back
                </button>
                <button type="submit" disabled={loading} className={styles.primaryBtn}>
                  {loading ? (
                    <>
                      <span className={styles.spinner} />
                      Creating Account...
                    </>
                  ) : (
                    'Create Account'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}