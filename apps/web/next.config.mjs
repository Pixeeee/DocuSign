import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isProduction = process.env.NODE_ENV === 'production'
loadEnv({ path: path.resolve(__dirname, '../../.env.local'), override: !isProduction })

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
const apiOrigin = new URL(apiUrl).origin
const isDev = process.env.NODE_ENV !== 'production'

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { allowedOrigins: ['localhost:3000'] } },
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        {
          key: 'Content-Security-Policy',
          value: [
            "default-src 'self'",
            `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https:",
            `connect-src 'self' ${apiOrigin} https://horizon-testnet.stellar.org https://horizon.stellar.org`,
            "font-src 'self'",
            "worker-src 'self' blob: https://cdnjs.cloudflare.com",
            "object-src 'none'",
            "base-uri 'self'",
            "frame-ancestors 'none'",
          ].join('; '),
        },
      ],
    },
  ],
  images: { domains: [] },
  poweredByHeader: false,
}

export default nextConfig
