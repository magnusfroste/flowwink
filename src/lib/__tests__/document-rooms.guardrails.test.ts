import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A document room is a collection, not a copy — and a personal link, not a
 * shared one (Peter's backlog, optic, 2026-11-05). What this pins:
 *
 * - the four tables, RLS on each, every policy on the matrix (documents);
 * - manage_document_room is guarded by the matrix (never a literal admin
 *   role) and is the ONE function the hook and the skill call, with the
 *   skill's parameters equal to the function's signature minus p_;
 * - open_document_room (the recipient) is guarded by token_is_plausible and
 *   never answers a file_url or a token; resolve_document_room_file is
 *   service-role only and the edge function is its only caller;
 * - the public page is not indexed and reads its copy from the ui-text layer.
 */
const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const MIGRATION = 'supabase/migrations/20261107120000_rummet-ar-en-samling-inte-en-kopia.sql';

describe('the room is a collection, not a copy', () => {
  const mig = read(MIGRATION);

  it('four tables, RLS on each, every policy on the documents module', () => {
    for (const t of ['document_rooms', 'document_room_items', 'document_room_members', 'document_room_access']) {
      expect(mig, t).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${t} \\(`));
      expect(mig, `RLS ${t}`).toMatch(new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY;`));
    }
    const policies = mig.match(/CREATE POLICY[\s\S]*?;/g) ?? [];
    expect(policies.length).toBe(4);
    for (const p of policies) {
      expect(p).toMatch(/public\.can_access_module\(auth\.uid\(\), 'documents'\)/);
      expect(p).not.toMatch(/has_role\(/);
    }
    // The log is written by the functions, never by a client.
    expect(mig).toMatch(/document_room_access is read by the documents module[\s\S]*?FOR SELECT/);
    expect(mig).toMatch(/GRANT SELECT ON public\.document_room_access TO authenticated;/);
  });

  it('an item points at a document and vanishes with it; nothing copies file_url', () => {
    expect(mig).toMatch(/document_id uuid NOT NULL REFERENCES public\.documents\(id\) ON DELETE CASCADE/);
    const items = mig.slice(mig.indexOf('CREATE TABLE IF NOT EXISTS public.document_room_items'), mig.indexOf('CREATE TABLE IF NOT EXISTS public.document_room_members'));
    expect(items).not.toMatch(/file_url|title/);
  });

  it('manage_document_room follows the matrix and is the one function both sides call', () => {
    const fn = mig.slice(mig.indexOf('FUNCTION public.manage_document_room('), mig.indexOf('FUNCTION public.open_document_room('));
    expect(fn).toMatch(/auth\.role\(\) = 'service_role' OR public\.can_access_module\(auth\.uid\(\), 'documents'\)/);
    expect(fn).not.toMatch(/has_role\(auth\.uid\(\), 'admin'/);
    expect(fn).toMatch(/REVOKE EXECUTE ON FUNCTION public\.manage_document_room\([^)]*\) FROM PUBLIC, anon;/);
    expect(read('src/hooks/useDocumentRooms.ts')).toMatch(/supabase\.rpc\('manage_document_room' as never/);
    expect(read('src/lib/modules/documents-module.ts')).toMatch(/handler: 'rpc:manage_document_room'/);
  });

  it("the skill's parameters are the function's signature minus p_", () => {
    const sig = mig.match(/FUNCTION public\.manage_document_room\(([\s\S]*?)\) RETURNS jsonb/)![1];
    const sqlParams = [...sig.matchAll(/p_([a-z_]+)\s/g)].map((m) => m[1]).sort();
    const mod = read('src/lib/modules/documents-module.ts');
    const skill = mod.slice(mod.indexOf("name: 'manage_document_room'"), mod.indexOf("name: 'upload_document'"));
    const props = skill.slice(skill.indexOf('properties: {'));
    const skillParams = [...props.matchAll(/^\s{12}([a-z_]+): \{/gm)].map((m) => m[1]).sort();
    expect(skillParams).toEqual(sqlParams);
    expect(skill).toMatch(/risk: 'medium'/);
    expect(skill).toMatch(/reversal: /);
  });

  it('the recipient gets a fixed shape — guarded token, no file_url, no token', () => {
    const fn = mig.slice(mig.indexOf('FUNCTION public.open_document_room('), mig.indexOf('FUNCTION public.resolve_document_room_file('));
    expect(fn).toMatch(/NOT public\.token_is_plausible\(p_token\)/);
    expect(fn).toMatch(/revoked_at IS NOT NULL/);
    expect(fn).toMatch(/expires_at < now\(\)/);
    expect(fn).toMatch(/is_active/);
    const answer = fn.slice(fn.indexOf("'ok', true"));
    expect(answer).not.toMatch(/file_url|'token'|m\.token|v_member\.token/);
    expect(fn).toMatch(/GRANT EXECUTE ON FUNCTION public\.open_document_room\(text, text\) TO anon, authenticated, service_role;/);
    expect(fn).toMatch(/INSERT INTO document_room_access/);
  });

  it('the file resolver is service-role only, logs in the member\'s name, and a view link never downloads', () => {
    const fn = mig.slice(mig.indexOf('FUNCTION public.resolve_document_room_file('));
    expect(fn).toMatch(/IF auth\.role\(\) <> 'service_role' THEN/);
    expect(fn).toMatch(/NOT public\.token_is_plausible\(p_token\)/);
    expect(fn).toMatch(/IF p_action = 'download' AND v_member\.permission <> 'download' THEN RETURN; END IF;/);
    expect(fn).toMatch(/INSERT INTO document_room_access \(room_id, member_id, document_id, document_title, action, user_agent\)/);
    expect(fn).toMatch(/REVOKE EXECUTE ON FUNCTION public\.resolve_document_room_file\(text, uuid, text, text\) FROM PUBLIC, anon, authenticated;/);
    expect(fn).toMatch(/RETURNS TABLE \(file_url text, file_name text, file_type text\)/);
  });

  it('document-share is the one caller of the resolver, with the member token and the document', () => {
    const edge = read('supabase/functions/document-share/index.ts');
    expect(edge).toMatch(/supabase\.rpc\("resolve_document_room_file", \{\s*p_token: roomToken,\s*p_document_id: roomDoc,\s*p_action: mode === "download" \? "download" : "view"/);
    expect(read('src/hooks/useDocumentRooms.ts')).toMatch(/functions\/v1\/document-share\?room=/);
  });
});

describe('the recipient page', () => {
  const page = read('src/pages/PublicDocumentRoomPage.tsx');
  it('is routed, not indexed, and reads its copy from the ui-text layer', () => {
    expect(read('src/App.tsx')).toMatch(/\{ path: "\/room\/:token", element: <PublicDocumentRoomPage \/> \}/);
    expect(read('src/App.tsx')).toMatch(/\{ path: "\/admin\/documents\/rooms", element: <DocumentRoomsPage \/> \}/);
    expect(page).toMatch(/<meta name="robots" content="noindex, nofollow" \/>/);
    expect(page).toMatch(/const t = useUiText\(\);/);
    expect(page).toMatch(/supabase\.rpc\('open_document_room' as never/);
    expect(page).toMatch(/documentRoomFileUrl\(token, d\.id, 'download'\)/);
  });
  it('never builds a file URL of its own', () => {
    expect(page).not.toMatch(/file_url|createSignedUrl|storage\.from/);
  });
});
