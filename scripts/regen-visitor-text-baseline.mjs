#!/usr/bin/env node
/** Regenerates the baseline after REMOVING hardcoded visitor strings. */
import { writeFileSync } from 'node:fs';
import { scanHardcodedVisitorText } from './lib/scan-hardcoded-visitor-text.mjs';

const counts = scanHardcodedVisitorText();
const total = Object.values(counts).reduce((a, b) => a + b, 0);
writeFileSync(
  'src/lib/__tests__/fixtures/hardcoded-visitor-text-baseline.json',
  JSON.stringify(counts, null, 2) + '\n',
);
console.log(`✅ baseline: ${total} hardcoded visitor strings in ${Object.keys(counts).length} files`);
