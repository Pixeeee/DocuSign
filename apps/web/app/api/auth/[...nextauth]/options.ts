import type { AuthOptions, DefaultUser } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
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

export const authOptions: AuthOptions = {
  providers: [
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
          const apiUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/auth/login`
          console.log('[NextAuth] Calling', apiUrl, 'with email:', credentials.email)
          
          const payload: Record<string, string> = {
            email: credentials.email,
            password: credentials.password,
          }
          if (credentials.totpCode?.trim()) {
            payload.totpCode = credentials.totpCode.trim()
          }

          const response = await axios.post(apiUrl, payload)

          console.log('[NextAuth] Login response status:', response.status)
          const { user, accessToken, refreshToken } = response.data

          if (!user || !accessToken) {
            if (response.data?.mfaRequired) {
              console.log('[NextAuth] MFA required')
            } else {
              console.error('[NextAuth] Invalid response: missing user or token', response.data)
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
      console.log('[NextAuth signIn callback] user:', user?.id, 'account:', account?.provider)
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
      }
      return token
    },
    async session({ session, token }) {
      console.log('[NextAuth session callback] token has accessToken:', !!token.accessToken)
      if (session.user) {
        session.user.id = token.id as string
        ;(session.user as ExtendedUser).role = token.role as Role
        ;(session.user as ExtendedUser).plan = token.plan as PlanType
        ;(session.user as ExtendedUser).totpEnabled = token.totpEnabled as boolean
        ;(session.user as ExtendedUser).accessToken = token.accessToken as string
        ;(session.user as ExtendedUser).refreshToken = token.refreshToken as string
        console.log('[NextAuth session callback] session user token length:', (session.user as ExtendedUser).accessToken?.length || 0)
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