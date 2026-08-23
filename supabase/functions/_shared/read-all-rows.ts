/**
 * Läs HELA tabellen — sidvis, så PostgREST:s radtak aldrig kan tysta bort svansen.
 *
 * ── Det verkliga felet ──────────────────────────────────────────────────────
 * PostgREST kapar ett `.select()` utan `.limit()`/`.range()` vid 1000 rader och
 * säger ingenting om det: svaret ser ut som ett komplett svar. Koden som läser
 * det drar sedan en slutsats av vad som INTE kom med — "saknas", "finns inte",
 * "oanvänd", eller helt enkelt `data.length` som ett facit.
 *
 * Mallinstallationens kontoplansseedning gjorde precis det: den läste alla
 * `account_code` för sin locale, byggde ett Set och infogade differensen.
 * `se-bas2024` har 1262 konton. Läsningen såg 1000. De sista 262 räknades som
 * saknade vid VARJE installation, INSERT:en slog i
 * `chart_of_accounts_locale_code_key`, och loopen bröt med ett duplicate-key-fel
 * i installationsrapporten. Restriktionen räddade datan — den var det enda som
 * gjorde det — men den fyllde loggen, och ingen avläsning kunde avslöja
 * varför, eftersom felet låg i tystnaden.
 *
 * ── Vad man ska göra i stället ──────────────────────────────────────────────
 * Paginering är TREDJE valet, inte det första. I fallande ordning:
 *
 *   1. Skriv utan att läsa. `upsert(..., { onConflict: '<riktig unik
 *      restriktion>', ignoreDuplicates: true })` låter restriktionen avgöra vad
 *      som redan finns. Ingen läsning kan kapas, inget fönster mellan läsning
 *      och skrivning, och idempotens på köpet.
 *   2. Fråga om nycklarna du bryr dig om. `.in('name', kandidater)` binder
 *      läsningen till det du faktiskt undrar över (en handfull), inte till
 *      tabellens storlek. Frånvaro betyder då frånvaro.
 *   3. Den här funktionen — när HELA populationen är själva frågan (en
 *      hälsokontroll som räknar, en fullständig avstämning). Då finns ingen
 *      mindre fråga att ställa, och sidorna måste hämtas.
 *
 * Sorteringskolumnen måste vara stabil och helst unik; annars kan en rad dyka
 * upp på två sidor eller hoppas över mellan dem.
 */

export interface ReadAllRowsOptions {
  /** Kolumner att hämta. Default `'*'`. */
  columns?: string;
  /** Stabil sorteringskolumn — måste vara unik för att sidorna inte ska glida. */
  orderBy: string;
  /** Sidstorlek. Default 500, väl under PostgREST:s tak. */
  pageSize?: number;
  /** Extra filter, applicerade på varje sidfråga. */
  filter?: (query: any) => any;
  /**
   * Säkerhetstak för antal sidor, så en oväntat växande tabell inte snurrar
   * i en edge-funktion med timeout. Default 100 sidor.
   */
  maxPages?: number;
}

export interface ReadAllRowsResult<T = any> {
  rows: T[];
  /** Felmeddelande från den sida som misslyckades, om någon gjorde det. */
  error?: string;
  /**
   * True om `maxPages` nåddes och det kan finnas fler rader. En avläsare som
   * drar slutsatser av frånvaro MÅSTE kontrollera detta — annars har vi bara
   * flyttat taket från 1000 till `pageSize * maxPages`.
   */
  truncated: boolean;
}

/** Alla rader ur `table`, hämtade sidvis. Se filens docstring för när. */
export async function readAllRows<T = any>(
  supabase: any,
  table: string,
  opts: ReadAllRowsOptions,
): Promise<ReadAllRowsResult<T>> {
  const pageSize = opts.pageSize ?? 500;
  const maxPages = opts.maxPages ?? 100;
  const columns = opts.columns ?? '*';
  const rows: T[] = [];

  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    let query = supabase.from(table).select(columns);
    if (opts.filter) query = opts.filter(query);
    query = query.order(opts.orderBy, { ascending: true }).range(from, from + pageSize - 1);

    const { data, error } = await query;
    if (error) return { rows, error: error.message, truncated: true };
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    // En kort sida är slutet. En full sista sida ser likadan ut som "det finns
    // mer", så nästa varv hämtar en tom sida och avslutar — ett extra anrop är
    // billigare än en gissning.
    if (batch.length < pageSize) return { rows, truncated: false };
  }

  return { rows, truncated: true };
}
