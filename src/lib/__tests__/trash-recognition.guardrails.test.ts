import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { navigationGroups } from '@/components/admin/adminNavigation';
import { isRouteAllowed } from '@/lib/admin-route-access';
import type { AppRole } from '@/types/cms';

/**
 * Papperskorgen: igenkänning slår minne.
 *
 * Revisionshistoriken kunde redan återställa det som raderats. Den ställde bara
 * den enda fråga man inte kan svara på: VAD HETTE DET. `wiki_page_history` vill
 * ha en slug, `kb_article_history` vill ha ett revisions-id — och när något är
 * borta minns man ungefär vad det SA, sällan vad det hette, ofta inte ens
 * vilken modul det låg i ("var det wikin eller KB:n?"). Därför är listan
 * SAMLAD och varje rad bär en textförhandsvisning: man ska känna igen posten,
 * inte kunna namnge den.
 *
 * Två saker måste hålla för att ytan ska vara annat än dekoration:
 *
 *   1. Källorna är DATA (`trash_sources`), inte specialfall per innehållstyp.
 *      Att lägga till blog_posts ska vara en INSERT, inte en kodändring.
 *   2. "Töm permanent" måste RADERA REVISIONERNA. En knapp som bara döljer
 *      raden ljuger — och det är just den knappen man trycker på när något
 *      MÅSTE vara borta.
 */

const root = resolve(__dirname, '../../..');
const mig = readFileSync(
  resolve(root, 'supabase/migrations/20260824120000_a8b9c0d1-recognition-beats-recall.sql'),
  'utf-8',
);
const page = readFileSync(resolve(root, 'src/pages/admin/TrashPage.tsx'), 'utf-8');
const hook = readFileSync(resolve(root, 'src/hooks/useTrash.ts'), 'utf-8');
const wikiRpc = readFileSync(
  resolve(root, 'supabase/migrations/20260821010000_e1f2a3b4-frontend-rpcs-follow-the-matrix.sql'),
  'utf-8',
);
const kbRpc = readFileSync(
  resolve(root, 'supabase/migrations/20260708120000_kb-parity-r8.sql'),
  'utf-8',
);

/** trash_bin's body, without the registry seed above it. */
const fnBody = mig.slice(
  mig.indexOf('CREATE OR REPLACE FUNCTION public.trash_bin'),
  mig.indexOf('REVOKE EXECUTE ON FUNCTION public.trash_bin'),
);
const purgeBranch = fnBody.slice(fnBody.indexOf("IF p_action = 'purge' THEN"));
/** Kroppen utan kommentarer — prosa får nämna en innehållstyp, kod får inte. */
const fnCode = fnBody.replace(/--[^\n]*/g, '');

describe('en samlad papperskorg, inte en per modul', () => {
  it('har EN yta och den ligger utanför pages — den är inte en pages-funktion', () => {
    const app = readFileSync(resolve(root, 'src/App.tsx'), 'utf-8');
    expect(app).toMatch(/path: "\/admin\/trash", element: <TrashPage \/>/);
  });

  it('navposten är omodulerad: länken får aldrig vara grinden', () => {
    const items = navigationGroups.flatMap((g) => g.items);
    const trash = items.find((i) => i.href === '/admin/trash');
    expect(trash, 'Trash saknas i navigationen').toBeTruthy();
    // Ett moduleId hade valt EN modul godtyckligt och gömt korgen för alla
    // andra. Radfiltret i RPC:n är gaten, inte länken.
    expect(trash!.moduleId).toBeUndefined();
  });

  it('är nåbar för varje roll — RPC:n avgör vad de SER, inte routern', () => {
    const roles: AppRole[] = [
      'sales', 'support', 'accounting', 'hr', 'marketing', 'warehouse', 'purchasing', 'projects',
    ] as AppRole[];
    const denied = roles.filter(
      (r) => !isRouteAllowed('/admin/trash', { isAdmin: false, roles: [r], accessMap: {} }),
    );
    expect(denied).toEqual([]);
  });
});

describe('källorna är data, inte kod', () => {
  it('registret finns och bär den minsta gemensamma formen', () => {
    expect(mig).toMatch(/CREATE TABLE IF NOT EXISTS public\.trash_sources/);
    for (const col of [
      'identity_column', 'title_column', 'preview_column',
      'deleted_at_column', 'deleted_by_column', 'restore_rpc',
    ]) {
      expect(mig, `trash_sources saknar ${col}`).toContain(col);
    }
  });

  it('de tre källor som faktiskt lämnar spår är seedade', () => {
    for (const t of ['wiki_page_revisions', 'kb_article_revisions']) {
      expect(mig).toContain(t);
    }
    expect(mig).toMatch(/'pages', 'Page', 'pages', 'soft_delete'/);
  });

  it('trash_bin nämner INGEN innehållstyp — annars är registret dekoration', () => {
    // Om något av det här dyker upp i funktionskroppen har någon gjutit in ett
    // specialfall, och nästa innehållstyp kräver en kodändring igen.
    for (const leak of [
      'wiki_pages', 'kb_articles', 'wiki_page_revisions', 'kb_article_revisions',
      'content_md', 'answer_text', 'content_json',
      'wiki_page_history', 'kb_article_history',
    ]) {
      expect(fnCode, `trash_bin hårdkodar ${leak}`).not.toContain(leak);
    }
    // ...och 'pages' förekommer bara som public.pages i profiles-uppslaget.
    expect(fnCode).not.toMatch(/FROM public\.pages\b/);
  });

  it('en registrerad källa vars tabell saknas hoppas över, inte kraschar', () => {
    expect(fnBody).toMatch(/to_regclass\('public\.' \|\| quote_ident\(v_src\.history_table\)\) IS NULL/);
  });

  it('avvikande källor är UTELÄMNADE och motiverade, inte tyst inkluderade', () => {
    // docs_page_versions och document_versions har ON DELETE CASCADE mot sin
    // huvudtabell: spåret dör MED innehållet, så det finns inget att lista.
    expect(mig).toMatch(/docs_pages\s+docs_page_versions\.docs_page_id REFERENCES/);
    expect(mig).toMatch(/ON DELETE CASCADE/);
    expect(mig).not.toMatch(/'docs',\s*'Docs page'/);
    expect(mig).not.toMatch(/'documents',\s*'Document'/);
  });
});

describe('listan går att KÄNNA IGEN', () => {
  it('varje rad bär titel, förhandsvisning, tidpunkt och vem', () => {
    expect(fnBody).toMatch(/AS preview/);
    expect(fnBody).toMatch(/AS deleted_at/);
    expect(fnBody).toMatch(/AS deleted_by_name/);
    expect(fnBody).toMatch(/ORDER BY u\.deleted_at DESC/);
  });

  it('block-innehåll blir läsbar text — inte blocktyper, id:n och URL:er', () => {
    expect(mig).toMatch(/CREATE OR REPLACE FUNCTION public\.trash_text_from_jsonb/);
    expect(mig).toMatch(/kv\.key NOT IN \('type', 'id', 'blockId'/);
    expect(mig).toMatch(/!~ '\^\(https\?:\|\/\|#\|data:\)'/);
  });

  it('sökningen läser innehållet, inte bara titeln — det är hela poängen', () => {
    expect(fnBody).toMatch(/coalesce\(u\.preview, ''\) ILIKE/);
  });

  it('UI:t renderar förhandsvisningen (utan den är korgen lika trubbig som en fråga till en agent)', () => {
    expect(page).toMatch(/\{item\.preview\}/);
    expect(page).toMatch(/deleted_by_name/);
    expect(page).toMatch(/Search titles and content/);
  });
});

describe('restore återanvänder modulens egen väg', () => {
  it('delegerar till restore_rpc i stället för att skriva en andra implementation', () => {
    expect(fnBody).toMatch(
      /format\('SELECT public\.%I\(p_action => \$1, p_revision_id => \$2\)', v_src\.restore_rpc\)/,
    );
    // Ingen egen återställning per typ: migrationen får inte skriva i
    // innehållstabellerna alls.
    expect(mig).not.toMatch(/UPDATE public\.wiki_pages/);
    expect(mig).not.toMatch(/INSERT INTO public\.kb_articles/);
  });

  it('mjuk radering återställs genom att stämpeln tas bort — samma sak pages redan gjorde', () => {
    expect(fnBody).toMatch(/UPDATE public\.%I SET %I = NULL/);
    expect(fnBody).toMatch(/RAISE EXCEPTION 'Nothing to restore for/);
  });

  it('can_restore speglar den grind RPC:n FAKTISKT har (två kopior av en sanning driver isär)', () => {
    // wiki_page_history: matrisen. kb_article_history: admin.
    const wikiFn = wikiRpc.slice(wikiRpc.indexOf('CREATE OR REPLACE FUNCTION public.wiki_page_history'));
    expect(wikiFn).toMatch(/can_access_module\(auth\.uid\(\),'wiki'\)/);
    const kbFn = kbRpc.slice(kbRpc.indexOf('CREATE OR REPLACE FUNCTION public.kb_article_history'));
    expect(kbFn).toMatch(/has_role\(auth\.uid\(\), 'admin'\)/);

    // Registret måste säga samma sak, annars erbjuder UI:t en knapp som failar.
    expect(mig).toMatch(/'wiki_page_history', false/);
    expect(mig).toMatch(/'kb_article_history', true/);
    expect(fnBody).toMatch(/'can_restore', \(v_src\.restore_requires_admin IS NOT TRUE\) OR v_is_admin/);
    expect(page).toMatch(/can_restore/);
  });
});

describe('purge raderar på riktigt — spärren mot att knappen blir en illusion', () => {
  it('DELETE:ar ur historiktabellen, inte bara ur vyn', () => {
    expect(purgeBranch).toMatch(
      /DELETE FROM public\.%I WHERE %I::text = \$1[\s\S]*?v_src\.history_table, v_src\.identity_column/,
    );
    // Inget filter som bara döljer: ingen soft-delete-stämpel i purge.
    expect(purgeBranch).not.toMatch(/SET %I = now\(\)/);
    expect(purgeBranch).not.toMatch(/purged_at/);
  });

  it('läser tillbaka efteråt och HÖJER om något överlevde — verify, don\'t trust', () => {
    expect(purgeBranch).toMatch(/SELECT count\(\*\) FROM public\.%I WHERE %I::text = \$1/);
    expect(purgeBranch).toMatch(/IF v_left > 0 THEN/);
    expect(purgeBranch).toMatch(/RAISE EXCEPTION 'Purge did not complete/);
  });

  it('rapporterar inte framgång när ingenting raderades', () => {
    expect(purgeBranch).toMatch(/IF v_removed = 0 THEN[\s\S]*?RAISE EXCEPTION 'Nothing to purge/);
  });

  it('säger i UI:t vad som försvinner, och räknar upp det efteråt', () => {
    expect(page).toMatch(/stored revision history/);
    expect(hook).toMatch(/rows_deleted/);
    expect(hook).toMatch(/'revisions'\} removed/);
  });
});

describe('varje spärr negativtestad', () => {
  it('purge är admin-gatad', () => {
    expect(purgeBranch).toMatch(/IF NOT v_is_admin THEN[\s\S]*?RAISE EXCEPTION 'Only admins can permanently delete'/);
  });

  it('purge vägrar när innehållet LEVER — annars raderas en levande sidas historik', () => {
    expect(purgeBranch).toMatch(/IF v_live THEN/);
    expect(purgeBranch).toMatch(/is live — restore it out of the trash first/);
  });

  it('purge kräver uttrycklig bekräftelse i UI:t', () => {
    expect(page).toMatch(/AlertDialog/);
    expect(page).toMatch(/setPurgeTarget\(item\)/);
    expect(page).toMatch(/Delete permanently/);
  });

  it('purge loggar vad som raderades, dit huset redan loggar', () => {
    expect(purgeBranch).toMatch(/INSERT INTO public\.audit_logs/);
    expect(purgeBranch).toMatch(/'trash\.purge'/);
    expect(purgeBranch).toMatch(/'rows_deleted', v_removed/);
  });

  it('listan följer matrisen per källa — inte per sida', () => {
    expect(fnBody).toMatch(/CONTINUE WHEN NOT \(v_is_service OR public\.can_access_module\(v_uid, v_src\.module_key\)\)/);
    // ...och skrivvägarna kollar samma sak innan de gör något.
    expect(fnBody).toMatch(/RAISE EXCEPTION 'Requires the % module/);
  });

  it('har en intern vakt — grants ensamt räcker aldrig', () => {
    expect(fnBody).toMatch(/IF NOT v_is_service AND v_uid IS NULL THEN[\s\S]*?RAISE EXCEPTION 'Not authorized'/);
  });

  it('anon är avstängd från födseln, och migrationen BEVISAR det', () => {
    expect(mig).toMatch(/REVOKE EXECUTE ON FUNCTION public\.trash_bin\(text, text, text, uuid, integer, text\) FROM PUBLIC, anon/);
    expect(mig).toMatch(/REVOKE ALL ON TABLE public\.trash_sources FROM PUBLIC, anon/);
    expect(mig).toMatch(/has_function_privilege\('anon', v_sig, 'EXECUTE'\)/);
    expect(mig).toMatch(/has_table_privilege\('anon', 'public\.trash_sources', 'SELECT'\)/);
    // Registrets strängar blir SQL-identifierare: authenticated får aldrig skriva.
    expect(mig).toMatch(/has_table_privilege\('authenticated', 'public\.trash_sources', 'INSERT'\)/);
  });

  it('okänd källa och okänd action avvisas', () => {
    expect(fnBody).toMatch(/RAISE EXCEPTION 'Unknown trash source %'/);
    expect(fnBody).toMatch(/RAISE EXCEPTION 'Unknown action %\. Use sources\|list\|restore\|purge'/);
  });
});

describe('retention är ägarens beslut, inte migrationens', () => {
  it('ingenting gallrar automatiskt — inget cron, ingen TTL', () => {
    expect(mig).not.toMatch(/cron\.schedule/);
    expect(mig).not.toMatch(/retention_days\s+integer/);
    expect(mig).not.toMatch(/deleted_at\s*<\s*now\(\)\s*-\s*interval/);
    expect(mig).toMatch(/RETENTION IS NOT DECIDED HERE/);
  });
});
