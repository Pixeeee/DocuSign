#!/bin/bash
set -e

echo "========================================"
echo "🔨 Vercel Build Script - Apps/Web Only"
echo "========================================"
echo "Node version: $(node --version)"
echo "pnpm version: $(pnpm --version)"

echo ""
echo "Step 1: Building @esign/web frontend..."
# Dependencies are already installed by Vercel's installCommand
# Just build the web app
pnpm --filter @esign/web build

echo ""
echo "========================================"
echo "✅ Build and deployment complete!"
echo "========================================"
