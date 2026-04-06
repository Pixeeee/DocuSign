#!/bin/bash
set -e

echo "🔨 Render Build Script"
echo "   NODE_ENV: $NODE_ENV"
echo ""

# Install dependencies including dev dependencies (pnpm respects --prod=false over NODE_ENV)
echo "📦 Installing dependencies (including devDependencies)..."
pnpm install --prod=false

# Now build with production environment
echo ""
echo "🏗️  Building backend packages..."
export NODE_ENV=production
pnpm run build

echo ""
echo "✅ Render build complete"
