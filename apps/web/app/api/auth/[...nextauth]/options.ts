import type { AuthOptions, DefaultUser } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import type { Role, PlanType } from '@esign/db'
import axios from 'axios'

interface ExtendedUser extends DefaultUser {
  id: string
  role: Role
  plan: PlanType
  totpEnabled: boolean
  accessToken?: string
  refreshToken?: string
}

interface ApiAuthResponse {
  user: {
    id: string
    email: string
    firstName: string
    lastName: string
    role: Role
    plan: PlanType
    totpEnabled: boolean
  }
  accessToken: string
  refreshToken: string
}

interface ApiTokenResponse {
  accessToken: string
  refreshToken: string
}

const API_RETRY_DELAYS_MS = [2000, 5000, 10000]

function getApiBaseUrl(): string {
  return (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '')
}

function isRenderHibernateRateLimit(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false
  return (
    error.response?.status === 429 &&
    error.response.headers?.['x-render-routing'] === 'hibernate-rate-limited'
  )
}

async function postApi<T>(path: string, data: unknown): Promise<T> {
  const apiUrl = `${getApiBaseUrl()}${path}`
  let lastError: unknown

  for (let attempt = 0; attempt <= API_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const response = await axios.post<T>(apiUrl, data, { timeout: 20000 })
      return response.data
    } catch (error) {
      lastError = error

      if (!isRenderHibernateRateLimit(error) || attempt === API_RETRY_DELAYS_MS.length) {
        throw error
      }

      console.warn(
        `[NextAuth] API is waking from Render hibernation, retrying ${path} in ${API_RETRY_DELAYS_MS[attempt]}ms`
      )
      await new Promise((resolve) => setTimeout(resolve, API_RETRY_DELAYS_MS[attempt]))
    }
  }

  throw lastError
}

function getJwtExpiryMs(token?: unknown): number | null {
  if (typeof token !== 'string') return null

  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : null
  } catch {
    return null
  }
}

async function refreshApiTokens(refreshToken?: unknown): Promise<ApiTokenResponse | null> {
  if (typeof refreshToken !== 'string' || !refreshToken) return null

  try {
    return await postApi<ApiTokenResponse>('/api/auth/refresh', { refreshToken })
  } catch (error) {
    console.error('[NextAuth] API token refresh failed:', axios.isAxiosError(error) ? {
      status: error.response?.status,
      message: error.message,
    } : error)
    return null
  }
}

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        totpCode: { label: 'MFA Code', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          console.error('[NextAuth] Missing email or password')
          return null
        }

        try {
          console.log('[NextAuth] Calling /api/auth/login with email:', credentials.email)
          
          const payload: Record<string, string> = {
            email: credentials.email,
            password: credentials.password,
          }
          if (credentials.totpCode?.trim()) {
            payload.totpCode = credentials.totpCode.trim()
          }

          const data = await postApi<ApiAuthResponse & { mfaRequired?: boolean }>('/api/auth/login', payload)

          const { user, accessToken, refreshToken } = data

          if (!user || !accessToken) {
            if (data?.mfaRequired) {
              console.log('[NextAuth] MFA required')
            } else {
              console.error('[NextAuth] Invalid response: missing user or token', data)
            }
            return null
          }

          console.log('[NextAuth] User authorized:', user.id)
          return {
            id: user.id,
            email: user.email,
            name: `${user.firstName} ${user.lastName}`,
            role: user.role as Role,
            plan: user.plan as PlanType,
            totpEnabled: user.totpEnabled,
            accessToken,
            refreshToken,
          } as ExtendedUser
        } catch (error) {
          console.error('[NextAuth] Authorization error:', error instanceof axios.AxiosError ? {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message,
          } : error)
          
          // Check if error is 200 status with mfaRequired
          if (axios.isAxiosError(error) && error.response?.status === 200) {
            const data = error.response.data
            if (data.mfaRequired) {
              console.log('[NextAuth] MFA required')
              return null
            }
          }
          return null
        }
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      console.log('[NextAuth signIn callback] provider:', account?.provider)
      
      // Handle Google OAuth
      if (account?.provider === 'google' && account.id_token) {
        try {
          const response = await postApi<ApiAuthResponse>('/api/auth/google', {
            idToken: account.id_token,
          })
          
          const { user: dbUser, accessToken, refreshToken } = response
          
          if (accessToken && refreshToken) {
            const googleUser = user as ExtendedUser
            googleUser.id = dbUser.id
            googleUser.email = dbUser.email
            googleUser.accessToken = accessToken
            googleUser.refreshToken = refreshToken
            googleUser.role = dbUser.role
            googleUser.plan = dbUser.plan
            googleUser.totpEnabled = dbUser.totpEnabled
          }
        } catch (error) {
          console.error('[NextAuth] Google sign-in error:', axios.isAxiosError(error) ? {
            status: error.response?.status,
            data: error.response?.data,
            renderRouting: error.response?.headers?.['x-render-routing'],
            message: error.message,
          } : error)
          return false
        }
      }
      
      return true
    },
    async jwt({ token, user }) {
      if (user) {
        const extendedUser = user as ExtendedUser
        token.id = extendedUser.id
        token.role = extendedUser.role
        token.plan = extendedUser.plan
        token.totpEnabled = extendedUser.totpEnabled
        token.accessToken = extendedUser.accessToken
        token.refreshToken = extendedUser.refreshToken
        return token
      }

      const accessTokenExpiry = getJwtExpiryMs(token.accessToken)
      if (token.refreshToken && (!accessTokenExpiry || accessTokenExpiry - Date.now() < 60_000)) {
        const refreshed = await refreshApiTokens(token.refreshToken)
        if (refreshed?.accessToken && refreshed.refreshToken) {
          token.accessToken = refreshed.accessToken
          token.refreshToken = refreshed.refreshToken
        } else {
          delete token.accessToken
          delete token.refreshToken
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        ;(session.user as ExtendedUser).role = token.role as Role
        ;(session.user as ExtendedUser).plan = token.plan as PlanType
        ;(session.user as ExtendedUser).totpEnabled = token.totpEnabled as boolean
        ;(session.user as ExtendedUser).accessToken = token.accessToken as string
      }
      return session
    },
  },
  pages: {
    signIn: '/auth/login',
    error: '/auth/error',
  },
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days for testing
  },
  secret: process.env.NEXTAUTH_SECRET,
}
