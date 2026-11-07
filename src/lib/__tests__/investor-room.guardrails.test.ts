import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The investor room knows who has read what (Peter's backlog, optic,
 * 2026-11-05: limited download, access log, view history, document-level
 * control). On top of the room (#919):
 *
 * - a member's scope (document_ids, NULL = the whole room) is applied by BOTH
 *   readers — the list and the file resolver — and validated on write
 *   against the room's items;
 * - per document: seen_by / unseen_by; per member: member_history;
 * - the recipient page measures "new" against last_visit_at, the value
 *   before this opening.
 */
const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const MIGRATION = 'supabase/migrations/20261107150000_investerarrummet-vet-vem-som-last-vad.sql';

describe('a member sees the whole room or exactly a subset', () => {
  const mig = read(MIGRATION);
  it('the scope is a nullable column with its meaning written down', () => {
    expect(mig).toMatch(/ALTER TABLE public\.document_room_members ADD COLUMN IF NOT EXISTS document_ids uuid\[\];/);
    expect(mig).toMatch(/COMMENT ON COLUMN public\.document_room_members\.document_ids IS/);
  });
  it('both readers apply the same filter', () => {
    const open = mig.slice(mig.indexOf('FUNCTION public.open_document_room('), mig.indexOf('FUNCTION public.resolve_document_room_file('));
    const resolve = mig.slice(mig.indexOf('FUNCTION public.resolve_document_room_file('));
    const filter = /\(v_member\.document_ids IS NULL OR d\.id = ANY\(v_member\.document_ids\)\)/;
    expect(open).toMatch(filter);
    expect(resolve).toMatch(filter);
  });
  it('a scope is validated against the room on write, and remove_document trims it', () => {
    const manage = mig.slice(mig.indexOf('FUNCTION public.manage_document_room('), mig.indexOf('FUNCTION public.open_document_room('));
    expect(manage).toMatch(/IF p_action IN \('add_member', 'set_member_documents'\) AND p_document_ids IS NOT NULL/);
    expect(manage).toMatch(/INVALID_INPUT: % of the document_ids are not in this room/);
    expect(manage).toMatch(/UPDATE document_room_members SET document_ids = array_remove\(document_ids, p_document_id\)/);
    // The signature is unchanged — the skill's parameters still match.
    expect(manage).toMatch(/p_expires_at timestamptz DEFAULT NULL\n\) RETURNS jsonb/);
  });
});

describe('who has read what', () => {
  const mig = read(MIGRATION);
  const manage = mig.slice(mig.indexOf('FUNCTION public.manage_document_room('), mig.indexOf('FUNCTION public.open_document_room('));
  it('get answers seen_by and unseen_by per document; unseen counts live members in scope only', () => {
    expect(manage).toMatch(/'seen_by', coalesce\(\(/);
    const unseen = manage.slice(manage.indexOf("'unseen_by'"), manage.indexOf("ORDER BY d.folder NULLS LAST, d.title)\n        FROM document_room_items"));
    expect(unseen).toMatch(/m\.revoked_at IS NULL/);
    expect(unseen).toMatch(/m\.expires_at IS NULL OR m\.expires_at >= now\(\)/);
    expect(unseen).toMatch(/m\.document_ids IS NULL OR d\.id = ANY\(m\.document_ids\)/);
  });
  it('member_history is one person: per document, not yet seen, every entry', () => {
    const hist = manage.slice(manage.indexOf("IF p_action = 'member_history'"));
    expect(hist).toMatch(/'per_document'/);
    expect(hist).toMatch(/'not_yet_seen'/);
    expect(hist).toMatch(/'history'/);
    expect(hist).toMatch(/WHERE a\.member_id = v_member\.id/);
  });
  it('the skill names both actions and the hook reads the history', () => {
    const mod = read('src/lib/modules/documents-module.ts');
    expect(mod).toMatch(/'add_member', 'set_member_documents', 'revoke_member', 'member_history'\]/);
    expect(mod).toMatch(/set_member_documents \{room_id, member_id, document_ids\}/);
    const hook = read('src/hooks/useDocumentRooms.ts');
    expect(hook).toMatch(/action: 'member_history', room_id: roomId!, member_id: memberId!/);
    const admin = read('src/pages/admin/DocumentRoomsPage.tsx');
    expect(admin).toMatch(/action: "set_member_documents"/);
    expect(admin).toMatch(/function MemberHistoryDialog/);
    expect(admin).toMatch(/d\.unseen_by/);
  });
});

describe('the recipient sees what is new since last time', () => {
  it('last_visit_at is the value before this opening, and the page measures New against it', () => {
    const mig = read(MIGRATION);
    const open = mig.slice(mig.indexOf('FUNCTION public.open_document_room('), mig.indexOf('FUNCTION public.resolve_document_room_file('));
    const assign = open.indexOf('v_last_visit := v_member.last_accessed_at;');
    const bump = open.indexOf('SET access_count = access_count + 1, last_accessed_at = now()');
    expect(assign).toBeGreaterThan(-1);
    expect(assign).toBeLessThan(bump);
    expect(open).toMatch(/'last_visit_at', v_last_visit/);
    expect(open).toMatch(/'added_at', i\.added_at/);
    const page = read('src/pages/PublicDocumentRoomPage.tsx');
    expect(page).toMatch(/const isNew = \(d: RoomDocument\) => !!last_visit_at && d\.added_at > last_visit_at;/);
    expect(page).toMatch(/t\('room\.new', 'New'\)/);
    expect(page).toMatch(/t\('room\.contents', 'Contents'\)/);
    expect(page).not.toMatch(/file_url|createSignedUrl|storage\.from/);
  });
});
