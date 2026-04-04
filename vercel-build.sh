#!/bin/bash
set -e

echo "🔨 Vercel Build Script"
echo "   Node version: $(node --version)"
echo "   pnpm version: $(pnpm --version)"

echo "   Installing dependencies..."

# Install without frozen lockfile with extended timeouts and offline mode
# This prevents Vercel's Turbo from auto-running pnpm install
pnpm install \
  --no-frozen-lockfile \
  --prefer-offline \
  --fetch-timeout=120000 \
  --fetch-retry-mintimeout=30000 \
  --fetch-retry-maxtimeout=180000

echo "📦 Building frontend..."

# Build only the web app
pnpm --filter @esign/web build

echo "✅ Build complete"
