#!/bin/bash
set -e

echo "========================================"
echo "🔨 Vercel Build Script - Apps/Web Only"
echo "========================================"
echo "Node version: $(node --version)"
echo "pnpm version: $(pnpm --version)"

echo ""
echo "Step 1: Installing dependencies from frozen lockfile..."
# Use frozen lockfile - no metadata fetches, just installs from cache
pnpm install --frozen-lockfile --prefer-offline --ignore-scripts

echo ""
echo "Step 2: Building @esign/web frontend..."
pnpm --filter @esign/web build

echo ""
echo "========================================"
echo "✅ Build and deployment complete!"
echo "========================================"
