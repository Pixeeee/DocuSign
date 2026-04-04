#!/bin/bash
set -e

echo "🔨 Vercel Build Script"
echo "   Installing dependencies..."

# Install without frozen lockfile to allow pnpm to update if needed
pnpm install --no-frozen-lockfile

echo "📦 Building frontend..."

# Build only the web app
pnpm --filter @esign/web build

echo "✅ Build complete"
