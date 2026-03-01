#!/usr/bin/env bun
/**
 * Template Export Script
 * 
 * Exports all registered TypeScript templates to self-contained JSON files
 * in the /templates/ directory. Blog posts and KB articles are embedded.
 * 
 * Usage:
 *   bun run scripts/templates-to-json.ts
 * 
 * This regenerates ALL template JSON files from the TypeScript sources.
 */

import { resolve, join } from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

// Use dynamic import to load the templates with proper path resolution
const ROOT = resolve(import.meta.dir, '..');
const OUT_DIR = join(ROOT, 'templates');

async function main() {
  console.log('🔄 Exporting templates to JSON...\n');

  // Ensure output directory exists
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
  }

  // Dynamic import of the template registry
  // Note: This requires the project's tsconfig paths to resolve @/ imports
  const { ALL_TEMPLATES } = await import('../src/data/templates/index');

  let count = 0;

  for (const template of ALL_TEMPLATES) {
    const filename = `${template.id}.json`;
    const filepath = join(OUT_DIR, filename);

    // Serialize with pretty-printing for readability
    const json = JSON.stringify(template, null, 2);

    writeFileSync(filepath, json, 'utf-8');
    console.log(`  ✅ ${filename} (${(json.length / 1024).toFixed(1)} KB)`);
    count++;
  }

  // Also export the blank template
  const { BLANK_TEMPLATE } = await import('../src/data/templates/blank');
  const blankJson = JSON.stringify(BLANK_TEMPLATE, null, 2);
  writeFileSync(join(OUT_DIR, 'blank.json'), blankJson, 'utf-8');
  console.log(`  ✅ blank.json (${(blankJson.length / 1024).toFixed(1)} KB)`);

  console.log(`\n✨ Exported ${count + 1} templates to /templates/`);
}

main().catch((err) => {
  console.error('❌ Export failed:', err);
  process.exit(1);
});
