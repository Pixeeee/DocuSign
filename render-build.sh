#!/bin/bash
set -e

echo "🔨 Render Build Script"
echo "   NODE_ENV: $NODE_ENV"
echo ""

# Install dependencies first with development environment
echo "📦 Installing dependencies..."
export NODE_ENV=development
pnpm install --frozen-lockfile

# Now build with production environment
echo ""
echo "🏗️  Building backend packages..."
export NODE_ENV=production
pnpm run build

echo ""
echo "✅ Render build complete"
