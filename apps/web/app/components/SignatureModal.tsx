'use client'

import { useRef, useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import type { AxiosError } from 'axios'
import type { Role, PlanType } from '@esign/db'
import SignatureCanvas from 'react-signature-canvas'
import axios from 'axios'
import { v4 as uuidv4 } from 'uuid'
import X402PaymentModal from './X402PaymentModal'
import styles from './SignatureModal.module.css'

interface ExtendedUser {
  id: string
  email: string
  name?: string
  role: Role
  plan: PlanType
  totpEnabled: boolean
  accessToken?: string
  refreshToken?: string
}

interface Props {
  documentId: string
  show: boolean
  onHide: () => void
  onSigned: () => void
  signaturePage?: number
  signatureX?: number
  signatureY?: number
  signatureWidth?: number
  signatureHeight?: number
}

export default function SignatureModal({
  documentId,
  show,
  onHide,
  onSigned,
  signaturePage = 1,
  signatureX = 100,
  signatureY = 100,
  signatureWidth = 200,
  signatureHeight = 80,
}: Props) {
  const { data: session } = useSession()
  const sigCanvasRef = useRef<SignatureCanvas>(null)
  const [activeTab, setActiveTab] = useState('draw')
  const [typedName, setTypedName] = useState('')
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentRequired, setPaymentRequired] = useState<{
    amount: string
    message: string
  } | null>(null)
  const [paymentToken, setPaymentToken] = useState<string>('')

  // Get access token from session or localStorage (client-side only)
  useEffect(() => {
    const sessionUser = session?.user as ExtendedUser
    const token = sessionUser?.accessToken || (typeof window !== 'undefined' ? localStorage.getItem('accessToken') : '') || ''
    setAccessToken(token)
  }, [session])

  // Clear signature when modal opens to ensure fresh canvas
  useEffect(() => {
    if (show && sigCanvasRef.current) {
      sigCanvasRef.current.clear()
    }
  }, [show])

  const clearSignature = () => {
    sigCanvasRef.current?.clear()
  }

  const performSignature = async (token?: string) => {
    if (!accessToken) {
      setError('Not authenticated. Please log in again.')
      return
    }

    let signatureData: string | undefined

    if (activeTab === 'draw') {
      if (sigCanvasRef.current?.isEmpty()) {
        setError('Please draw your signature')
        return
      }
      signatureData = sigCanvasRef.current!.toDataURL('image/png')
    }

    const idempotencyKey = uuidv4()
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'X-Idempotency-Key': idempotencyKey,
    }

    if (token) {
      headers['X-Payment'] = token
    }

    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/signatures/${documentId}/sign`,
        {
          signatureData,
          position: {
            page: signaturePage,
            x: signatureX,
            y: signatureY,
            width: signatureWidth,
            height: signatureHeight,
          },
        },
        { headers }
      )

      if (response.status === 402) {
        setError('Payment verification failed. Please try again.')
        return
      }

      onSigned()
      onHide()
    } catch (error) {
      const err = error as AxiosError<{ error?: string; message?: string; amount?: string }>
      if (err.response?.status === 402) {
        const amount = err.response.data?.amount || '0.000091'
        const message = err.response.data?.message || 'Document signing requires payment'
        
        setPaymentRequired({
          amount: amount,
          message: message,
        })
        setShowPaymentModal(true)
        setSigning(false)
      } else {
        setError(err.response?.data?.error || 'Signing failed')
        setSigning(false)
      }
    }
  }

  const handleSign = async () => {
    setSigning(true)
    setError('')
    setPaymentRequired(null)

    await performSignature(paymentToken || undefined)
  }

  const handlePaymentComplete = async (token: string) => {
    setPaymentToken(token)
    setShowPaymentModal(false)
    setPaymentRequired(null)
    setSigning(true)
    setError('')

    await performSignature(token)
  }

  return (
    <>
      <X402PaymentModal
        show={showPaymentModal}
        amount={paymentRequired?.amount}
        resource={`document/${documentId}`}
        description={paymentRequired?.message || 'Document signing'}
        onPaymentComplete={handlePaymentComplete}
        onHide={() => {
          setShowPaymentModal(false)
          setPaymentRequired(null)
        }}
      />

      {show && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h5 className={styles.modalTitle}>Sign Document</h5>
            </div>
            <div className={styles.modalBody}>
              {error && (
                <div className={`${styles.alert} ${styles.alertError}`} style={{ marginBottom: '16px' }}>
                  <span className={styles.alertIcon}>⚠️</span>
                  <span>{error}</span>
                </div>
              )}
              {paymentRequired && !showPaymentModal && (
                <div style={{
                  padding: '12px 14px',
                  border: `1.5px solid var(--color-warning)`,
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, rgba(201, 158, 61, 0.1), rgba(201, 158, 61, 0.05))',
                  color: '#E8C86F',
                  fontSize: '12px',
                  marginBottom: '16px',
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'flex-start',
                }}>
                  <span>⚡</span>
                  <span>Payment required: {paymentRequired.message}</span>
                </div>
              )}

              <div className={styles.signatureContainer}>
                <div className={styles.tabNavigation} style={{ marginBottom: '10px' }}>
                  <button
                    className={`${styles.tab} ${activeTab === 'draw' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('draw')}
                  >
                    ✏️ Draw Signature
                  </button>
                  <button
                    className={`${styles.tab} ${activeTab === 'type' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('type')}
                  >
                    ⌨️ Type Name
                  </button>
                </div>

                {activeTab === 'draw' && (
                  <div className={styles.signatureContainer} style={{ marginTop: '8px' }}>
                    <div className={styles.canvasWrapper}>
                      <SignatureCanvas
                        ref={sigCanvasRef}
                        penColor="#4A7C5E"
                        minWidth={2}
                        maxWidth={4}
                        canvasProps={{
                          className: styles.canvas,
                          style: { 
                            touchAction: 'none', 
                            cursor: 'crosshair',
                          },
                        }}
                        onBegin={() => {
                          console.log('[SignatureCanvas] Drawing started')
                        }}
                        onEnd={() => {
                          console.log('[SignatureCanvas] Drawing completed')
                        }}
                      />
                    </div>
                    <div className={styles.controls}>
                      <button
                        className={styles.controlButton}
                        onClick={clearSignature}
                      >
                        Clear Drawing
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === 'type' && (
                  <div className={styles.typedContainer} style={{ marginTop: '8px' }}>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Full Legal Name</label>
                      <input
                        type="text"
                        className={styles.input}
                        placeholder="Type your full legal name"
                        value={typedName}
                        onChange={(e) => setTypedName(e.target.value)}
                      />
                      <small style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                        By typing your name, you agree this is your legal signature
                      </small>
                    </div>
                    {typedName && (
                      <div className={styles.signaturePreview}>
                        {typedName}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{
                marginTop: '14px',
                marginBottom: '0',
                padding: '10px 12px',
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.01))',
                border: '1.5px solid var(--ink-border)',
                borderRadius: '6px',
                flexShrink: 0,
              }}>
                <small style={{ color: 'var(--text-muted)', fontSize: '10px', lineHeight: '1.4', display: 'block' }}>
                  <strong style={{ color: 'var(--text-light)' }}>Legal Notice:</strong> By signing, you agree your electronic signature is legally binding under applicable e-signature laws. This signature is cryptographically protected with RSA-2048 and SHA-3 hashing.
                </small>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <div className={styles.buttonGroup}>
                <button
                  className={`${styles.button} ${styles.buttonSecondary}`}
                  onClick={onHide}
                >
                  Cancel
                </button>
                <button
                  className={`${styles.button} ${styles.buttonPrimary}`}
                  onClick={handleSign}
                  disabled={signing || (paymentRequired !== null && !paymentToken)}
                >
                  {signing ? (
                    <>
                      <span className={styles.spinner} />
                      Signing...
                    </>
                  ) : (
                    '✍️ Sign Document'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
