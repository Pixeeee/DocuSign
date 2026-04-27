'use client'

import { useState, useRef, useEffect } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/esm/Page/TextLayer.css'
import 'react-pdf/dist/esm/Page/AnnotationLayer.css'
import axios from 'axios'
import styles from './PdfSignatureViewer.module.css'

// Set PDF.js worker from CDN (react-pdf v9 uses pdf.js v4.x)
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`

interface Props {
  documentId: string
  accessToken: string
  show: boolean
  onHide: () => void
  onPositionSelected: (position: { page: number; x: number; y: number; width: number; height: number }) => void
}

const SIGNATURE_WIDTH = 200
const SIGNATURE_HEIGHT = 80

export default function PdfSignatureViewer({
  documentId,
  accessToken,
  show,
  onHide,
  onPositionSelected,
}: Props) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [marker, setMarker] = useState<{ x: number; y: number } | null>(null)
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const pageWrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!show) return

    const fetchPdfUrl = async () => {
      setLoading(true)
      setError('')
      try {
        const { data } = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/api/documents/${documentId}/download`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )
        setPdfUrl(data.url)
      } catch {
        setError('Failed to load document. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    fetchPdfUrl()

    // Reset state when reopening
    setCurrentPage(1)
    setMarker(null)
    setPageSize(null)
  }, [show, documentId, accessToken])

  const handlePageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!pageWrapperRef.current || !pageSize) return

    const rect = pageWrapperRef.current.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top

    setMarker({ x: clickX, y: clickY })
  }

  const handleConfirm = () => {
    if (!marker || !pageSize || !pageWrapperRef.current) return

    const rect = pageWrapperRef.current.getBoundingClientRect()
    const scaleX = pageSize.width / rect.width
    const scaleY = pageSize.height / rect.height
    const pdfX = marker.x * scaleX
    const pdfY = pageSize.height - marker.y * scaleY - SIGNATURE_HEIGHT

    onPositionSelected({
      page: currentPage,
      x: Math.max(0, Math.min(pdfX, pageSize.width - SIGNATURE_WIDTH)),
      y: Math.max(0, Math.min(pdfY, pageSize.height - SIGNATURE_HEIGHT)),
      width: SIGNATURE_WIDTH,
      height: SIGNATURE_HEIGHT,
    })
  }

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
  }

  const onPageLoadSuccess = (page: { width?: number; height?: number; getViewport?: (options: { scale: number }) => { width: number; height: number } }) => {
    const viewport = page.getViewport?.({ scale: 1 })
    setPageSize({
      width: viewport?.width ?? page.width ?? 0,
      height: viewport?.height ?? page.height ?? 0,
    })
    setLoading(false)
  }

  if (!show) return null

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h5 className={styles.headerTitle}>Place Your Signature</h5>
          <p className={styles.headerSub}>
            Click anywhere on the PDF to choose where your signature will appear
          </p>
        </div>

        <div className={styles.body}>
          {error && (
            <div className={styles.errorBox}>
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {loading && !pdfUrl && (
            <div className={styles.loadingBox}>
              <div className={styles.spinner} />
              <span>Loading document...</span>
            </div>
          )}

          {pdfUrl && (
            <div className={styles.pdfContainer}>
              {/* @ts-ignore — react-pdf v9 type mismatch with React 18 */}
              <Document
                file={pdfUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                loading={null}
                error={
                  <div className={styles.errorBox}>
                    <span>⚠️</span>
                    <span>Failed to render PDF</span>
                  </div>
                }
              >
                <div
                  className={styles.pageWrapper}
                  ref={pageWrapperRef}
                  onClick={handlePageClick}
                >
                  {/* @ts-ignore — react-pdf v9 type mismatch with React 18 */}
                  <Page
                    pageNumber={currentPage}
                    onLoadSuccess={onPageLoadSuccess}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    width={640}
                  />
                  {marker && (
                    <div
                      className={styles.marker}
                      style={{
                        left: marker.x,
                        top: marker.y,
                      }}
                    >
                      <div className={styles.markerDot} />
                      <div className={styles.markerRing} />
                      <span className={styles.markerLabel}>SIGN HERE</span>
                    </div>
                  )}
                </div>
              </Document>

              {numPages > 1 && (
                <div className={styles.pagination}>
                  <button
                    className={styles.pageBtn}
                    disabled={currentPage <= 1}
                    onClick={() => {
                      setCurrentPage((p) => p - 1)
                      setMarker(null)
                    }}
                  >
                    ← Prev
                  </button>
                  <span className={styles.pageInfo}>
                    Page {currentPage} of {numPages}
                  </span>
                  <button
                    className={styles.pageBtn}
                    disabled={currentPage >= numPages}
                    onClick={() => {
                      setCurrentPage((p) => p + 1)
                      setMarker(null)
                    }}
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onHide}>
            Cancel
          </button>
          <button
            className={styles.confirmBtn}
            onClick={handleConfirm}
            disabled={!marker}
          >
            {marker ? 'Continue to Sign →' : 'Click on PDF to place signature'}
          </button>
        </div>
      </div>
    </div>
  )
}
