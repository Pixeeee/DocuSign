'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import type { AxiosError } from 'axios'
import type { Role, PlanType } from '@esign/db'
import { formatDistanceToNow, format } from 'date-fns'
import axios from 'axios'
import SignatureModal from './SignatureModal'
import PdfSignatureViewer from './PdfSignatureViewer'
import { getAccessToken } from '../lib/tokenUtils'
import styles from './DocumentList.module.css'

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

interface Signature {
  id: string
  status: 'PENDING' | 'SIGNED' | 'DECLINED' | 'EXPIRED'
  signedAt: string | null
}

interface Document {
  id: string
  title: string
  fileName: string
  fileSize: number
  status: 'DRAFT' | 'PENDING_SIGNATURE' | 'PARTIALLY_SIGNED' | 'SIGNED' | 'EXPIRED' | 'CANCELLED'
  sha3Hash: string
  createdAt: string
  signatures: Signature[]
  _count: { signatures: number }
}

interface Props {
  documents: Document[]
  onRefresh: () => void
}

const STATUS_VARIANTS: Record<Document['status'], string> = {
  DRAFT: styles.badgeDraft,
  PENDING_SIGNATURE: styles.badgePending,
  PARTIALLY_SIGNED: styles.badgeSigned,
  SIGNED: styles.badgeSigned,
  EXPIRED: styles.badgeExpired,
  CANCELLED: styles.badgeCancelled,
}

const STATUS_LABELS: Record<Document['status'], string> = {
  DRAFT: 'Draft',
  PENDING_SIGNATURE: 'Awaiting Signature',
  PARTIALLY_SIGNED: 'Partially Signed',
  SIGNED: '✓ Signed',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DocumentList({ documents, onRefresh }: Props) {
  const { data: session } = useSession()
  const [signingDocId, setSigningDocId] = useState<string | null>(null)
  const [pdfViewerDocId, setPdfViewerDocId] = useState<string | null>(null)
  const [signaturePosition, setSignaturePosition] = useState<{ page: number; x: number; y: number; width: number; height: number } | null>(null)
  const [verifyDoc, setVerifyDoc] = useState<Document | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [accessToken, setAccessToken] = useState('')

  // Get access token from session or localStorage (client-side only)
  useEffect(() => {
    setAccessToken(getAccessToken(session))
  }, [session])

  const currentAccessToken = () => getAccessToken(session) || accessToken

  const authHeader = () => ({
    Authorization: `Bearer ${currentAccessToken()}`,
  })

  const handleDownload = async (doc: Document) => {
    setDownloadingId(doc.id)
    setError('')
    try {
      const { data } = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/documents/${doc.id}/download`,
        { headers: authHeader() }
      )
      console.log('[DocumentList] Presigned URL received:', data.url)
      console.log('[DocumentList] Opening in new window...')
      window.open(data.url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      const err = error as AxiosError<{ error?: string }>
      console.error('[DocumentList] Download error:', err)
      setError(err.response?.data?.error || 'Download failed')
    } finally {
      setDownloadingId(null)
    }
  }

  const handleDelete = async (docId: string) => {
    if (!confirm('Delete this document? This action cannot be undone.')) return
    setDeletingId(docId)
    setError('')
    try {
      await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/api/documents/${docId}`,
        { headers: authHeader() }
      )
      onRefresh()
    } catch (error) {
      const err = error as AxiosError<{ error?: string }>
      setError(err.response?.data?.error || 'Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  if (documents.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>📄</div>
        <h5 className={styles.emptyTitle}>No documents yet</h5>
        <p className={styles.emptyText}>Upload your first PDF to get started.</p>
      </div>
    )
  }

  return (
    <>
      {error && (
        <div className={`${styles.alert} ${styles.alertError}`} style={{ marginBottom: '16px' }}>
          <span className={styles.alertIcon}>⚠️</span>
          <div style={{ flex: 1 }}>
            {error}
            <button
              onClick={() => setError('')}
              style={{
                marginLeft: '12px',
                background: 'none',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead className={styles.thead}>
            <tr className={styles.tr}>
              <th className={styles.th}>Document</th>
              <th className={styles.th}>Status</th>
              <th className={styles.th}>Signatures</th>
              <th className={styles.th}>Size</th>
              <th className={styles.th}>Uploaded</th>
              <th className={styles.th} style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody className={styles.tbody}>
            {documents.map((doc) => (
              <tr key={doc.id} className={styles.tr}>
                <td className={styles.td}>
                  <div style={{ fontWeight: 500, textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: '240px' }}>
                    {doc.title}
                  </div>
                  <small style={{ color: 'var(--text-muted)', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: '240px' }}>
                    {doc.fileName}
                  </small>
                </td>

                <td className={styles.td}>
                  <span className={`${styles.badge} ${STATUS_VARIANTS[doc.status]}`}>
                    {STATUS_LABELS[doc.status]}
                  </span>
                </td>

                <td className={styles.td}>
                  {doc._count.signatures === 0 ? (
                    <span className={styles.signatureCount} style={{ color: 'var(--text-muted)' }}>—</span>
                  ) : (
                    <div className={styles.signatureProgress}>
                      <span className={styles.signatureCount}>
                        {doc.signatures.filter((s) => s.status === 'SIGNED').length}
                        {' / '}
                        {doc._count.signatures}
                      </span>
                      <div className={styles.signatureBar}>
                        <div
                          className={styles.signatureFill}
                          style={{
                            width: `${(doc.signatures.filter((s) => s.status === 'SIGNED').length / doc._count.signatures) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </td>

                <td className={styles.td}>
                  <span className={styles.fileSize}>{formatBytes(doc.fileSize)}</span>
                </td>

                <td className={styles.td}>
                  <span
                    className={styles.timestamp}
                    title={format(new Date(doc.createdAt), 'PPpp')}
                  >
                    {formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })}
                  </span>
                </td>

                <td className={styles.td} style={{ textAlign: 'right' }}>
                  <div className={styles.buttonGroup}>
                    {['DRAFT', 'PENDING_SIGNATURE', 'PARTIALLY_SIGNED'].includes(doc.status) && (
                      <button
                        className={styles.actionButton}
                        onClick={() => setPdfViewerDocId(doc.id)}
                        title="Sign document"
                      >
                        ✍️
                      </button>
                    )}

                    <button
                      className={styles.actionButton}
                      onClick={() => setVerifyDoc(doc)}
                      title="Verify SHA-3 hash"
                    >
                      🔍
                    </button>

                    <button
                      className={styles.actionButton}
                      disabled={downloadingId === doc.id}
                      onClick={() => handleDownload(doc)}
                      title={doc.status === 'SIGNED' ? 'Download signed PDF' : 'Download original'}
                    >
                      {downloadingId === doc.id ? '⏳' : '⬇️'}
                    </button>

                    {['DRAFT', 'CANCELLED'].includes(doc.status) && (
                      <button
                        className={styles.actionButton}
                        disabled={deletingId === doc.id}
                        onClick={() => handleDelete(doc.id)}
                        title="Delete document"
                      >
                        {deletingId === doc.id ? '⏳' : '🗑️'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pdfViewerDocId && (
        <PdfSignatureViewer
          documentId={pdfViewerDocId}
          accessToken={currentAccessToken()}
          show={!!pdfViewerDocId}
          onHide={() => setPdfViewerDocId(null)}
          onPositionSelected={(pos) => {
            setPdfViewerDocId(null)
            setSignaturePosition(pos)
            setSigningDocId(pdfViewerDocId)
          }}
        />
      )}

      {signingDocId && (
        <SignatureModal
          documentId={signingDocId}
          show={!!signingDocId}
          onHide={() => {
            setSigningDocId(null)
            setSignaturePosition(null)
          }}
          onSigned={() => {
            setSigningDocId(null)
            setSignaturePosition(null)
            onRefresh()
          }}
          signaturePage={signaturePosition?.page ?? 1}
          signatureX={signaturePosition?.x ?? 100}
          signatureY={signaturePosition?.y ?? 100}
          signatureWidth={signaturePosition?.width ?? 200}
          signatureHeight={signaturePosition?.height ?? 80}
        />
      )}

      {verifyDoc && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <div style={{ marginBottom: '20px' }}>
              <h6 style={{ margin: '0 0 16px 0', color: 'var(--text-light)', fontWeight: 600 }}>
                Document Integrity Verification
              </h6>
            </div>
            <div>
              <p style={{ margin: '0 0 8px 0', color: 'var(--text-light)' }}>
                <strong>Document:</strong> {verifyDoc.title}
              </p>
              <p style={{ margin: '0 0 16px 0', color: 'var(--text-light)' }}>
                <strong>File:</strong> {verifyDoc.fileName}
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                SHA-3 Hash (stored at upload):
              </p>
              <code
                style={{
                  display: 'block',
                  padding: '12px',
                  background: 'linear-gradient(135deg, #0F0F0F, #1A1A1A)',
                  color: 'var(--text-light)',
                  border: '1.5px solid var(--ink-border)',
                  borderRadius: '8px',
                  fontSize: '0.75rem',
                  wordBreak: 'break-all',
                  fontFamily: 'monospace',
                  marginBottom: '16px',
                }}
              >
                {verifyDoc.sha3Hash}
              </code>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                Run <code style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>sha3sum -a 256 &lt;file&gt;.pdf</code> locally to confirm
                the hash matches and the file has not been tampered with.
              </p>
            </div>
            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                className={`${styles.button} ${styles.buttonSecondary}`}
                onClick={() => setVerifyDoc(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
