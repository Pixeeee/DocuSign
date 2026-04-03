#!/usr/bin/env node

/**
 * Smart build script for production deployment
 * - Installs have already run with NODE_ENV=development (includes all deps)
 * - This script runs with NODE_ENV=production
 * - Builds only backend for Render
 */

const { execSync } = require('child_process');

console.log(`🔨 Build Script`);
console.log(`   NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`   Building backend only (API + Database)\n`);

try {
  console.log('📦 Production Build (Backend Only)');
  
  console.log('   - Generating Prisma client');
  execSync('pnpm --filter @esign/db generate', { stdio: 'inherit' });
  
  console.log('\n   - Building @esign/db');
  execSync('pnpm --filter @esign/db build', { stdio: 'inherit' });
  
  console.log('\n   - Building @esign/api');
  execSync('pnpm --filter @esign/api build', { stdio: 'inherit' });
  
  console.log('\n✅ Production build complete\n');
  process.exit(0);
} catch (error) {
  console.error('\n❌ Build failed:', error.message);
  process.exit(1);
}
