'use client'

import { useRef, useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import type { AxiosError } from 'axios'
import type { Role, PlanType } from '@esign/db'
import { Modal, Button, Alert, Tabs, Tab, Spinner } from 'react-bootstrap'
import SignatureCanvas from 'react-signature-canvas'
import axios from 'axios'
import { v4 as uuidv4 } from 'uuid'
import X402PaymentModal from './X402PaymentModal'

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
}

export default function SignatureModal({
  documentId,
  show,
  onHide,
  onSigned,
  signaturePage = 1,
  signatureX = 100,
  signatureY = 100,
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
            width: 200,
            height: 80,
          },
        },
        { headers }
      )

      if (response.status === 402) {
        // Should not happen after payment, but handle anyway
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

    // Retry signature with payment token
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

      <Modal show={show} onHide={onHide} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Sign Document</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          {paymentRequired && !showPaymentModal && (
            <Alert variant="warning">
              Payment required: {paymentRequired.message}
            </Alert>
          )}

          <Tabs activeKey={activeTab} onSelect={(k) => setActiveTab(k || 'draw')}>
            <Tab eventKey="draw" title="Draw Signature">
              <div className="border rounded mt-3" style={{ cursor: 'crosshair' }}>
                <SignatureCanvas
                  ref={sigCanvasRef}
                  penColor="#000066"
                  canvasProps={{
                    width: 600,
                    height: 200,
                    className: 'w-100',
                    style: { background: '#fafafa' },
                  }}
                />
              </div>
              <Button
                variant="outline-secondary"
                size="sm"
                className="mt-2"
                onClick={clearSignature}
              >
                Clear
              </Button>
            </Tab>
            <Tab eventKey="type" title="Type Name">
              <div className="mt-3">
                <input
                  type="text"
                  className="form-control form-control-lg"
                  placeholder="Type your full legal name"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  style={{ fontFamily: 'cursive', fontSize: '1.5rem' }}
                />
                <small className="text-muted">
                  By typing your name, you agree this is your legal signature
                </small>
              </div>
            </Tab>
          </Tabs>

          <div className="mt-3 p-3 bg-light rounded">
            <small className="text-muted">
              <strong>Legal Notice:</strong> By signing this document, you agree that your electronic
              signature is legally binding under applicable e-signature laws. This signature is
              cryptographically protected with RSA-2048 and SHA-3 hashing.
            </small>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onHide}>Cancel</Button>
          <Button
            variant="success"
            onClick={handleSign}
            disabled={signing || (paymentRequired !== null && !paymentToken)}
          >
            {signing ? <><Spinner size="sm" /> Signing...</> : '✍️ Sign Document'}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}