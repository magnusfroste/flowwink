#!/usr/bin/env node

/**
 * Auto-migration runner for FlowWink
 * Runs Supabase migrations automatically before starting the dev server
 * Similar to how AnythingLLM runs Prisma migrations
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Check if migrations directory exists
const migrationsDir = join(projectRoot, 'supabase', 'migrations');
if (!existsSync(migrationsDir)) {
  console.log('ℹ️  No migrations directory found, skipping...');
  process.exit(0);
}

// Check if Supabase is configured
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseProjectId = process.env.VITE_SUPABASE_PROJECT_ID;

if (!supabaseUrl || !supabaseProjectId) {
  console.log('⚠️  Supabase not configured, skipping migrations');
  console.log('   Set VITE_SUPABASE_URL and VITE_SUPABASE_PROJECT_ID to enable auto-migrations');
  process.exit(0);
}

console.log('📦 Checking for pending database migrations...');

try {
  // Check if supabase CLI is available
  try {
    execSync('supabase --version', { stdio: 'pipe' });
  } catch (error) {
    console.log('ℹ️  Supabase CLI not available, skipping migrations');
    console.log('   Install with: npm install -g supabase');
    process.exit(0);
  }

  // Try to run migrations
  console.log('🔄 Running database migrations...');
  
  try {
    execSync('supabase db push', {
      stdio: 'inherit',
      cwd: projectRoot
    });
    console.log('✅ Migrations completed successfully!');
  } catch (error) {
    console.log('⚠️  Could not run migrations automatically');
    console.log('   This is normal if:');
    console.log('   - You are using a cloud Supabase instance (run migrations manually)');
    console.log('   - You need to link your project first: supabase link');
    console.log('');
    console.log('   To run migrations manually:');
    console.log('   supabase db push');
    console.log('');
    // Don't exit with error - allow dev server to start anyway
  }
} catch (error) {
  console.error('❌ Error checking migrations:', error.message);
  // Don't exit with error - allow dev server to start anyway
}

process.exit(0);
