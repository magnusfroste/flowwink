#!/usr/bin/env bun
/**
 * One-shot retro-fill: inject `processes` + `maturity` into every
 * `defineModule({...})` block under src/lib/modules/ based on the mapping
 * below. Idempotent — skips files that already declare both fields.
 *
 *   bun run scripts/inject-process-maturity.ts
 */
import fs from 'node:fs';
import path from 'node:path';

type Entry = { processes: string[]; maturity: 'L1' | 'L2' | 'L3' | 'L4' | 'L5' };

const MAP: Record<string, Entry> = {
  accounting: { processes: ['quote-to-cash', 'procure-to-pay', 'record-to-report'], maturity: 'L3' },
  analytics: { processes: ['content-to-conversion', 'record-to-report', 'support-to-resolution'], maturity: 'L3' },
  approvals: { processes: ['procure-to-pay'], maturity: 'L3' },
  blog: { processes: ['content-to-conversion'], maturity: 'L4' },
  booking: { processes: ['lead-to-customer'], maturity: 'L3' },
  bookings: { processes: ['lead-to-customer'], maturity: 'L3' },
  'browser-control': { processes: ['lead-to-customer', 'content-to-conversion'], maturity: 'L3' },
  calendar: { processes: ['hire-to-retire', 'lead-to-customer'], maturity: 'L3' },
  chat: { processes: ['support-to-resolution', 'lead-to-customer'], maturity: 'L3' },
  clawable: { processes: [], maturity: 'L3' },
  companies: { processes: ['lead-to-customer'], maturity: 'L4' },
  'company-insights': { processes: ['lead-to-customer'], maturity: 'L3' },
  composio: { processes: [], maturity: 'L3' },
  contracts: { processes: ['quote-to-cash', 'hire-to-retire'], maturity: 'L3' },
  crm: { processes: ['lead-to-customer'], maturity: 'L4' },
  customer360: { processes: ['lead-to-customer', 'support-to-resolution'], maturity: 'L3' },
  deals: { processes: ['lead-to-customer', 'quote-to-cash'], maturity: 'L4' },
  developer: { processes: [], maturity: 'L3' },
  docs: { processes: ['content-to-conversion'], maturity: 'L3' },
  documents: { processes: ['procure-to-pay', 'hire-to-retire', 'order-to-delivery'], maturity: 'L3' },
  email: { processes: [], maturity: 'L3' },
  expenses: { processes: ['procure-to-pay', 'hire-to-retire', 'record-to-report'], maturity: 'L4' },
  federation: { processes: [], maturity: 'L3' },
  'field-service': { processes: ['order-to-delivery', 'support-to-resolution'], maturity: 'L2' },
  'fixed-assets': { processes: ['record-to-report'], maturity: 'L3' },
  flowpilot: { processes: [], maturity: 'L4' },
  forms: { processes: ['lead-to-customer'], maturity: 'L4' },
  'global-blocks': { processes: ['content-to-conversion'], maturity: 'L3' },
  growth: { processes: ['content-to-conversion'], maturity: 'L3' },
  handbook: { processes: ['hire-to-retire'], maturity: 'L2' },
  hr: { processes: ['hire-to-retire'], maturity: 'L3' },
  inventory: { processes: ['procure-to-pay', 'order-to-delivery'], maturity: 'L3' },
  invoicing: { processes: ['quote-to-cash', 'procure-to-pay', 'record-to-report'], maturity: 'L4' },
  kb: { processes: ['content-to-conversion', 'support-to-resolution'], maturity: 'L3' },
  'live-support': { processes: ['support-to-resolution'], maturity: 'L3' },
  manufacturing: { processes: ['procure-to-pay', 'order-to-delivery'], maturity: 'L2' },
  media: { processes: ['content-to-conversion'], maturity: 'L2' },
  'multi-currency': { processes: ['quote-to-cash', 'record-to-report'], maturity: 'L2' },
  newsletter: { processes: ['content-to-conversion', 'lead-to-customer'], maturity: 'L4' },
  pages: { processes: ['content-to-conversion'], maturity: 'L4' },
  payroll: { processes: ['hire-to-retire', 'record-to-report'], maturity: 'L2' },
  pos: { processes: ['order-to-delivery', 'record-to-report'], maturity: 'L3' },
  pricelists: { processes: ['quote-to-cash', 'order-to-delivery'], maturity: 'L3' },
  products: { processes: ['order-to-delivery', 'content-to-conversion'], maturity: 'L3' },
  projects: { processes: ['quote-to-cash'], maturity: 'L3' },
  purchasing: { processes: ['procure-to-pay'], maturity: 'L3' },
  quotes: { processes: ['quote-to-cash'], maturity: 'L3' },
  reconciliation: { processes: ['record-to-report', 'procure-to-pay'], maturity: 'L3' },
  recruitment: { processes: ['hire-to-retire'], maturity: 'L3' },
  resume: { processes: ['hire-to-retire'], maturity: 'L2' },
  returns: { processes: ['order-to-delivery'], maturity: 'L2' },
  river: { processes: [], maturity: 'L2' },
  'sales-intelligence': { processes: ['lead-to-customer'], maturity: 'L4' },
  shipping: { processes: ['order-to-delivery'], maturity: 'L2' },
  'site-migration': { processes: ['content-to-conversion'], maturity: 'L3' },
  sla: { processes: ['support-to-resolution', 'order-to-delivery'], maturity: 'L3' },
  subscriptions: { processes: ['quote-to-cash'], maturity: 'L3' },
  surveys: { processes: ['support-to-resolution', 'lead-to-customer'], maturity: 'L2' },
  templates: { processes: [], maturity: 'L3' },
  tickets: { processes: ['support-to-resolution'], maturity: 'L3' },
  timesheets: { processes: ['quote-to-cash', 'hire-to-retire'], maturity: 'L3' },
  webinars: { processes: ['lead-to-customer', 'content-to-conversion'], maturity: 'L3' },
  wiki: { processes: ['hire-to-retire'], maturity: 'L2' },
  'workspace-chat': { processes: [], maturity: 'L3' },
  browserControl: { processes: ['lead-to-customer', 'content-to-conversion'], maturity: 'L3' },
  companyInsights: { processes: ['lead-to-customer'], maturity: 'L3' },
  leads: { processes: ['lead-to-customer'], maturity: 'L4' },
  fieldService: { processes: ['order-to-delivery', 'support-to-resolution'], maturity: 'L2' },
  fixedAssets: { processes: ['record-to-report'], maturity: 'L3' },
  globalElements: { processes: ['content-to-conversion'], maturity: 'L3' },
  paidGrowth: { processes: ['content-to-conversion'], maturity: 'L3' },
  knowledgeBase: { processes: ['content-to-conversion', 'support-to-resolution'], maturity: 'L3' },
  liveSupport: { processes: ['support-to-resolution'], maturity: 'L3' },
  mediaLibrary: { processes: ['content-to-conversion'], maturity: 'L2' },
  multiCurrency: { processes: ['quote-to-cash', 'record-to-report'], maturity: 'L2' },
  ecommerce: { processes: ['order-to-delivery', 'content-to-conversion'], maturity: 'L3' },
  salesIntelligence: { processes: ['lead-to-customer'], maturity: 'L4' },
  siteMigration: { processes: ['content-to-conversion'], maturity: 'L3' },
  workspaceChat: { processes: [], maturity: 'L3' },
};

const dir = path.join(process.cwd(), 'src/lib/modules');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('-module.ts'));

let updated = 0;
let skipped = 0;
const missing: string[] = [];

for (const file of files) {
  const filePath = path.join(dir, file);
  const src = fs.readFileSync(filePath, 'utf8');

  // Find the defineModule() block + its own id literal (skip arbitrary *_id keys).
  const idMatch = src.match(/defineModule[\s\S]*?(?:^|\n)(\s+)id:\s*'([^']+)'/);
  if (!idMatch) {
    missing.push(`${file}: no defineModule id found`);
    continue;
  }
  const indent = idMatch[1];
  const id = idMatch[2];
  const entry = MAP[id];
  if (!entry) {
    missing.push(`${file}: id="${id}" missing from MAP`);
    continue;
  }

  if (/\n\s+processes:\s*\[/.test(src) && /\n\s+maturity:\s*'L/.test(src)) {
    skipped++;
    continue;
  }

  // Insert immediately after the `version:` line within the same defineModule call.
  const versionRe = new RegExp(`(\\n${indent}version:\\s*'[^']+',?\\n)`);
  if (!versionRe.test(src)) {
    missing.push(`${file}: no version line at expected indent`);
    continue;
  }
  const processesLine = `${indent}processes: [${entry.processes.map((p) => `'${p}'`).join(', ')}],\n`;
  const maturityLine = `${indent}maturity: '${entry.maturity}',\n`;
  const next = src.replace(versionRe, (_m, head) => `${head}${processesLine}${maturityLine}`);

  fs.writeFileSync(filePath, next, 'utf8');
  updated++;
}

console.log(`updated=${updated} skipped=${skipped} files=${files.length}`);
if (missing.length) {
  console.error('UNRESOLVED:\n' + missing.join('\n'));
  process.exit(1);
}
