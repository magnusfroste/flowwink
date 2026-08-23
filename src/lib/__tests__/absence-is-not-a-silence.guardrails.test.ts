import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Skyddsräcke: en tystnad får aldrig läsas som ett svar.
 *
 * ── Det verkliga felet (mätt på optic, 2026-08-23) ──────────────────────────
 * Mallinstallationens kontoplansseedning läste alla `account_code` för sin
 * locale, byggde ett Set och infogade differensen:
 *
 *     .from('chart_of_accounts').select('account_code').eq('locale', pack.id)
 *
 * Ingen `.limit()`, ingen paginering. **PostgREST kapar tyst vid 1000 rader.**
 * Paketet `se-bas2024` innehåller **1262 konton**; tabellen på optic håller
 * 1263 rader. Läsningen kunde alltså aldrig se de sista 262 — de räknades som
 * saknade vid VARJE installation, INSERT:en slog i
 * `chart_of_accounts_locale_code_key`, och loopen bröt med ett duplicate-key-fel
 * som lades i installationsrapporten.
 *
 * Restriktionen räddade datan — noll dubbletter — men den var det enda som
 * gjorde det, och den fyllde loggen. Felet gick omätt eftersom det bodde i
 * tystnaden: svaret på 1000 rader ser exakt ut som ett fullständigt svar.
 *
 * Samma defekt lagades samma dygn i kunskapsindexeraren, i en helt orelaterad
 * funktion. Två gånger på ett dygn är ett mönster, inte två olyckor — därför
 * spärrar det här testet KLASSEN och inte bara stället.
 *
 * ── Vad som låses ───────────────────────────────────────────────────────────
 *  1. Kontoplanens seedningsvägar skriver genom RESTRIKTIONEN, aldrig genom en
 *     läsning (upsert / ON CONFLICT DO NOTHING).
 *  2. `onConflict`-målet motsvarar en verklig unik restriktion i schemat —
 *     läst ur migrationerna, inte gissat.
 *  3. Ingen kod bygger ett Set/Map ur ett OBEGRÄNSAT `.select()` och drar
 *     sedan en slutsats av FRÅNVARO (`!set.has(...)`). Undantag måste skrivas
 *     in nedan med ett skäl — vilket är hela poängen: nästa författare tvingas
 *     säga varför just deras läsning inte kan kapas.
 *
 * Ordningen mellan botemedlen (skriv utan att läsa → fråga om nycklarna du
 * bryr dig om → paginera) står i supabase/functions/_shared/read-all-rows.ts.
 */

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist') continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(p);
  }
  return out;
}

const sourceFiles = ['supabase/functions', 'src', 'scripts']
  .flatMap((r) => walk(join(ROOT, r)))
  .filter((f) => !f.includes('__tests__'));

const rel = (f: string) => relative(ROOT, f);

// ───────────────────────────────────────────────────────────────────────────
// 1 + 2. Kontoplanens seedning
// ───────────────────────────────────────────────────────────────────────────

/**
 * De två vägarna som seedar en HEL kontoplan ur ett locale-paket. Båda hade
 * samma läs-och-filtrera-mönster; båda skriver nu genom restriktionen.
 */
const CHART_SEEDING_PATHS = [
  'supabase/functions/agent-execute/index.ts',
  'src/hooks/useTenantLocalePack.ts',
];

describe('the chart of accounts is seeded through its constraint, not through a read', () => {
  it.each(CHART_SEEDING_PATHS)('%s upserts with ON CONFLICT DO NOTHING', (path) => {
    const src = readFileSync(join(ROOT, path), 'utf8');
    // Skrivningen mot chart_of_accounts i en seedningsväg måste vara en upsert
    // som pekar på den verkliga restriktionen och ignorerar dubbletter.
    const upserts = [
      ...src.matchAll(
        /\.from\(['"]chart_of_accounts['"]\)\s*\.upsert\([\s\S]{0,400}?onConflict:\s*['"]locale,\s*account_code['"][\s\S]{0,200}?ignoreDuplicates:\s*true/g,
      ),
    ];
    expect(
      upserts.length,
      `${path} seeds a whole locale pack into chart_of_accounts. That write must be ` +
        `.upsert(rows, { onConflict: 'locale,account_code', ignoreDuplicates: true }) — ` +
        `an unbounded .select() to work out what is "missing" is capped at 1000 rows in ` +
        `silence, and se-bas2024 has 1262 accounts.`,
    ).toBeGreaterThan(0);
  });

  it.each(CHART_SEEDING_PATHS)('%s does not read chart_of_accounts to decide what is missing', (path) => {
    const src = readFileSync(join(ROOT, path), 'utf8');
    // En läsning av bara account_code har exakt ett syfte: bygga en
    // närvarolista. Den är det borttagna mönstret.
    const presenceReads = [
      ...src.matchAll(/\.from\(['"]chart_of_accounts['"]\)\s*(?:\n\s*)?\.select\(\s*['"]account_code['"]\s*\)/g),
    ];
    expect(
      presenceReads.length,
      `${path} reads chart_of_accounts.account_code to build a presence list. ` +
        `That is the read that could not see past row 1000. Let the unique ` +
        `constraint decide instead (upsert + ignoreDuplicates).`,
    ).toBe(0);
  });

  it('onConflict names a unique constraint that actually exists in the schema', () => {
    // "Verifiera att kolumnuppsättningen matchar en verklig unik restriktion
    // innan du väljer onConflict-målet — läs den ur schemat, gissa inte."
    const migrationsDir = join(ROOT, 'supabase/migrations');
    const sql = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(join(migrationsDir, f), 'utf8'))
      .join('\n');

    const declared = /chart_of_accounts_locale_code_key\s+UNIQUE\s*\(\s*locale\s*,\s*account_code\s*\)/i.test(sql);
    expect(
      declared,
      `The seeding upserts target onConflict: 'locale,account_code'. No migration ` +
        `declares UNIQUE (locale, account_code) on chart_of_accounts any more — ` +
        `either the constraint moved (fix the upserts) or it was dropped (in which ` +
        `case nothing is protecting the chart from duplicates at all).`,
    ).toBe(true);

    // Och den GAMLA, globala restriktionen får inte återuppstå: den gjorde att
    // två locales inte kunde dela ett kontonummer.
    const legacyStillAdded = /ADD\s+CONSTRAINT\s+"?chart_of_accounts_account_code_key"?\s+UNIQUE\s*\(\s*"?account_code"?\s*\)/i.test(sql);
    const legacyDropped = /DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+chart_of_accounts_account_code_key/i.test(sql);
    expect(
      !legacyStillAdded || legacyDropped,
      'The global UNIQUE (account_code) is re-added and never dropped — two locales ' +
        'can then not share an account number, and the locale-scoped upsert target is a lie.',
    ).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. Klasspärren
// ───────────────────────────────────────────────────────────────────────────

/**
 * En läsning räknas som BEGRÄNSAD om frågan i sig sätter ett tak:
 *   `.limit()` / `.range()`  — explicit tak
 *   `.single()` / `.maybeSingle()` — en rad
 *   `head: true` (count)     — servern räknar, inga rader hämtas
 *   `.in(kolumn, lista)`     — svaret kan inte bli större än listan du skickade
 *                              (förutsatt att kolumnen är unik, vilket den är i
 *                              varje förekomst nedan). Det är dessutom det
 *                              rekommenderade botemedlet: fråga om nycklarna du
 *                              bryr dig om i stället för om hela tabellen.
 *
 * `.eq('locale', x)` räknas INTE — det var precis vad kontoplansbuggen gjorde.
 */
const BOUNDING_CALLS = /\.limit\(|\.range\(|\.single\(|\.maybeSingle\(|head:\s*true|\.in\(/;

/**
 * Kända, granskade undantag: `<fil>::<tabell>` → varför läsningen inte kan
 * kapas. Att lägga till en rad här är ett medvetet beslut, inte en formalitet
 * — skriv taket, inte "det är nog lugnt".
 */
const REVIEWED: Record<string, string> = {
  'src/hooks/useTenantLocalePack.ts::accounting_templates':
    'accounting_templates har ingen unik restriktion att upserta mot (bara PK på id), ' +
    'så läs-och-filtrera är det enda mekanismen. Taket sätts av paketet: 98 rader på ' +
    'optic, och en pack-mall per namn. Byt till upsert om en UNIQUE (locale, template_name) ' +
    'någonsin läggs till.',
  'supabase/functions/agent-execute/index.ts::accounting_templates':
    'suggest_accounting_template dedupliserar FÖRSLAG mot befintliga mallar. Samma ' +
    'tak som ovan (98 rader), och utfallet är ett förslag, inte en skrivning.',
  'supabase/functions/agent-execute/index.ts::flowtable_fields':
    'Läsningen är .eq("table_id", table.id) — fälten i EN flowtable-tabell. En tabell ' +
    'med 1000 fält finns inte, och utfallet är en varningstext på ett skapat record, ' +
    'inte ett beslut.',
  'supabase/functions/_shared/pilot/handlers.ts::agent_automations':
    'Automationer per instans räknas i tiotal, och slutsatsen är en rådgivande mening ' +
    '("överväg att automatisera") — ingen skrivning och inget grindbeslut.',
};

interface Hit {
  key: string;
  file: string;
  line: number;
  table: string;
}

/**
 * Hittar `new Set(rows.map(...))` / `new Map(rows.map(...))` där `rows` binds
 * av ett obegränsat PostgREST-select, och där mängden sedan används för ett
 * frånvarobeslut (`!x.has(...)` / `!x.includes(...)`).
 */
function findAbsenceOnUnboundedReads(): Hit[] {
  const SET_FROM_ROWS = /new (?:Set|Map)\(\s*\(?\s*([A-Za-z_$][\w$]*)\s*(?:\?\?|\|\|)?\s*(?:\[\])?\s*\)?\s*\.map\(/g;
  const hits: Hit[] = [];

  for (const file of sourceFiles) {
    const src = readFileSync(file, 'utf8');
    if (!src.includes('.select(')) continue;
    const lines = src.split('\n');

    for (const m of src.matchAll(SET_FROM_ROWS)) {
      const rowsVar = m[1];
      const lineNo = src.slice(0, m.index).split('\n').length;

      // Var bands rowsVar? Leta uppåt efter `data: rowsVar` eller `const rowsVar =`.
      const binding = new RegExp(`(data\\s*:\\s*${rowsVar}\\b)|((?:const|let)\\s+${rowsVar}\\s*=)`);
      let bindLine = -1;
      for (let i = lineNo - 1; i >= Math.max(1, lineNo - 30); i--) {
        if (binding.test(lines[i - 1] ?? '')) { bindLine = i; break; }
      }
      if (bindLine < 0) continue;

      // Satsen som binder den — fram till första semikolon.
      const stmt = lines.slice(bindLine - 1, bindLine + 12).join('\n').split(';')[0];
      if (!/\.from\(/.test(stmt) || !/\.select\(/.test(stmt)) continue;
      if (BOUNDING_CALLS.test(stmt)) continue;

      // Används mängden för ett frånvarobeslut?
      const setVar = (lines[lineNo - 1] ?? '').match(/(?:const|let)\s+([A-Za-z_$][\w$]*)/)?.[1];
      if (!setVar) continue;
      const after = lines.slice(lineNo - 1, lineNo + 20).join('\n');
      if (!new RegExp(`!\\s*${setVar}\\.(has|includes)\\(`).test(after)) continue;

      const table = stmt.match(/\.from\(['"`]([^'"`]+)/)?.[1] ?? 'unknown';
      hits.push({ key: `${rel(file)}::${table}`, file: rel(file), line: lineNo, table });
    }
  }
  return hits;
}

describe('no conclusion is drawn from an unbounded read', () => {
  const hits = findAbsenceOnUnboundedReads();

  it('the scanner still finds the shape it is looking for', () => {
    // Negativtest av spärren själv: om regexen slutar matcha (t.ex. efter en
    // refaktorering av hur rader läses) blir testet grönt av fel skäl. Det får
    // det inte bli utan att någon märker det.
    expect(
      sourceFiles.length,
      'the source sweep found no files at all — the walker or cwd is wrong',
    ).toBeGreaterThan(500);
    expect(
      Object.keys(REVIEWED).length,
      'every reviewed exception disappeared — either they were all fixed (then ' +
        'delete the entries) or the scanner stopped matching (then it guards nothing)',
    ).toBeGreaterThan(0);
  });

  it('every reviewed exception still exists (no stale entries)', () => {
    const found = new Set(hits.map((h) => h.key));
    const stale = Object.keys(REVIEWED).filter((k) => !found.has(k));
    expect(
      stale,
      'These are listed as reviewed exceptions but the scanner no longer finds them. ' +
        'They were probably fixed — delete the entries so the list keeps meaning something:\n  ' +
        stale.join('\n  '),
    ).toEqual([]);
  });

  it('no unreviewed site decides "missing" from a read that PostgREST can truncate', () => {
    const offenders = hits
      .filter((h) => !(h.key in REVIEWED))
      .map((h) => `${h.file}:${h.line} — builds a set from an unbounded read of "${h.table}" and then filters on absence`);

    expect(
      offenders,
      'An unfiltered PostgREST .select() stops at 1000 rows and says nothing about it, ' +
        'so everything past the cap looks MISSING. That is how the chart-of-accounts seed ' +
        'came to re-insert 262 accounts on every install (1262 in the pack, 1000 returned).\n\n' +
        'Fix in this order — see supabase/functions/_shared/read-all-rows.ts:\n' +
        '  1. Do not read: upsert with onConflict on the real unique constraint + ignoreDuplicates.\n' +
        '  2. Ask about the keys you care about: .in(column, candidates).\n' +
        '  3. Paginate (readAllRows) — only when the whole population IS the question.\n' +
        'If the read genuinely cannot be truncated, add it to REVIEWED above WITH the ceiling.\n\n' +
        offenders.join('\n  '),
    ).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. Actions that leave the building
// ───────────────────────────────────────────────────────────────────────────

/**
 * The same silence, one consequence worse.
 *
 * A wrong number on a dashboard is visible and correctable. A newsletter that
 * reached part of the list and reported full delivery is not: the mail is out,
 * and the row says the job is done. `newsletter/send.ts` read its recipients
 * with an unbounded `.select()` — capped at 1000 without a word — mailed
 * whoever fitted, and stamped the newsletter `sent`.
 *
 * The rules below are about outbound acts specifically, so they are stricter
 * than the class guard above: it is not enough that the read be complete, the
 * STATE LEFT BEHIND must be honest when the run stops halfway, and a repeat
 * must not mail anyone twice.
 */

const SEND = 'supabase/functions/newsletter/send.ts';
const EXPORT = 'supabase/functions/newsletter/export.ts';
const ORDERS = 'src/pages/admin/OrdersPage.tsx';
const INSTALLER = 'src/hooks/useTemplateInstaller.ts';

const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

/**
 * Comments out. Every assertion below that a defective SHAPE is absent has to
 * look at code only — otherwise the comment explaining which read was removed
 * re-triggers the rule that removed it, and the honest fix would be to stop
 * writing down what went wrong.
 */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * Finds `for (const x of rows)` loops that send mail, where `rows` was bound by
 * a PostgREST select with no ceiling on it. Written over a source STRING rather
 * than over the tree so the scanner itself can be tested against a known-bad
 * fixture — a scanner nobody has ever seen fail is not a guard.
 */
function findMailingsFromUnboundedReads(src: string): string[] {
  const OUTBOUND = /functions\.invoke\(\s*['"`](email-send|newsletter\/send|send-[\w-]+)['"`]|functions\/v1\/email-send/;
  const lines = src.split('\n');
  const offenders: string[] = [];

  for (const m of src.matchAll(/for\s*\(\s*const\s+[\w$]+\s+of\s+\(?\s*([A-Za-z_$][\w$]*)\b/g)) {
    const rowsVar = m[1];
    const lineNo = src.slice(0, m.index).split('\n').length;

    // Does this loop actually send something outward?
    const body = lines.slice(lineNo - 1, lineNo + 80).join('\n');
    if (!OUTBOUND.test(body)) continue;

    // Where was the loop's source bound?
    const binding = new RegExp(`(data\\s*:\\s*${rowsVar}\\b)|(rows\\s*:\\s*${rowsVar}\\b)|((?:const|let)\\s+${rowsVar}\\s*=)`);
    let bindLine = -1;
    for (let i = lineNo - 1; i >= Math.max(1, lineNo - 120); i--) {
      if (binding.test(lines[i - 1] ?? '')) { bindLine = i; break; }
    }
    if (bindLine < 0) continue;

    const stmt = lines.slice(bindLine - 1, bindLine + 14).join('\n').split(';')[0];
    // readAllRows is the paginated form — it is a complete read by construction.
    if (/readAllRows\s*\(/.test(stmt)) continue;
    if (!/\.from\(/.test(stmt) || !/\.select\(/.test(stmt)) continue;
    if (BOUNDING_CALLS.test(stmt)) continue;

    const table = stmt.match(/\.from\(['"`]([^'"`]+)/)?.[1] ?? 'unknown';
    offenders.push(`${lineNo}: mails everyone in an unbounded read of "${table}"`);
  }
  return offenders;
}

describe('no mailing is driven by a read that PostgREST can truncate', () => {
  it('the scanner still recognises the shape it exists to catch', () => {
    // The exact code that shipped, minus the fix. If this stops being flagged
    // the sweep below is decoration.
    const theOldBug = `
      const { data: subscribers } = await supabase
        .from("newsletter_subscribers").select("email, name").eq("status", "confirmed");
      for (const subscriber of subscribers) {
        await supabase.functions.invoke("email-send", { body: { to: subscriber.email } });
      }
    `;
    expect(
      findMailingsFromUnboundedReads(theOldBug),
      'the scanner no longer detects the original defect — it guards nothing',
    ).toHaveLength(1);

    // And the bounded form must NOT be flagged, or the guard is noise everyone
    // learns to silence.
    const bounded = theOldBug.replace('.eq("status", "confirmed")', '.eq("status", "confirmed").limit(50)');
    expect(findMailingsFromUnboundedReads(bounded)).toEqual([]);
  });

  it('no source file mails a list it read without a ceiling', () => {
    const offenders = sourceFiles.flatMap((file) =>
      findMailingsFromUnboundedReads(readFileSync(file, 'utf8')).map((o) => `${rel(file)}:${o}`),
    );
    expect(
      offenders,
      'A loop that sends mail must be fed by a read that cannot be silently cut short: ' +
        '.limit()/.range() when a batch is intended, or readAllRows when the whole list is ' +
        'the point. Everyone past row 1000 gets nothing, and the run still reports success.\n\n  ' +
        offenders.join('\n  '),
    ).toEqual([]);
  });
});

describe('the newsletter cannot stamp "sent" over a truncated recipient list', () => {
  it('reads its recipients page by page, not in one unbounded select', () => {
    const src = codeOnly(read(SEND));
    expect(
      /readAllRows[\s\S]{0,200}?["']newsletter_subscribers["']/.test(src),
      `${SEND} must page through newsletter_subscribers (readAllRows). The whole list ` +
        `is the question here, so this is the one place the third cure is right.`,
    ).toBe(true);
    expect(
      /\.from\(\s*["']newsletter_subscribers["']\s*\)\s*\.select\(/.test(src),
      `${SEND} still reads newsletter_subscribers through a direct .select(). That is the ` +
        `read that stopped at 1000 and mailed a fraction of the list.`,
    ).toBe(false);
  });

  it('the final status is decided, never the literal "sent"', () => {
    const src = read(SEND);
    const finalUpdate = /\.from\("newsletters"\)\.update\(\{[\s\S]{0,400}?sent_at[\s\S]{0,400}?\}\)/.exec(src)?.[0] ?? '';
    expect(finalUpdate, `could not find the closing newsletters.update() in ${SEND}`).not.toBe('');
    expect(
      /status:\s*["']sent["']/.test(finalUpdate),
      `${SEND} writes status: "sent" unconditionally at the end of the run. That stamp is a ` +
        `claim that the whole list was reached; it may only be written when nothing is ` +
        `outstanding. Compute it (sent | partial) and write the variable.`,
    ).toBe(false);
    // …and the decision has to actually consider truncation and failures.
    expect(
      /const\s+outstanding\s*=[\s\S]{0,200}?recipientsTruncated/.test(src),
      `${SEND} no longer folds the truncation flag into the final status. A recipient list ` +
        `that could not be read to the end means recipients are outstanding, whatever the ` +
        `provider said about the ones we did see.`,
    ).toBe(true);
  });

  it('claims each recipient through the unique index before handing the mail over', () => {
    const src = read(SEND);
    const claim = /\.from\("newsletter_deliveries"\)[\s\S]{0,400}?onConflict:\s*"newsletter_id,recipient_email"[\s\S]{0,120}?ignoreDuplicates:\s*true/.exec(src);
    expect(
      claim,
      `${SEND} must claim (newsletter_id, recipient_email) through the unique index before ` +
        `sending — an upsert with ignoreDuplicates, whose empty result means "already ` +
        `claimed, skip". Without it a resumed or repeated send mails people twice, and an ` +
        `email cannot be taken back.`,
    ).not.toBeNull();

    // Order matters: a claim taken AFTER the provider call proves nothing.
    const claimAt = claim!.index!;
    const sendAt = src.indexOf('functions.invoke("email-send"');
    expect(sendAt, `${SEND} no longer sends through email-send — this test is looking at the wrong thing`).toBeGreaterThan(-1);
    expect(
      claimAt,
      `${SEND} claims the recipient AFTER calling the provider. A crash between the two ` +
        `then loses the record of a mail that was already delivered, and the retry sends it again.`,
    ).toBeLessThan(sendAt);
  });

  it('only previously FAILED deliveries are reopened — never the ambiguous ones', () => {
    const src = read(SEND);
    expect(
      /\.from\("newsletter_deliveries"\)\s*\.delete\(\)\s*\.eq\("newsletter_id",\s*newsletter_id\)\s*\.eq\("status",\s*"failed"\)/.test(src),
      `The retry path must reopen exactly the deliveries the provider rejected, server-side. ` +
        `Reopening 'pending' rows too would re-send to people whose outcome we never learned — ` +
        `the ambiguous case has to resolve toward silence, not toward a second copy.`,
    ).toBe(true);
  });

  it('the unique index and the "partial" status exist in the schema, not just in the code', () => {
    const migrationsDir = join(ROOT, 'supabase/migrations');
    const sql = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(join(migrationsDir, f), 'utf8'))
      .join('\n');

    expect(
      /CREATE\s+UNIQUE\s+INDEX[^;]*ON\s+public\.newsletter_deliveries\s*\(\s*newsletter_id\s*,\s*recipient_email\s*\)/i.test(sql),
      'The sender leans on a unique index over (newsletter_id, recipient_email) to decide who ' +
        'has already been mailed. No migration declares it — so the upsert silently inserts a ' +
        'duplicate row instead of reporting a conflict, and every retry re-sends the whole list.',
    ).toBe(true);

    const statusCheck = /newsletters_status_check[\s\S]{0,400}?CHECK[\s\S]{0,400}?\)/i.exec(
      sql.slice(sql.lastIndexOf('newsletters_status_check') - 200),
    )?.[0] ?? '';
    expect(
      /'partial'/.test(statusCheck),
      "newsletters.status has no 'partial' value, so a run that stopped short has nothing " +
        "honest to write and falls back to 'sent' or 'failed' — both of which are lies about " +
        'what landed in people\'s inboxes.',
    ).toBe(true);
  });
});

describe('an export that claims completeness is complete or is refused', () => {
  it('pages through the subscribers instead of taking the first thousand', () => {
    const src = codeOnly(read(EXPORT));
    expect(
      /readAllRows[\s\S]{0,200}?["']newsletter_subscribers["']/.test(src),
      `${EXPORT} must read every subscriber. Its output is downloaded and treated as the ` +
        `record of the list; a 1000-row file is indistinguishable from a complete one.`,
    ).toBe(true);
    expect(
      /\.from\(\s*["']newsletter_subscribers["']\s*\)\s*\.select\(/.test(src),
      `${EXPORT} still has a direct .select() on newsletter_subscribers.`,
    ).toBe(false);
  });

  it('refuses rather than emitting a file that quietly ends early', () => {
    const src = read(EXPORT);
    expect(
      /if\s*\(\s*truncated\s*\)[\s\S]{0,600}?status:\s*5\d\d/.test(src),
      `${EXPORT} must return an error when the read hit its ceiling. Emitting the rows it did ` +
        `get would hand over a file nobody downstream can tell apart from a full one.`,
    ).toBe(true);
  });

  it('the response carries how many rows it contains', () => {
    const src = read(EXPORT);
    expect(
      /"X-Subscriber-Count":\s*String\(subscribers\.length\)/.test(src)
        && /total_count:\s*subscribers\.length/.test(src),
      `${EXPORT} must state its own row count — in the JSON body and, since a CSV cannot carry ` +
        `a footer, in a response header — so a caller can check what it parsed against what we sent.`,
    ).toBe(true);
  });
});

describe('the "create invoice" offer is bound by the orders on screen', () => {
  it('does not scan the whole invoice table to decide what is uninvoiced', () => {
    const src = codeOnly(read(ORDERS));
    expect(
      /\.ilike\('notes',\s*'%order:%'\)/.test(src),
      `${ORDERS} scans invoices for any "order:" marker with no ceiling. Past invoice 1000 the ` +
        `tail is invisible, those orders look uninvoiced, and the page offers to bill a real ` +
        `customer a second time.`,
    ).toBe(false);
    expect(
      /order_id\.in\.\(\$\{chunk\.join\(','\)\}\)/.test(src),
      `${ORDERS} must ask about the orders it is showing (.or with order_id.in.(…) over a chunk ` +
        `of the page's own order ids) rather than about the invoice table. Bound by the question, ` +
        `so absence means absence.`,
    ).toBe(true);
  });

  it('says so when the order list itself is only a window', () => {
    const src = read(ORDERS);
    expect(
      /\.limit\(ORDER_LIST_LIMIT\)/.test(src)
        && /ordersAtLimit\s*=\s*\(orders\?\.length[\s\S]{0,60}?ORDER_LIST_LIMIT/.test(src),
      `${ORDERS} loads orders with an explicit ceiling and tells the user when the list is at ` +
        `it — the stat tiles and the invoice map both only cover what was loaded.`,
    ).toBe(true);
  });
});

describe('a clean install that could not empty the site does not report success', () => {
  it('deletes what the database still holds, not what a cached list happened to show', () => {
    const src = codeOnly(read(INSTALLER));
    expect(
      /async function drainDelete\(/.test(src),
      `${INSTALLER} must drain each table — fetch a bounded page of ids, delete it, ask again ` +
        `until nothing is left. Iterating the page's cached lists deletes at most the 1000 rows ` +
        `PostgREST was willing to show.`,
    ).toBe(true);

    for (const cached of ['existingPages', 'existingBlogPosts', 'existingKbCategories', 'existingProducts']) {
      expect(
        new RegExp(`for\\s*\\(\\s*let\\s+i\\s*=\\s*0;\\s*i\\s*<\\s*${cached}\\.length`).test(src),
        `${INSTALLER} still deletes by walking ${cached} — the unbounded read. Row 1001 survives ` +
          `the "clean" install and the template is written on top of it.`,
      ).toBe(false);
    }
  });

  it('leftovers reach the person who asked for a clean site', () => {
    const src = read(INSTALLER);
    // Scoped to the branch itself. Matching "somewhere near" would be satisfied
    // by the catch block's own destructive toast a few lines further down —
    // which fires for a failed install, not for a survived one.
    const branch = /cleanInstallLeftovers\.length\s*>\s*0\s*\)\s*\{([\s\S]*?)\n {6}\} else \{/.exec(src)?.[1] ?? '';
    expect(branch, `${INSTALLER} has no "leftovers" branch around the closing toast`).not.toBe('');
    expect(
      /variant:\s*'destructive'/.test(branch),
      `${INSTALLER} must not headline "Template applied!" over a wipe that left content behind. ` +
        `Afterwards nobody can tell leftovers from content someone kept on purpose.`,
    ).toBe(true);
  });

  it('the counts shown before an irreversible delete are counted by the server', () => {
    const src = read(INSTALLER);
    expect(
      /count:\s*'exact',\s*head:\s*true/.test(src),
      `${INSTALLER} quotes "N pages will be permanently deleted" straight before an ` +
        `irreversible action. That number must come from a server-side count, not from the ` +
        `length of a list that stops at 1000.`,
    ).toBe(true);
  });
});
