import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PROCESS_IDS, PROCESS_LABELS } from '@/lib/processes';

/**
 * A process document is a process. PROCESS_IDS is what the admin's Process
 * Coverage page, the module tags and the labels read — and it had 14 entries
 * while docs/processes/ held 17 (plan-to-deliver, plan-to-produce and
 * sign-to-serve each had a doc, a battery scenario and a green run, and were
 * invisible in the product). One fact, two readers; this pins them together in
 * the direction the battery guard already pins the other way
 * (process-battery-covers-every-process).
 */
const root = join(__dirname, '../../..');
const docs = readdirSync(join(root, 'docs/processes'))
  .filter((f) => f.endsWith('.md') && f !== 'README.md')
  .map((f) => f.replace(/\.md$/, ''))
  .sort();

describe('PROCESS_IDS covers every process document', () => {
  it('every docs/processes/<id>.md has an id in PROCESS_IDS', () => {
    const missing = docs.filter((d) => !(PROCESS_IDS as readonly string[]).includes(d));
    expect(missing, 'add the id to PROCESS_IDS, its label, and its description on the coverage page').toEqual([]);
  });

  it('every PROCESS_IDS entry has a document and a label', () => {
    const undocumented = PROCESS_IDS.filter((id) => !docs.includes(id));
    expect(undocumented, 'a process id without docs/processes/<id>.md').toEqual([]);
    const unlabelled = PROCESS_IDS.filter((id) => !PROCESS_LABELS[id]);
    expect(unlabelled).toEqual([]);
  });
});
