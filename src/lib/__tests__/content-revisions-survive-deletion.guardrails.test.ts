import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { blogModule } from '@/lib/modules/blog-module';
import { handbookModule } from '@/lib/modules/handbook-module';

/**
 * Blogg och handbok var genuint oåterkalleliga, och en papperskorg kan inte
 * omfatta det som inte lämnar spår.
 *
 * Sex innehållstabeller, mätt på en levande instans: `pages` raderas mjukt och
 * har page_versions; wiki_pages, kb_articles, docs_pages och documents raderas
 * hårt men har var sin revisionstabell. `blog_posts` och `handbook_chapters`
 * hade ingenting — en DELETE tog innehållet med sig, utan spår och utan väg
 * tillbaka. Det var just de två där en oavsiktlig radering kostar mest: ett
 * publicerat inlägg har utgående länkar, ett handbokskapitel är intern policy.
 *
 * Migrationen 20260823170000 ger båda revisioner efter husets wiki/KB-mönster.
 * Testet pinnar det som är lätt att "städa bort" i god tro:
 *
 *   1. Revisionen ÖVERLEVER raderingen. Nyckeln till förälderraden är en NAKEN
 *      uuid-kolumn, inte en främmande nyckel. Ett FK med ON DELETE CASCADE hade
 *      raderat exakt det bevis papperskorgen bygger på — verifierat lokalt: med
 *      CASCADE gick revisionsantalet 1 → 0 vid DELETE, utan FK överlevde två
 *      revisioner raderingen.
 *   2. Triggern fångar BÅDE update och delete, och skriver OLD (tillståndet
 *      FÖRE ändringen) — en AFTER-trigger eller en som bara lyssnar på UPDATE
 *      hade lämnat raderingen ofångad.
 *   3. Kolumnformen är samma som wiki_page_revisions / kb_article_revisions, så
 *      en gemensam papperskorgsyta kan läsa alla källor likadant.
 *   4. Vakten är matrisen, inte en rollista, och RPC:n är inte anon-körbar.
 */

const MIGRATION =
  'supabase/migrations/20260823170000_e8f9a0b1-bloggen-och-handboken-lamnade-inga-spar.sql';

const mig = readFileSync(resolve(__dirname, '../../../', MIGRATION), 'utf-8');

/** Kroppen för en CREATE TABLE, så påståenden inte råkar matcha en annan tabell. */
function tableBody(name: string): string {
  const start = mig.indexOf(`CREATE TABLE IF NOT EXISTS public.${name} (`);
  expect(start, `${name} saknas i migrationen`).toBeGreaterThan(-1);
  return mig.slice(start, mig.indexOf(');', start));
}

/** Kroppen för en CREATE [OR REPLACE] FUNCTION. */
function fnBody(name: string): string {
  const start = mig.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start, `${name} saknas i migrationen`).toBeGreaterThan(-1);
  const end = mig.indexOf('\n$$;', start);
  expect(end).toBeGreaterThan(start);
  return mig.slice(start, end);
}

const SOURCES = [
  {
    label: 'blog',
    table: 'blog_post_revisions',
    parent: 'blog_posts',
    fk: 'post_id',
    trigger: 'trg_blog_posts_revision',
    logger: 'log_blog_post_revision',
    rpc: 'blog_post_history',
    module: 'blog',
  },
  {
    label: 'handbook',
    table: 'handbook_chapter_revisions',
    parent: 'handbook_chapters',
    fk: 'chapter_id',
    trigger: 'trg_handbook_chapters_revision',
    logger: 'log_handbook_chapter_revision',
    rpc: 'handbook_chapter_history',
    module: 'handbook',
  },
] as const;

describe('revisionen överlever raderingen', () => {
  for (const s of SOURCES) {
    it(`${s.table}: nyckeln till ${s.parent} är INGEN främmande nyckel`, () => {
      const body = tableBody(s.table);
      expect(body).toMatch(new RegExp(`${s.fk} uuid NOT NULL`));
      // Detta är hela poängen. Ett FK hade tvingat fram antingen CASCADE
      // (revisionerna dör med raden) eller RESTRICT (raden går inte att radera).
      expect(body).not.toMatch(/REFERENCES/i);
      expect(body).not.toMatch(/ON DELETE/i);
    });

    it(`${s.table}: ingenting i hela migrationen binder ${s.fk} med CASCADE`, () => {
      expect(mig).not.toMatch(
        new RegExp(`FOREIGN KEY\\s*\\(\\s*${s.fk}\\s*\\)`, 'i'));
      expect(mig).not.toMatch(
        new RegExp(`${s.fk}[^\\n]*REFERENCES\\s+public\\.${s.parent}`, 'i'));
    });

    it(`${s.trigger} fångar BÅDE ändring och radering, före raden försvinner`, () => {
      const trg = mig.slice(mig.indexOf(`CREATE TRIGGER ${s.trigger}`));
      expect(trg).toMatch(
        new RegExp(`CREATE TRIGGER ${s.trigger}\\s+BEFORE UPDATE OR DELETE ON public\\.${s.parent}`));
      expect(trg).toMatch(/FOR EACH ROW/);
      // AFTER DELETE hade också fungerat här, men BEFORE är husets form och
      // den enda som säkert ser OLD i alla grenar.
      expect(trg).not.toMatch(new RegExp(`AFTER (UPDATE|DELETE)[\\s\\S]{0,80}${s.parent}`));
    });

    it(`${s.logger} skriver OLD — tillståndet FÖRE ändringen — och märker raderingen`, () => {
      const fn = fnBody(s.logger);
      expect(fn).toMatch(/SECURITY DEFINER/);
      expect(fn).toMatch(/SET search_path TO 'public'/);
      expect(fn).toMatch(/VALUES \(OLD\./);
      // lower(TG_OP) ger 'update' | 'delete'. En hårdkodad 'update' hade gjort
      // raderingen omöjlig att hitta i papperskorgen.
      expect(fn).toMatch(/lower\(TG_OP\)/);
      expect(fn).toMatch(/RETURN COALESCE\(NEW, OLD\)/);
      // Inga NEW.-fält i INSERT:en: en revision som bär det NYA tillståndet
      // hade varit tom vid DELETE (NEW är NULL där).
      const insert = fn.slice(fn.indexOf('INSERT INTO'));
      expect(insert).not.toMatch(/\bNEW\./);
    });
  }
});

describe('kolumnformen är gemensam, så papperskorgen slipper specialfall', () => {
  // wiki_page_revisions och kb_article_revisions bär dessa; de nya måste också,
  // annars blir blogg/handbok två undantag i varje yta som läser historiken.
  const CORE = ['slug text NOT NULL', 'title text NOT NULL', 'revision_no integer NOT NULL',
    "action text NOT NULL DEFAULT 'update'", 'edited_by uuid',
    'revised_at timestamptz NOT NULL DEFAULT now()'];

  for (const s of SOURCES) {
    it(`${s.table} bär kärnkolumnerna`, () => {
      const body = tableBody(s.table);
      expect(body).toMatch(/id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/);
      for (const col of CORE) expect(body).toContain(col);
    });

    it(`${s.table} är indexerad på (identitet, revision_no DESC)`, () => {
      expect(mig).toMatch(
        new RegExp(`ON public\\.${s.table} \\(${s.fk}, revision_no DESC\\)`));
    });
  }

  it('kärnkolumnerna är ordagrant desamma som i husets två befintliga exempel', () => {
    const wiki = readFileSync(
      resolve(__dirname, '../../../supabase/migrations/20260708070000_wiki-parity-r7.sql'), 'utf-8');
    const kb = readFileSync(
      resolve(__dirname, '../../../supabase/migrations/20260708120000_kb-parity-r8.sql'), 'utf-8');
    for (const col of CORE) {
      expect(wiki, `wiki_page_revisions tappade "${col}"`).toContain(col);
      expect(kb, `kb_article_revisions tappade "${col}"`).toContain(col);
    }
  });
});

describe('historik-RPC:n har samma form och samma vakt som wiki_page_history', () => {
  for (const s of SOURCES) {
    it(`${s.rpc} erbjuder list | get | restore`, () => {
      const fn = fnBody(s.rpc);
      expect(fn).toMatch(/IF p_action = 'list' THEN/);
      expect(fn).toMatch(/ELSIF p_action = 'get' THEN/);
      expect(fn).toMatch(/ELSIF p_action = 'restore' THEN/);
      expect(fn).toMatch(/Unknown action %\. Use list\|get\|restore/);
    });

    it(`${s.rpc} restore ÅTERSKAPAR raden när den är borta`, () => {
      const fn = fnBody(s.rpc);
      const restore = fn.slice(fn.indexOf("ELSIF p_action = 'restore'"));
      // En restore som bara gör UPDATE är en no-op för exakt det fall
      // papperskorgen finns för.
      expect(restore).toMatch(/IF NOT FOUND THEN/);
      expect(restore).toMatch(new RegExp(`INSERT INTO public\\.${s.parent}`));
    });

    it(`${s.rpc} gatar på matrisen, inte på en rollista`, () => {
      const fn = fnBody(s.rpc);
      expect(fn).toMatch(new RegExp(
        `auth\\.role\\(\\) = 'service_role' OR can_access_module\\(auth\\.uid\\(\\), '${s.module}'\\)`));
      // Rollistor är förmatrisens form; de gör operatörens modulratt maktlös.
      expect(fn).not.toMatch(/has_role\(/);
    });

    it(`${s.rpc} föds inte anon-körbar`, () => {
      // ALTER DEFAULT PRIVILEGES gör annars nya funktioner körbara för PUBLIC.
      const sig = `public.${s.rpc}(text, text, uuid, uuid, integer)`;
      const revokeAt = mig.indexOf(`REVOKE EXECUTE ON FUNCTION ${sig}`);
      const grantAt = mig.indexOf(`GRANT EXECUTE ON FUNCTION ${sig}`);
      expect(revokeAt, `REVOKE saknas för ${s.rpc}`).toBeGreaterThan(-1);
      expect(grantAt, `GRANT saknas för ${s.rpc}`).toBeGreaterThan(-1);
      expect(revokeAt).toBeLessThan(grantAt);
      expect(mig.slice(revokeAt, grantAt)).toMatch(/FROM PUBLIC, anon, authenticated/);
      expect(mig.slice(grantAt, grantAt + 200)).toMatch(/TO authenticated, service_role/);
    });

    it(`${s.table} är läsbar bara för modulens roller, och aldrig skrivbar utifrån`, () => {
      expect(mig).toMatch(new RegExp(
        `ALTER TABLE public\\.${s.table} ENABLE ROW LEVEL SECURITY`));
      const pol = mig.slice(mig.indexOf(`ON public.${s.table}\n  FOR SELECT`) > -1
        ? mig.indexOf(`ON public.${s.table}\n  FOR SELECT`)
        : mig.indexOf(`ON public.${s.table}`));
      expect(pol).toMatch(new RegExp(`can_access_module\\(auth\\.uid\\(\\), '${s.module}'::text\\)`));
      // Enda skrivaren är SECURITY DEFINER-triggern; verifierat lokalt med en
      // DELETE körd som `authenticated` utan INSERT på revisionstabellen.
      expect(mig).toMatch(new RegExp(
        `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public\\.${s.table}\\s*\\n?\\s*FROM anon, authenticated`));
      expect(mig).not.toMatch(new RegExp(`ON public\\.${s.table}\\s*\\n?\\s*FOR (INSERT|UPDATE|DELETE|ALL)`));
    });
  }
});

describe('befintligt innehåll får en baslinje, och seeden går att köra om', () => {
  for (const s of SOURCES) {
    it(`${s.table} seedas från ${s.parent} och bara där historik saknas`, () => {
      const seed = mig.slice(mig.indexOf(`INSERT INTO public.${s.table}\n  (`));
      expect(seed).toMatch(new RegExp(`FROM public\\.${s.parent} `));
      expect(seed).toMatch(/'baseline'/);
      // Utan NOT EXISTS dubblerar en andra körning varenda rad.
      expect(seed).toMatch(new RegExp(
        `WHERE NOT EXISTS \\(\\s*\\n\\s*SELECT 1 FROM public\\.${s.table} r WHERE r\\.${s.fk} = `));
    });
  }
});

describe('skillsen finns där en agent hittar dem', () => {
  const seeds = [
    { mod: blogModule, name: 'blog_post_history', rpc: 'rpc:blog_post_history' },
    { mod: handbookModule, name: 'handbook_chapter_history', rpc: 'rpc:handbook_chapter_history' },
  ];

  for (const { mod, name, rpc } of seeds) {
    it(`${mod.id} registrerar ${name} mot RPC:n`, () => {
      const seed = mod.skillSeeds?.find((s) => s.name === name);
      expect(seed, `${name} saknas i ${mod.id}-modulens skillSeeds`).toBeTruthy();
      expect(seed!.handler).toBe(rpc);
      expect(mod.skills).toContain(name);
    });

    it(`${name}: description bär VALET, instructions bär UTFÖRANDET`, () => {
      const seed = mod.skillSeeds!.find((s) => s.name === name)!;
      // Två nivåer: description läses före anropet (val/policy), instructions
      // laddas lazy vid utförandet. Beteenderegler måste stå i description.
      expect(seed.description).toMatch(/Use when:/);
      expect(seed.description).toMatch(/NOT for:/);
      expect(seed.description).toMatch(/survives the .* being deleted/);
      expect(seed.instructions).toMatch(/BEFORE the change/);
      expect(seed.instructions).toMatch(/baseline/);
      expect(seed.instructions).toMatch(/list[\s\S]{0,80}get[\s\S]{0,80}restore/);
    });

    it(`${name}: tool_definition namnger RPC:ns parametrar exakt`, () => {
      const seed = mod.skillSeeds!.find((s) => s.name === name)!;
      const props = (seed.tool_definition as {
        function: { parameters: { properties: Record<string, unknown>; required?: string[] } };
      }).function.parameters;
      // Fel parameternamn ger PGRST202; self-correcting-hinten är bara så bra
      // som tool_definition. Namnen måste matcha funktionssignaturen.
      expect(Object.keys(props.properties).sort()).toEqual(
        [name === 'blog_post_history' ? 'p_post_id' : 'p_chapter_id',
          'p_action', 'p_limit', 'p_revision_id', 'p_slug'].sort());
      expect(props.required).toEqual(['p_action']);
    });
  }

  it('revisionstabellerna ägs av sin modul, så en site-reset inte lämnar kvar texten', () => {
    // Utan FK river ingen kaskad dem åt oss: en wipe måste namnge dem, annars
    // ligger hela brödtexten för varje "raderat" inlägg kvar efter en reset.
    expect(blogModule.data?.tables).toContain('blog_post_revisions');
    expect(handbookModule.data?.tables).toContain('handbook_chapter_revisions');
  });
});

describe('migrationen är omkörbar och når managerade instanser', () => {
  it('all DDL är idempotent', () => {
    const creates = mig.match(/^CREATE (TABLE|INDEX|TRIGGER|POLICY|FUNCTION)/gm) ?? [];
    expect(creates.length).toBeGreaterThan(0);
    for (const m of mig.match(/^CREATE TABLE[^\n]*/gm) ?? [])
      expect(m).toMatch(/IF NOT EXISTS/);
    for (const m of mig.match(/^CREATE INDEX[^\n]*/gm) ?? [])
      expect(m).toMatch(/IF NOT EXISTS/);
    for (const m of mig.match(/^CREATE FUNCTION[^\n]*/gm) ?? [])
      expect(m, 'CREATE FUNCTION utan OR REPLACE').toBe('');
    // Trigger och policy skapas om — därför måste de droppas först.
    for (const t of ['trg_blog_posts_revision', 'trg_handbook_chapters_revision'])
      expect(mig).toMatch(new RegExp(`DROP TRIGGER IF EXISTS ${t} ON public\\.`));
    expect((mig.match(/^DROP POLICY IF EXISTS/gm) ?? []).length)
      .toBe((mig.match(/^CREATE POLICY/gm) ?? []).length);
  });

  it('är framåtdaterad förbi wiki- och KB-migrationerna den kopierar', () => {
    const ts = MIGRATION.match(/^supabase\/migrations\/(\d{14})_/)![1];
    expect(Number(ts)).toBeGreaterThan(20260708120000);
  });

  it('bär reproduktionsreceptet i filen, inte i en rapport som försvinner', () => {
    expect(mig).toMatch(/REPRODUKTIONSRECEPT/);
    expect(mig).toMatch(/psql -v ON_ERROR_STOP=1/);
    expect(mig).toMatch(/ROLLBACK/);
  });
});
