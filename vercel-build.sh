#!/bin/bash
set -e

echo "========================================"
echo "🔨 Vercel Build Script Started"
echo "========================================"
echo "Node version: $(node --version)"
echo "pnpm version: $(pnpm --version)"

echo ""
echo "Step 1: Installing dependencies with pnpm (with retry logic)..."

# Retry pnpm install with exponential backoff
max_attempts=3
attempt=1
while [ $attempt -le $max_attempts ]; do
  echo "  Attempt $attempt of $max_attempts..."
  if pnpm install --prefer-offline --ignore-scripts; then
    echo "  ✅ Install successful"
    break
  else
    if [ $attempt -lt $max_attempts ]; then
      echo "  ⚠️  Install failed, retrying in 10 seconds..."
      sleep 10
    fi
  fi
  attempt=$((attempt + 1))
done

echo ""
echo "Step 2: Building @esign/web frontend..."
pnpm --filter @esign/web build

echo ""
echo "========================================"
echo "✅ Build complete!"
echo "========================================"
