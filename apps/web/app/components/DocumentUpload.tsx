'use client'

import { useState, useCallback, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useDropzone } from 'react-dropzone'
import axios from 'axios'
import type { AxiosError } from 'axios'
import { getAccessToken } from '../lib/tokenUtils'
import styles from './DocumentUpload.module.css'

interface Props {
  onSuccess: () => void
}

export default function DocumentUpload({ onSuccess }: Props) {
  const { data: session } = useSession()
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [accessToken, setAccessToken] = useState('')

  // Get access token from session or localStorage (client-side only)
  useEffect(() => {
    setAccessToken(getAccessToken(session))
  }, [session])

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const pdf = acceptedFiles[0]
    if (pdf) {
      setFile(pdf)
      setTitle(pdf.name.replace('.pdf', ''))
      setError('')
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024,
    onDropRejected: (fileRejections) => {
      setError(fileRejections[0]?.errors[0]?.message || 'File rejected')
    },
  })

  const handleUpload = async () => {
    if (!file || !title.trim()) return
    const token = getAccessToken(session) || accessToken
    if (!token) {
      setError('Not authenticated. Please log in again.')
      return
    }
    setAccessToken(token)
    setUploading(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('document', file)
      formData.append('title', title)

      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/documents/upload`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          onUploadProgress: (e) => {
            const pct = Math.round((e.loaded * 100) / (e.total || 1))
            setProgress(pct)
          },
        }
      )

      onSuccess()
    } catch (error) {
      const err = error as AxiosError<{ error?: string }>
      setError(err.response?.data?.error || 'Upload failed')
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }

  return (
    <div className={styles.container}>
      <h5 className={styles.title}>Upload Document</h5>

      {error && (
        <div className={styles.alert + ' ' + styles.alertDanger}>
          <span className={styles.alertIcon}>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      <div
        {...getRootProps()}
        className={`${styles.dropzone} ${isDragActive ? styles.active : ''}`}
      >
        <input {...getInputProps()} />
        {file ? (
          <div className={styles.fileInfo}>
            <span className={styles.fileIcon}>📄</span>
            <div className={styles.fileName}>{file.name}</div>
            <div className={styles.fileSize}>
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </div>
          </div>
        ) : isDragActive ? (
          <div className={styles.dropzoneContent}>
            <span className={styles.fileIcon}>📁</span>
            <p className={styles.dropzoneText}>Drop the PDF here...</p>
          </div>
        ) : (
          <div className={styles.dropzoneContent}>
            <span className={styles.fileIcon}>📤</span>
            <p className={styles.dropzoneText}>Drag & drop a PDF, or click to select</p>
            <p className={styles.dropzoneSubtext}>Max 50 MB • PDF files only</p>
          </div>
        )}
      </div>

      {file && (
        <div className={styles.formGroup}>
          <label className={styles.label}>Document Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter document title"
            className={styles.input}
          />
        </div>
      )}

      {uploading && (
        <div className={styles.progressContainer}>
          <div className={styles.progressBarBg}>
            <div
              className={styles.progressBarFill}
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className={styles.progressText}>{progress}%</p>
        </div>
      )}

      <div className={styles.buttonGroup}>
        <button
          className={styles.button + ' ' + styles.buttonPrimary}
          disabled={!file || !title || uploading}
          onClick={handleUpload}
        >
          {uploading ? (
            <>
              <span className={styles.spinner} />
              Uploading...
            </>
          ) : (
            'Upload & Hash Document'
          )}
        </button>
      </div>
    </div>
  )
}
