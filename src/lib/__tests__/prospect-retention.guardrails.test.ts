/**
 * Gallring: prospekt som aldrig blev kund rensas efter 24 månader.
 *
 * Magnus beslut 2026-08-30. Säljliggaren bär fri text om identifierbara
 * människor — mötesanteckningar, omdömen, namngivna beslutsfattare — och en
 * bokföring har en bevarandetid. Den här ska ha en också.
 *
 * Radering är oåterkallelig, så grinden pinnar gränserna hårdare än funktionen
 * i sig: vad som ALDRIG rensas, att torrkörning är standard, och att fönstret
 * har ett golv. Bevisat live på optic i en rullad-tillbaka transaktion:
 * torrkörning rörde ingenting, golvet avvisade 3 månader, och av tre
 * planterade 30-månadersrader försvann bara det rena prospektet — kunden och
 * prospektet med affär stod kvar.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260830110000_gallring-av-prospekt-som-aldrig-blev-kund.sql'),
  'utf-8',
);

describe('vad som aldrig rensas', () => {
  it('kunder — nuvarande och tidigare', () => {
    expect(sql).toMatch(/l\.status <> 'customer'/);
    expect(sql).toMatch(/l\.converted_at IS NULL/);
  });

  it('varje kontakt med kommersiellt spår', () => {
    for (const t of ['deals', 'quotes', 'invoices', 'tickets', 'crm_tasks', 'pricelists']) {
      expect(sql).toMatch(new RegExp(`NOT EXISTS \\(SELECT 1 FROM ${t}`));
    }
  });

  it('och klockan går från SENASTE aktiviteten, inte från när raden skapades', () => {
    // En kontakt man rörde i förrgår är levande oavsett ålder.
    expect(sql).toMatch(/GREATEST\(/);
    expect(sql).toMatch(/max\(a\.created_at\) FROM lead_activities/);
  });
});

describe('svårt att göra fel av misstag', () => {
  it('torrkörning är standard — den som gissar ett funktionsnamn raderar inget', () => {
    expect(sql).toMatch(/p_dry_run boolean DEFAULT true/);
  });

  it('fönstret har ett golv, så ett tryckfel inte kostar ett år', () => {
    expect(sql).toMatch(/IF p_months < 6 THEN/);
    expect(sql).toMatch(/window must be at least 6 months/);
  });

  it('bara admin eller service_role', () => {
    expect(sql).toMatch(/purge_stale_prospects: admin or service_role required/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.purge_stale_prospects\(integer, boolean\) FROM anon/);
  });

  it('aktiviteterna tas före kontakten — ingen halvskrivning lämnas kvar', () => {
    const body = sql.slice(sql.indexOf('IF v_contacts > 0 AND NOT p_dry_run'));
    expect(body.indexOf('DELETE FROM lead_activities')).toBeLessThan(body.indexOf('DELETE FROM leads'));
  });
});

describe('att policyn tillämpas går att visa', () => {
  it('varje körning loggas — antal, fönster, torrkörning', () => {
    expect(sql).toMatch(/INSERT INTO data_retention_runs/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.data_retention_runs/);
  });

  it('men loggen bär inga personuppgifter — den visar ATT, inte VEM', () => {
    const table = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS public.data_retention_runs'), sql.indexOf('ALTER TABLE public.data_retention_runs'));
    expect(table).not.toMatch(/email|name|lead_id/);
  });

  it('cron kör månadsvis i ren SQL — ingen URL, inga nycklar', () => {
    expect(sql).toMatch(/'purge-stale-prospects',\s*\n\s*'15 3 1 \* \*',\s*\n\s*'SELECT public\.purge_stale_prospects\(24, false\);'/);
  });
});
