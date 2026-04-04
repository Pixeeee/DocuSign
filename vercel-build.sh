#!/bin/bash
set -e

echo "🔨 Vercel Build Script"
echo "   Node version: $(node --version)"
echo "   npm version: $(npm --version)"
echo "   pnpm version: $(pnpm --version 2>/dev/null || echo 'not found')"

# Set aggressive network settings for pnpm
export NPM_CONFIG_FETCH_TIMEOUT=120000
export NPM_CONFIG_FETCH_RETRIES=5
export NODE_OPTIONS="--max-http-header-size=80000"

echo "   Setting pnpm registry to npmjs..."
pnpm config set registry https://registry.npmjs.org/

echo "   Installing dependencies with npm (fallback strategy)..."
# Use npm directly for stability on Vercel
npm install --prefer-offline --no-fund

echo "📦 Building frontend with pnpm..."
# Build only the web app
pnpm --filter @esign/web build

echo "✅ Build complete"
