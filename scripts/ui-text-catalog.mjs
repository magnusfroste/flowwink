#!/usr/bin/env node
/**
 * Regenerates src/data/ui-text-catalog.json from the call sites.
 * Run after adding or renaming a t('key', 'English') anywhere in src/.
 */
import { writeFileSync } from 'node:fs';
import { extractUiTextKeys } from './lib/extract-ui-text-keys.mjs';

const root = process.cwd();
const keys = extractUiTextKeys(root);
const conflicts = keys.filter((k) => k.conflicts?.length);

writeFileSync(
  'src/data/ui-text-catalog.json',
  JSON.stringify({ keys: keys.map(({ key, group, fallback }) => ({ key, group, fallback })) }, null, 2) + '\n',
);

console.log(`✅ ui-text-catalog: ${keys.length} keys in ${new Set(keys.map((k) => k.group)).size} groups`);
if (conflicts.length) {
  console.log('\n⚠️  keys whose English differs between call sites — one of them is wrong:');
  for (const c of conflicts) console.log(`   ${c.key}: "${c.fallback}" vs ${c.conflicts.map((x) => `"${x}"`).join(', ')}`);
}
