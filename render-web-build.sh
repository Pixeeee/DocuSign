#!/bin/bash
set -e

echo "📦 Installing dependencies..."
pnpm install

echo "📝 Generating Prisma client..."
pnpm run db:generate

echo "🔨 Building @esign/utils..."
pnpm --filter @esign/utils build

echo "🔐 Building @esign/crypto..."
pnpm --filter @esign/crypto build

echo "💰 Building @esign/payments..."
pnpm --filter @esign/payments build

echo "📊 Building @esign/db..."
pnpm --filter @esign/db build

echo "🌐 Building @esign/web..."
pnpm --filter @esign/web build

echo "✅ Build complete!"
