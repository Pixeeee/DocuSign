#!/usr/bin/env node

/**
 * Smart build script that works both locally and in production
 * - Locally: Uses turbo for efficient builds
 * - Production (Render): Builds only backend (@esign/api + @esign/db)
 */

const { execSync } = require('child_process');
const path = require('path');

const isProduction = process.env.NODE_ENV === 'production';

console.log(`🔨 Build Script`);
console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
console.log(`   Is Production: ${isProduction}\n`);

try {
  if (isProduction) {
    console.log('📦 Production Build (Backend Only)');
    console.log('   - Generating Prisma client');
    execSync('pnpm --filter @esign/db generate', { stdio: 'inherit' });
    
    console.log('\n   - Building database package');
    execSync('pnpm --filter @esign/db build', { stdio: 'inherit' });
    
    console.log('\n   - Building @esign/api');
    execSync('pnpm --filter @esign/api build', { stdio: 'inherit' });
    
    console.log('\n✅ Production build complete (backend only)');
  } else {
    console.log('📦 Development Build (All Workspaces)');
    execSync('turbo build', { stdio: 'inherit' });
    console.log('\n✅ Development build complete');
  }
  process.exit(0);
} catch (error) {
  console.error('\n❌ Build failed:', error.message);
  process.exit(1);
}
