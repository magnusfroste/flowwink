// Skriver om baslinjen för svalda LÄSNINGAR. Kör den bara när siffran ska NED.
//   node scripts/regen-swallowed-reads-baseline.mjs
import { writeFileSync } from 'node:fs';
import { scanRepo } from './lib/scan-swallowed-errors.mjs';

const counts = {};
for (const h of scanRepo().filter((x) => x.kind === 'read')) counts[h.file] = (counts[h.file] ?? 0) + 1;
const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync('src/lib/__tests__/fixtures/swallowed-reads-baseline.json', JSON.stringify(sorted, null, 2) + '\n');
console.log(`baslinje: ${Object.keys(sorted).length} filer, ${Object.values(sorted).reduce((a, b) => a + b, 0)} svalda läsningar`);
