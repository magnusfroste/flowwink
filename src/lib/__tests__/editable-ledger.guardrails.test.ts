/**
 * Posten är orubblig, texten är rättningsbar (Magnus 2026-08-29).
 *
 * Aktivitetsloggen är säljbearbetningens huvudbok: `points` summeras till
 * kontaktens score, och kronologin är underlaget både människan och agenterna
 * svarar ur. Bokföringens disciplin ger oföränderlighet — men en mening om en
 * människa måste gå att rätta och att ta bort. Regeln som förenar dem är
 * hela poängen med den här grinden, åt båda hållen: struktur som inte kan
 * ändras, text som kan.
 *
 * Bevisat live på optic i en rullad-tillbaka transaktion, fyra riktningar:
 * poängändring stoppad, typändring stoppad, texträttelse genomförd med
 * edited_at satt och den ersatta lydelsen (2 608 tecken) bevarad i
 * note_history, och tömning genomförd med raden kvarstående.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
const sql = read('supabase/migrations/20260829190000_posten-orubblig-texten-rattningsbar.sql');
const hook = read('src/hooks/useEditActivityNote.ts');
const ui = read('src/components/admin/crm/UnifiedTimeline.tsx');
const timeline = read('src/hooks/useUnifiedTimeline.ts');

describe('posten är orubblig', () => {
  it('struktur som ändras SMÄLLER — den backas inte tyst', () => {
    expect(sql).toMatch(/NEW\.points\s+IS DISTINCT FROM OLD\.points/);
    expect(sql).toMatch(/NEW\.type\s+IS DISTINCT FROM OLD\.type/);
    expect(sql).toMatch(/NEW\.created_at IS DISTINCT FROM OLD\.created_at/);
    expect(sql).toMatch(/RAISE EXCEPTION 'lead_activities: the entry is immutable/);
  });

  it('saldot kan därmed inte skrivas om i efterhand', () => {
    // points summeras till leads.score. Vore posten redigerbar vore scoringen
    // det också — en poäng som går att ändra i efterhand är ingen poäng.
    expect(sql).toMatch(/points/);
    expect(sql).not.toMatch(/NEW\.points := /);
  });
});

describe('texten är rättningsbar — men bara av den som skrev den', () => {
  it('författare eller admin, aldrig vem som helst', () => {
    expect(sql).toMatch(/OLD\.created_by IS NOT NULL AND OLD\.created_by = v_uid/);
    expect(sql).toMatch(/has_role\(v_uid, 'admin'::app_role\)/);
    expect(sql).toMatch(/RAISE EXCEPTION 'lead_activities: only the author or an admin/);
  });

  it('författaren stämplas vid insert, men gissas aldrig åt en agent', () => {
    expect(sql).toMatch(/IF NEW\.created_by IS NULL THEN NEW\.created_by := v_uid/);
  });

  it('den ersatta lydelsen bevaras — annars är rättelse omskrivning', () => {
    expect(sql).toMatch(/'\{note_history\}'/);
    expect(sql).toMatch(/NEW\.edited_at := now\(\)/);
  });
});

describe('ytan visar vad som gäller', () => {
  it('bara människoskrivna rader får en rättelseknapp', () => {
    expect(ui).toMatch(/HUMAN_LOGGED = new Set\(\['note', 'call', 'meeting', 'email', 'task_completed'\]\)/);
    expect(ui).toMatch(/HUMAN_LOGGED\.has\(e\.activityType \?\? ''\)/);
    expect(ui).toMatch(/isAdmin \|\| \(!!e\.authorId && e\.authorId === user\?\.id\)/);
  });

  it('en rättad post säger att den är rättad, en tömd står kvar som gravsten', () => {
    expect(ui).toMatch(/>\s*edited\s*</);
    expect(ui).toMatch(/Note redacted/);
  });

  it('tidslinjen bär författare och redigeringsstämpel hela vägen ut', () => {
    expect(timeline).toMatch(/authorId\?: string \| null;/);
    expect(timeline).toMatch(/authorId: \(a as \{ created_by\?: string \| null \}\)\.created_by \?\? null/);
  });

  it('skrivningen läses tillbaka — en nekad rättelse får aldrig se ut som sparad', () => {
    expect(hook).toMatch(/\.select\('id, edited_at'\)/);
    expect(hook).toMatch(/if \(!data\?\.length\)/);
    expect(hook).toMatch(/only the author or an admin may correct an entry/);
  });
});
