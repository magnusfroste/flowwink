#!/usr/bin/env node
/** Regenerates the baseline after REMOVING hard-coded shapes (rounded-full / font-serif) from public components. */
import { writeFileSync } from 'node:fs';
import { scanHardcodedShapes } from './lib/scan-hardcoded-shapes.mjs';

const counts = scanHardcodedShapes();
const sum = (k) => Object.values(counts).reduce((a, c) => a + c[k], 0);
writeFileSync('src/lib/__tests__/fixtures/hardcoded-shapes-baseline.json', JSON.stringify(counts, null, 2) + '\n');
console.log(`✅ baseline: ${sum('roundedFull')} rounded-full, ${sum('fontSerif')} font-serif in ${Object.keys(counts).length} files`);
