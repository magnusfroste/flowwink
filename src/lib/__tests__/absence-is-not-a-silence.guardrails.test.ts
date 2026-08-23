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
// 4. Skillregistret — de ytor som svarar "den förmågan finns inte"
// ───────────────────────────────────────────────────────────────────────────

/**
 * `agent_skills` mätte 540 rader (538 enabled) på optic 2026-08-23 — 54% av
 * PostgREST:s tysta tak, och det växer med varje modul. Ytorna nedan LÄSER hela
 * registret och drar sedan en slutsats av vad som inte kom med:
 *
 *   • MCP-katalogen — frånvaro ur den ÄR svaret "den förmågan finns inte".
 *   • FlowPilots verktygsyta per ReAct-varv — ett oläst skill finns inte.
 *   • agent-operate — allt som inte är exponerat rapporteras som "modulen är av".
 *   • run-platform-tests — hittar föräldralösa skills genom FRÅNVARO ur manifestet.
 *   • instance-health — hashar registret mot en baslinje; en prefix-hash kan
 *     aldrig matcha igen, alltså ett självförvållat drift-larm för alltid.
 *   • flowpilot-heartbeat — hittar på "N automationer pekar på saknade skills"
 *     och skriver en `failed`-rad på det.
 *   • /rest/groups — verktygsantal per grupp; en oläst grupp ser tom ut.
 *   • lint_skill — friskintyg för HELA registret utfärdat på en prefix.
 *
 * Alla åtta läser nu sidvis via readAllRows med `name` som sorteringsnyckel
 * (agent_skills_name_key — pagineringen kräver en STABIL UNIK kolumn; category,
 * som katalogen sorterade på förut, är ingendera).
 */
const SKILL_REGISTER_READERS: Array<{
  file: string;
  /** Textmarkör där ytan börjar. */
  start: string;
  /** Slutmarkör, eller antal tecken framåt. */
  end: string | number;
  why: string;
}> = [
  {
    file: 'supabase/functions/mcp-server/index.ts',
    start: 'async function loadExposedSkills(',
    end: '\n}',
    why: 'the whole MCP tool catalog — absence from it is how search_skills concludes a capability does not exist',
  },
  {
    file: 'supabase/functions/mcp-server/index.ts',
    start: 'app.get("/rest/groups"',
    end: '\n});',
    why: 'per-group tool counts — an unread group reads as an empty one',
  },
  {
    file: 'supabase/functions/_shared/pilot/reason.ts',
    start: 'export async function loadSkillsRaw(',
    end: '\n}',
    why: "FlowPilot's entire tool surface for the run",
  },
  {
    file: 'supabase/functions/agent-operate/index.ts',
    start: "if (!activeModules.has('__all__')) {",
    end: 1800,
    why: 'produces disabledSkillCount and the "that skill\'s module is off" message from !exposedNames.has(...)',
  },
  {
    file: 'supabase/functions/run-platform-tests/index.ts',
    start: '"no duplicate skill names"',
    end: 1400,
    why: 'a duplicate-name check over a prefix passes without having looked',
  },
  {
    file: 'supabase/functions/run-platform-tests/index.ts',
    start: '"all enabled skills have descriptions"',
    end: 1400,
    why: 'reports "all N enabled skills" as a fact about the instance',
  },
  {
    file: 'supabase/functions/run-platform-tests/index.ts',
    start: '"every DB skill is declared in a module manifest"',
    end: 1600,
    why: 'orphans are defined by absence — orphans in the unread tail are invisible and the suite goes green',
  },
  {
    file: 'supabase/functions/instance-health/index.ts',
    start: '// ── 1. Skills ──',
    end: 1400,
    why: 'computeSkillHash over a truncated read makes hashMatch permanently false — a self-inflicted drift alarm',
  },
  {
    file: 'supabase/functions/flowpilot-heartbeat/index.ts',
    start: 'async function runIntegrityGate(',
    end: '\n}',
    why: 'past the cap it invents "N automations reference missing skills" and writes a failed activity row',
  },
  {
    file: 'supabase/functions/agent-execute/index.ts',
    start: 'async function executeLintSkill(',
    end: '\n}',
    why: 'reports a clean bill of health for the whole register from a prefix',
  },
];

function sliceSite(site: (typeof SKILL_REGISTER_READERS)[number]): string {
  const src = readFileSync(join(ROOT, site.file), 'utf8');
  const from = src.indexOf(site.start);
  expect(from, `marker not found in ${site.file}: ${site.start}`).toBeGreaterThan(-1);
  if (typeof site.end === 'number') return src.slice(from, from + site.end);
  const to = src.indexOf(site.end, from);
  expect(to, `end marker not found after ${site.start} in ${site.file}`).toBeGreaterThan(from);
  return src.slice(from, to);
}

describe('the skill register is read whole wherever absence is the answer', () => {
  it.each(SKILL_REGISTER_READERS.map((s) => [`${s.file} — ${s.start.trim()}`, s] as const))(
    '%s paginates its agent_skills read',
    (_label, site) => {
      const body = sliceSite(site);
      expect(
        /readAllRows[<(]/.test(body),
        `${site.file}: this site ${site.why}. Its agent_skills read must go through ` +
          `readAllRows (supabase/functions/_shared/read-all-rows.ts) — an unbounded ` +
          `.select() stops at 1000 rows in silence and agent_skills was at 540 and ` +
          `growing on 2026-08-23.`,
      ).toBe(true);

      // Ingen kvarlämnad obegränsad läsning i samma yta. OBS: här duger inte
      // det generella BOUNDING_CALLS — `.in('scope', [...])` och
      // `.in('category', [...])` binder VÄRDENA men inte antalet rader, och det
      // var precis vad loadSkillsRaw och agent-operate gjorde. Bara ett taggat
      // tak eller en `.in()` på en unik kolumn (name/id) räknas.
      const BOUNDS_ROW_COUNT =
        /\.limit\(|\.range\(|\.single\(|\.maybeSingle\(|head:\s*true|\.in\(\s*['"](?:name|id)['"]/;
      for (const m of body.matchAll(/\.from\(\s*['"]agent_skills['"]\s*\)([\s\S]{0,400})/g)) {
        const tail = m[1];
        if (!/\.select\(/.test(tail)) continue; // en write, inte en läsning
        const stmt = tail.split(';')[0];
        expect(
          BOUNDS_ROW_COUNT.test(stmt),
          `${site.file}: an unbounded .from('agent_skills').select() is left in a site that ` +
            `${site.why}. Paginate it (readAllRows) or bind it to the keys you care about — ` +
            `.eq('enabled', true) and .in('scope', [...]) are not ceilings.`,
        ).toBe(true);
      }
    },
  );

  it('every paginated skill read orders by the unique key', () => {
    // Sidorna glider om sorteringskolumnen inte är unik. `name` bär
    // agent_skills_name_key; `category` (som katalogen sorterade på förut) gör det inte.
    const offenders: string[] = [];
    for (const site of SKILL_REGISTER_READERS) {
      const body = sliceSite(site);
      for (const m of body.matchAll(/readAllRows[\s\S]{0,120}?['"]agent_skills['"]([\s\S]{0,400})/g)) {
        const orderBy = m[1].match(/orderBy:\s*['"]([^'"]+)['"]/)?.[1];
        if (orderBy !== 'name') {
          offenders.push(`${site.file} (${site.start.trim()}) orders by ${orderBy ?? '<nothing>'}`);
        }
      }
    }
    expect(
      offenders,
      'A paginated read needs a stable UNIQUE sort key or rows can appear on two pages ' +
        'or fall between them. agent_skills has agent_skills_name_key on `name`:\n  ' +
        offenders.join('\n  '),
    ).toEqual([]);
  });
});
