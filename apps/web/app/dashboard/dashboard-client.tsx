'use client'

import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import useSWR from 'swr'
import type { Role, PlanType } from '@esign/db'
import DocumentUpload from '@/components/DocumentUpload'
import DocumentList from '@/components/DocumentList'
import { useTokenRefresh } from '@/lib/useTokenRefresh'
import { storeTokens } from '@/lib/tokenUtils'
import styles from './dashboard.module.css'

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

interface User {
  id: string
  email: string
  name: string
  plan: string
  role: string
  totpEnabled: boolean
  accessToken?: string
}

export default function DashboardClient({ user }: { user: User }) {
  const { data: session } = useSession()
  const [showUpload, setShowUpload] = useState(false)
  const [accessToken, setAccessToken] = useState('')

  // Get access token from session or localStorage (client-side only)
  useEffect(() => {
    if (typeof window === 'undefined') return

    const sessionUser = session?.user as ExtendedUser | undefined
    console.log('[Dashboard] Session user:', {
      exists: !!sessionUser,
      hasAccessToken: !!sessionUser?.accessToken,
      tokenLength: sessionUser?.accessToken?.length || 0
    })

    const fromSession = sessionUser?.accessToken
    const fromStorage = localStorage.getItem('accessToken')
    const token = fromSession || fromStorage || ''

    console.log('[Dashboard] Token sources:', {
      fromSession: !!fromSession,
      fromStorage: !!fromStorage,
      final: { length: token.length, preview: token.slice(0, 20) }
    })

    setAccessToken(token)

    if (token && token.length > 0) {
      localStorage.setItem('accessToken', token)
      console.log('[Dashboard] Token persisted to localStorage')
    }
  }, [session])

  // Automatically refresh token before it expires
  useTokenRefresh({
    accessToken,
    onTokenRefreshed: (newAccessToken, newRefreshToken) => {
      console.log('[Dashboard] Token auto-refreshed')
      setAccessToken(newAccessToken)
      storeTokens(newAccessToken, newRefreshToken)
    },
    onRefreshFailed: () => {
      console.error('[Dashboard] Token refresh failed - user may need to re-login')
      signOut({ redirect: true, callbackUrl: '/auth/login' })
    },
  })

  const fetcher = (url: string) => {
    const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}${url}`
    console.log('[Dashboard] Fetching:', apiUrl, 'with token length:', accessToken?.length || 0)

    return fetch(apiUrl, {
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }).then((r) => {
      if (!r.ok) {
        console.error('[Dashboard] API error:', r.status, r.statusText)
        throw new Error(`API error: ${r.status}`)
      }
      return r.json()
    })
  }

  const { data, error, isLoading, mutate } = useSWR(
    accessToken ? '/api/documents?limit=10' : null,
    fetcher,
    {
      revalidateOnFocus: false,
      errorRetryCount: 1,
    }
  )

  const documents = data?.documents || []
  const totalDocs = documents.length
  const signedCount = documents.filter((d: any) => d.status === 'SIGNED').length
  const pendingCount = documents.filter((d: any) => d.status === 'PENDING').length

  return (
    <div className={styles.page}>
      {/* SIDEBAR — warm white + grid pattern */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarGrid} aria-hidden="true" />

        <div className={styles.sidebarInner}>
          {/* Logo & brand */}
          <div className={styles.logoSection}>
            <div className={styles.logoBadge}>
              <div className={styles.logoIcon}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 3h10M2 7h7M2 11h5" stroke="var(--warm-white)" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M10 9l2 2-2 2" stroke="var(--accent)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span className={styles.logoText}>SignHere</span>
            </div>
            <div className={styles.logoSub}>Document Platform</div>
          </div>

          {/* User card */}
          <div className={styles.userCard}>
            <div className={styles.cardAccent} />
            <div className={styles.userInfo}>
              <h4 className={styles.userName}>{user.name}</h4>
              <p className={styles.userEmail}>{user.email}</p>
              <div className={styles.planRow}>
                <span className={styles.planLabel}>PLAN</span>
                <span className={`${styles.planValue} ${user.plan === 'PRO' ? styles.pro : ''}`}>
                  {user.plan}
                </span>
                {user.role === 'ADMIN' && (
                  <span className={styles.adminBadge}>ADMIN</span>
                )}
              </div>
              {!user.totpEnabled && (
                <div className={styles.mfaWarning}>⚠ MFA not enabled</div>
              )}
            </div>
          </div>

          {/* Navigation */}
          <nav className={styles.navMenu}>
            <button
              className={`${styles.navItem} ${!showUpload ? styles.active : ''}`}
              onClick={() => setShowUpload(false)}
            >
              <span>📄 Documents</span>
              <span className={styles.badgeCount}>{totalDocs}</span>
            </button>
            <button
              className={`${styles.navItem} ${showUpload ? styles.active : ''}`}
              onClick={() => setShowUpload(true)}
            >
              <span>📤 Upload Document</span>
            </button>
          </nav>

          <button
            className={styles.uploadBtnSide}
            onClick={() => setShowUpload(true)}
          >
            + Upload Document
          </button>

          {/* Sidebar footer */}
          <div className={styles.sidebarFooter}>
            <button
              className={styles.signOutBtn}
              onClick={() => signOut({ callbackUrl: '/auth/login' })}
            >
              Sign out
            </button>
            <p className={styles.copyright}>SignHere © 2026</p>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT — dark theme with grid overlay */}
      <main className={styles.content}>
        <div className={styles.contentGrid} aria-hidden="true" />
        <div className={styles.contentContainer}>
          {/* Accent glow line */}
          <div className={styles.headerGlow} />

          {/* Title + stats cards */}
          <div className={styles.titleSection}>
            <div>
              <h1 className={styles.mainTitle}>Documents</h1>
              <p className={styles.pageSubtitle}>Manage and sign your documents securely</p>
            </div>
            <div className={styles.statGroup}>
              <div className={styles.statCard}>
                <div className={styles.statNumber}>{totalDocs}</div>
                <div className={styles.statLabel}>TOTAL</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statNumber}>{signedCount}</div>
                <div className={styles.statLabel}>SIGNED</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statNumber}>{pendingCount}</div>
                <div className={styles.statLabel}>PENDING</div>
              </div>
            </div>
          </div>

          {/* MFA security alert (if not enabled) */}
          {!user.totpEnabled && (
            <div className={styles.alertSecurity}>
              <span className={styles.alertIcon}>🔒</span>
              <div>
                <strong>Security Alert:</strong> Enable Multi-Factor Authentication to protect your account.
              </div>
            </div>
          )}

          {/* Upload panel (conditional) */}
          {showUpload && (
            <div className={styles.uploadPanel}>
              <div className={styles.uploadHeader}>
                <h3 className={styles.uploadTitle}>Upload Document</h3>
                <button
                  className={styles.closeUpload}
                  onClick={() => setShowUpload(false)}
                >
                  ✕
                </button>
              </div>
              <DocumentUpload
                onSuccess={() => {
                  setShowUpload(false)
                  mutate()
                }}
              />
            </div>
          )}

          {/* Document list card */}
          <div className={styles.docsCard}>
            <div className={styles.docsHeader}>
              <div>
                <h3 className={styles.docsTitle}>Recent Documents</h3>
                <p className={styles.docsSubtitle}>
                  {isLoading ? 'Loading...' : `${documents.length} documents`}
                </p>
              </div>
              <button
                className={styles.refreshIcon}
                onClick={() => mutate()}
                title="Refresh"
              >
                ↻
              </button>
            </div>

            <div className={styles.docsContent}>
              {isLoading && (
                <div className={styles.loadingState}>
                  <div className={styles.spinner} />
                  <p>Loading documents...</p>
                </div>
              )}

              {error && (
                <div className={styles.errorState}>
                  <p>Failed to load documents</p>
                  <small>{error.message}</small>
                </div>
              )}

              {!isLoading && !error && documents.length > 0 ? (
                <DocumentList documents={documents} onRefresh={mutate} />
              ) : !isLoading && !error ? (
                <div className={styles.emptyState}>
                  <p>No documents yet</p>
                  <button
                    className={styles.ctaBtn}
                    onClick={() => setShowUpload(true)}
                  >
                    Upload your first document
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}