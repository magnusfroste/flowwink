import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chunkRowHash } from '../../../supabase/functions/_shared/retrieval/chunker.ts';

/**
 * Hashen måste täcka HELA raden — annars mäter överhoppningen fel sak.
 *
 * Indexeraren hoppar över oförändrade chunks genom att jämföra `content_hash`.
 * Det är rätt idé: det bevarar embeddings och sparar skrivningar. Men en
 * överhoppning är bara ärlig om hashen täcker allt raden LAGRAR. Gör den inte
 * det kan ett otäckt fält drifta hur länge som helst bakom en hash som fortsätter
 * säga "oförändrad" — och det finns ingenting att upptäcka: ingen kö växer,
 * inget fel loggas, inget svep misslyckas.
 *
 * Så blev det. Fram till 2026-08-23 hashades `content + ' ' + JSON(metadata)`,
 * medan raden också lagrar `title` och `visibility`:
 *
 *  • TITELN. En wikisida på optic bytte namn 2026-08-21 — "Produkt - Skyddad
 *    internetanslutning" → "Produkt - Internettjänster". Alla tio chunks bar
 *    kvar det gamla namnet. Omdöpningen rörde inte en byte brödtext, alltså
 *    stämde hashen, alltså hoppades varenda chunk över. Kön var TOM, inget fel
 *    loggades, och grannsidan indexerades korrekt nittio sekunder senare:
 *    mekanismen fungerade, den mätte bara fel sak. Under tiden citerade agenter
 *    en källa med ett namn som inte längre finns, och kunden fick en hänvisning
 *    till en tjänst som är omdöpt.
 *  • VISIBILITY. Samma defekt, men med tänder. Att flippa en KB-artikel från
 *    public till internal ändrar varken brödtext eller metadata, så chunksen
 *    behöll `visibility='public'` — och `knowledge_chunks` har en RLS-policy
 *    som ger anon läsning av public-rader. En artikel som dragits tillbaka från
 *    den kundvända nivån låg kvar där.
 *
 * Spärren har därför två ben:
 *  1. BETEENDE — en ändring av vilket som helst av de fyra beskrivande fälten
 *     måste ge en ny hash.
 *  2. TÄCKNING — varje beskrivande kolumn indexeraren SKRIVER måste vara ett
 *     argument till `chunkRowHash`. Det är det benet som fångar nästa kolumn
 *     någon lägger till utan att ta med den i hashen, vilket är exakt så här
 *     uppstod.
 *
 * Plus regeln som håller det till EN sanning: hashen räknas ut på ett ställe.
 * Ett andra hash-uttryck bredvid det är precis den drift spärren finns för.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf-8');
const INDEXER = 'supabase/functions/_shared/retrieval/indexer.ts';
const CHUNKER = 'supabase/functions/_shared/retrieval/chunker.ts';

/** Optics faktiska rad, som den såg ut innan namnbytet. */
const optic = {
  title: 'Produkt - Skyddad internetanslutning › Skyddad internetanslutning › Servicenivå',
  content: 'Vi svarar inom fyra timmar helgfri vardag och åtgärdar kritiska fel dygnet runt.',
  visibility: 'internal',
  metadata: { slug: 'produkt-internet', url: '/admin/wiki/produkt-internet' },
};

/** Nycklarna på översta nivån i ett objektliteral (som börjar med `{`). */
function topLevelKeys(literal: string): string[] {
  const keys: string[] = [];
  let depth = 0;
  for (const line of literal.split('\n')) {
    if (depth === 1) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/);
      if (m) keys.push(m[1]);
    }
    for (const ch of line) {
      if (ch === '{' || ch === '[' || ch === '(') depth++;
      if (ch === '}' || ch === ']' || ch === ')') depth--;
    }
  }
  return keys;
}

/** Klipp ut det balanserade `{…}`-literalet som följer på `startMarker`. */
function block(src: string, startMarker: string): string {
  const at = src.indexOf(startMarker);
  expect(at, `hittade inte "${startMarker}"`).toBeGreaterThan(-1);
  const start = src.indexOf('{', at + startMarker.length - 1);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`obalanserat block vid "${startMarker}"`);
}

describe('chunk-hashen täcker hela den lagrade raden', () => {
  describe('beteende: varje beskrivande fält flyttar hashen', () => {
    it('en identisk rad ger identisk hash', async () => {
      expect(await chunkRowHash(optic)).toBe(await chunkRowHash({ ...optic }));
    });

    it('ENBART titeln ändrad ger en ny hash (optic 2026-08-21)', async () => {
      const renamed = {
        ...optic,
        title: 'Produkt - Internettjänster › Skyddad internetanslutning › Servicenivå',
      };
      expect(await chunkRowHash(renamed)).not.toBe(await chunkRowHash(optic));
    });

    it('ENBART visibility ändrad ger en ny hash (public → internal läcker annars)', async () => {
      const withdrawn = { ...optic, visibility: 'public' };
      expect(await chunkRowHash(withdrawn)).not.toBe(await chunkRowHash(optic));
    });

    it('ENBART brödtexten ändrad ger en ny hash', async () => {
      const edited = { ...optic, content: optic.content + ' Kritiska fel: inom en timme.' };
      expect(await chunkRowHash(edited)).not.toBe(await chunkRowHash(optic));
    });

    it('ENBART metadata ändrad ger en ny hash', async () => {
      const moved = { ...optic, metadata: { ...optic.metadata, slug: 'produkt-internettjanster' } };
      expect(await chunkRowHash(moved)).not.toBe(await chunkRowHash(optic));
    });

    it('metadatans NYCKELORDNING är inte en ändring (annars omhashas flottan av en kodflytt)', async () => {
      const reordered = {
        ...optic,
        metadata: { url: optic.metadata.url, slug: optic.metadata.slug },
      };
      expect(await chunkRowHash(reordered)).toBe(await chunkRowHash(optic));
    });

    it('fälten kan inte byta plats med varandra genom en avgränsare i texten', async () => {
      // Ren konkatenering gjorde title="a", content="b" omöjlig att skilja från
      // title="a b", content="" — hashen måste vara entydigt avgränsad.
      const a = { ...optic, title: 'a', content: 'b' };
      const b = { ...optic, title: 'a b', content: '' };
      expect(await chunkRowHash(a)).not.toBe(await chunkRowHash(b));
    });
  });

  describe('täckning: hashens argument = radens beskrivande kolumner', () => {
    const indexer = read(INDEXER);
    const rowLiteral = block(indexer, 'extracted.chunks.map(async (c, i) => (');

    /**
     * Kolumner som INTE är beskrivande: identiteten (väljer raden, kan inte
     * drifta inuti den), hashen själv, och det som är härlett.
     */
    const NOT_DESCRIPTIVE = new Set([
      'source_table',
      'entity_id',
      'chunk_index',
      'content_hash',
      'updated_at',
      'embedding',
      'embedding_model',
    ]);

    it('varje beskrivande kolumn indexeraren skriver är ett argument till chunkRowHash', () => {
      const written = topLevelKeys(rowLiteral).filter((k) => !NOT_DESCRIPTIVE.has(k));
      const hashed = topLevelKeys(block(rowLiteral, 'chunkRowHash({'));
      expect(written.length).toBeGreaterThan(0);
      // Lägger någon till en lagrad, beskrivande kolumn utan att ta med den
      // här, faller det här — det är hela poängen med spärren.
      expect([...written].sort()).toEqual([...hashed].sort());
    });

    it('title och visibility är med — de två som drev incidenten', () => {
      const hashed = topLevelKeys(block(rowLiteral, 'chunkRowHash({'));
      expect(hashed).toContain('title');
      expect(hashed).toContain('visibility');
      expect(hashed).toContain('content');
      expect(hashed).toContain('metadata');
    });
  });

  describe('EN sanning: hashen räknas ut på ett enda ställe', () => {
    it('indexeraren delegerar och räknar aldrig ut content_hash själv', () => {
      const indexer = read(INDEXER);
      // Exakt ett content_hash-tilldelande uttryck, och det anropar chunkRowHash.
      // Skrivsidans literal är den enda som SÄTTER content_hash; övriga
      // förekomster i filen läser den (jämförelsen mot lagrade rader).
      const rowLiteral = block(indexer, 'extracted.chunks.map(async (c, i) => (');
      expect(rowLiteral).toMatch(/content_hash:\s*await chunkRowHash\(/);
      expect(indexer.match(/chunkRowHash\(/g) ?? []).toHaveLength(1);
      // Ingen egen digest-uträkning bredvid den.
      expect(indexer).not.toMatch(/contentHash\s*\(/);
      expect(indexer).not.toMatch(/crypto\.subtle/);
    });

    it('chunkRowHash är den enda exporterade rad-hashen i chunkern', () => {
      const chunker = read(CHUNKER);
      const exported = [...chunker.matchAll(/export (?:async )?function (\w+)/g)].map((m) => m[1]);
      expect(exported).toContain('chunkRowHash');
      // `contentHash` får finnas kvar som primitiv, men inget TREDJE hashnamn.
      expect(exported.filter((n) => /hash/i.test(n)).sort()).toEqual(['chunkRowHash', 'contentHash']);
    });
  });

  describe('en omdöpning kastar inte bort vektorn den inte påverkar', () => {
    const indexer = read(INDEXER);

    it('bara den gren där TEXTEN ändrats nollar embedding', () => {
      // Vektorn räknas ur `content` (embedder.ts embeddar chunk.content). Att
      // nolla den vid varje hash-miss skulle låta en ren omdöpning — själva
      // fallet hashen breddades för — omvektorisera hela indexet till
      // leverantörspris för en etikett ingen vektor kan se. Det gör också den
      // engångsomindexering som läker gamla rader gratis.
      const textBranch = indexer.slice(indexer.indexOf('if (textChanged.length > 0)'));
      const labelBranch = indexer.slice(indexer.indexOf('if (labelOnly.length > 0)'));
      expect(textBranch.slice(0, labelBranch.length || undefined)).toContain('embedding: null');
      expect(indexer).toMatch(/const labelOnly = changed\.filter/);
      // Etikett-grenens upsert får inte bära embedding-kolumnerna alls: en
      // kolumn som saknas i payloaden lämnas orörd av ON CONFLICT DO UPDATE.
      const labelUpsert = labelBranch.slice(0, labelBranch.indexOf('}'));
      expect(labelUpsert).not.toContain('embedding');
    });
  });
});
