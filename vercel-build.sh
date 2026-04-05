#!/bin/bash
set -e

echo "========================================"
echo "🔨 Vercel Build Script Started"
echo "========================================"
echo "Node version: $(node --version)"
echo "npm version: $(npm --version)"

echo ""
echo "Step 1: Installing dependencies with npm..."
npm install --prefer-offline --no-fund --legacy-peer-deps

echo ""
echo "Step 2: Building @esign/web frontend..."
npm run build --workspace @esign/web

echo ""
echo "========================================"
echo "✅ Build complete!"
echo "========================================"
