#!/bin/bash
set -e

echo "📦 Installing dependencies..."
pnpm install --prod=false

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is not set during web build; using a temporary Prisma generate URL."
  export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/esign_build?schema=public"
fi

echo "📝 Generating Prisma client..."
pnpm run db:generate

echo "🔨 Building @esign/utils..."
pnpm --filter @esign/utils build

echo "🔐 Building @esign/crypto..."
pnpm --filter @esign/crypto build

echo "� Building @esign/db..."
pnpm --filter @esign/db build

echo "💰 Building @esign/payments..."
pnpm --filter @esign/payments build

echo "🌐 Building @esign/web..."
pnpm --filter @esign/web build

echo "✅ Build complete!"
