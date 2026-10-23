import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Appendices: what the agreement REFERENCES must be something it HOLDS — and
 * the counterparty must SEE it before signing.
 *
 * The gap was visible in production data: agent-authored agreements promising
 * "enligt Bilaga 1" with a precedence order, and nothing able to attach. An
 * appendix that the signing customer cannot see is not an appendix.
 */

const mig = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260808400000_contract-appendices.sql'), 'utf-8');
const publicPage = readFileSync(
  resolve(__dirname, '../../../src/pages/PublicContractPage.tsx'), 'utf-8');
const panel = readFileSync(
  resolve(__dirname, '../../../src/components/admin/contracts/ContractAppendicesPanel.tsx'), 'utf-8');

describe('an appendix always contains something', () => {
  it('a file needs a URL and a document needs a body — no half-created appendices', () => {
    expect(mig).toMatch(/kind = 'file' AND file_url IS NOT NULL/);
    expect(mig).toMatch(/kind = 'document' AND coalesce\(trim\(body_markdown\), ''\) <> ''/);
  });

  it('relaxes the file columns so a markdown appendix can exist at all', () => {
    expect(mig).toMatch(/ALTER COLUMN file_name DROP NOT NULL/);
    expect(mig).toMatch(/ALTER COLUMN file_url {2}DROP NOT NULL/);
  });

  it('carries the label — the join between the prose and the object', () => {
    // The body says "Bilaga 1"; the register must carry that exact wording or
    // the customer cannot match the reference to the attachment.
    expect(mig).toMatch(/ADD COLUMN IF NOT EXISTS label text/);
    expect(mig).toMatch(/ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0/);
  });

  it('refuses to create an appendix with no content', () => {
    expect(mig).toMatch(/An appendix needs content: pass template, body_markdown or file_url/);
  });
});

describe('the counterparty sees them where they sign', () => {
  it('the public token RPC returns the appendices, ordered', () => {
    const fn = mig.slice(mig.indexOf('CREATE FUNCTION public.get_public_contract'));
    expect(fn).toMatch(/appendices jsonb/);
    expect(fn).toMatch(/ORDER BY d\.sort_order/);
    // Never NULL — the page must be able to read .length without a guard.
    expect(fn).toMatch(/coalesce\(\([\s\S]*?\), '\[\]'::jsonb\) AS appendices/);
  });

  it('the return type change drops the old function first (42P13 trap)', () => {
    const dropAt = mig.indexOf('DROP FUNCTION IF EXISTS public.get_public_contract(text)');
    const createAt = mig.indexOf('CREATE FUNCTION public.get_public_contract(p_token text)');
    expect(dropAt).toBeGreaterThan(-1);
    expect(dropAt).toBeLessThan(createAt);
  });

  it('the signing page renders document appendices INLINE, so the saved PDF is complete', () => {
    // Files can be links; a document appendix must be in the page itself or
    // "Save as PDF" produces an incomplete copy of what was signed.
    expect(publicPage).toMatch(/appendices[\s\S]{0,400}filter\(\(a\) => a\.kind === 'document' && a\.body_markdown\)/);
    expect(publicPage).toMatch(/<ReactMarkdown remarkPlugins=\{\[remarkGfm\]\}>\{a\.body_markdown as string\}/);
  });

  it('lists every appendix in one list, whatever its kind', () => {
    expect(publicPage).toMatch(/omfattas av din signering/);
    expect(publicPage).toMatch(/appendices\.map\(\(a\) =>/);
  });

  it('the open-file link never leaks the referrer', () => {
    expect(publicPage).toMatch(/rel="noreferrer noopener"/);
  });
});

describe('writes are staff-only', () => {
  it('drops the any-authenticated-user write policies', () => {
    expect(mig).toMatch(/DROP POLICY IF EXISTS "Authenticated users can create contract documents"/);
    expect(mig).toMatch(/DROP POLICY IF EXISTS "Authenticated users can delete contract documents"/);
  });

  it('the RPC gates on staff or service_role', () => {
    expect(mig).toMatch(/auth\.role\(\) = 'service_role' OR is_staff\(auth\.uid\(\)\)/);
    expect(mig).toMatch(/Only staff can manage contract appendices/);
  });
});

describe('appendices are not the same thing as documents', () => {
  it('the admin panel says what makes an appendix different', () => {
    // Documents (correspondence, the countersigned PDF) stay in the Documents
    // tab; only appendices travel to the counterparty as part of the signature.
    expect(panel).toMatch(/covered by the signature/);
    expect(panel).toMatch(/Documents tab/);
  });

  it('warns when the body references a Bilaga that does not exist', () => {
    expect(panel).toMatch(/signs a reference to something that isn/);
  });
});

describe('the signature covers the appendices, not just the body', () => {
  const sign = readFileSync(
    resolve(__dirname, '../../../supabase/functions/contract-sign/index.ts'), 'utf-8');
  const module_ = readFileSync(
    resolve(__dirname, '../../../src/lib/modules/contracts-module.ts'), 'utf-8');

  it('loads the appendices in the order the customer read them', () => {
    expect(sign).toMatch(/from\('contract_documents'\)[\s\S]{0,220}order\('sort_order', \{ ascending: true \}\)/);
  });

  it('folds their content into the tamper-evidence hash', () => {
    // Without this the hash proves the body only — Bilaga 1 could be swapped
    // after signing and the certificate would still verify.
    const hash = sign.slice(sign.indexOf('const contentHash = await sha256Hex'), sign.indexOf('// Record signature'));
    expect(hash).toMatch(/appendices: appendices\.map/);
    expect(hash).toMatch(/body_markdown: a\.body_markdown \?\? null/);
    expect(hash).toMatch(/file_url: a\.file_url \?\? null/);
  });

  it('freezes them in the version snapshot', () => {
    expect(sign).toMatch(/snapshot: \{ \.\.\.contract, \.\.\.updates, appendices \}/);
  });
});

describe('agents can attach an appendix, and know not to confuse it with an archive document', () => {
  const module_ = readFileSync(
    resolve(__dirname, '../../../src/lib/modules/contracts-module.ts'), 'utf-8');
  const seed = module_.slice(
    module_.indexOf("name: 'manage_contract_appendix'"),
    module_.indexOf("name: 'list_contract_documents'"));

  it('is an rpc skill whose params match the function (self-correcting errors)', () => {
    expect(seed).toMatch(/handler: 'rpc:manage_contract_appendix'/);
    for (const p of ['action', 'contract_id', 'appendix_id', 'template', 'body_markdown', 'file_url', 'label', 'title', 'sort_order']) {
      expect(seed).toContain(`${p}: {`);
    }
  });

  it('teaches the label is the join with the body text', () => {
    expect(seed).toMatch(/THE LABEL IS THE JOIN/);
    expect(seed).toMatch(/never edit the reference away/);
  });

  it('warns that a signed agreement’s appendices must not be edited', () => {
    expect(seed).toMatch(/AFTER SIGNING: do not edit or delete an appendix/);
    expect(seed).toMatch(/Add an amendment as a new appendix instead/);
  });

  it('list_contract_documents now says it is the ARCHIVE, not the appendices', () => {
    const docs = module_.slice(module_.indexOf("name: 'list_contract_documents'"));
    expect(docs.slice(0, 900)).toMatch(/FILED AGAINST a contract/);
    expect(docs.slice(0, 900)).toMatch(/NOT for: the agreement\\'s own appendices/);
  });

  it('the authoring guide tells the agent to ATTACH what the body references', () => {
    expect(module_).toMatch(/WHEN A BODY REFERENCES A BILAGA, ATTACH IT/);
    expect(module_).toMatch(/manage_contract_appendix \(action=create/);
  });
});
