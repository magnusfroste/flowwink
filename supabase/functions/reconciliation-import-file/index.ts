// Import bank statement: CSV (generic), CAMT.053 (XML), SIE (Swedish).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParsedTx {
  external_id?: string;
  transaction_date: string; // YYYY-MM-DD
  value_date?: string;
  amount_cents: number;
  currency: string;
  counterparty?: string;
  reference?: string;
  description?: string;
  raw: Record<string, unknown>;
}

function parseCSV(content: string): ParsedTx[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0].split(/[,;\t]/).map((h) => h.trim().toLowerCase());
  const idx = (names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const dateIdx = idx(["date", "datum"]);
  const amountIdx = idx(["amount", "belopp"]);
  const refIdx = idx(["reference", "referens", "ocr", "meddelande", "memo"]);
  const descIdx = idx(["description", "text", "beskrivning"]);
  const counterpartyIdx = idx(["counterparty", "motpart", "payee", "betalningsmottagare"]);
  const currencyIdx = idx(["currency", "valuta"]);

  if (dateIdx < 0 || amountIdx < 0) {
    throw new Error("CSV must contain at least date + amount columns");
  }

  const out: ParsedTx[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    const rawDate = cols[dateIdx];
    const rawAmt = cols[amountIdx]?.replace(/\s/g, "").replace(",", ".");
    if (!rawDate || !rawAmt) continue;
    const amount = parseFloat(rawAmt);
    if (isNaN(amount)) continue;
    const date = rawDate.length === 10 ? rawDate : new Date(rawDate).toISOString().slice(0, 10);
    out.push({
      transaction_date: date,
      amount_cents: Math.round(amount * 100),
      currency: currencyIdx >= 0 ? cols[currencyIdx]?.toUpperCase() || "SEK" : "SEK",
      counterparty: counterpartyIdx >= 0 ? cols[counterpartyIdx] : undefined,
      reference: refIdx >= 0 ? cols[refIdx] : undefined,
      description: descIdx >= 0 ? cols[descIdx] : undefined,
      raw: Object.fromEntries(header.map((h, j) => [h, cols[j]])),
    });
  }
  return out;
}

function parseCAMT053(xml: string): ParsedTx[] {
  // Minimal CAMT.053 parser — extracts <Ntry> entries.
  const out: ParsedTx[] = [];
  const entryRe = /<Ntry>([\s\S]*?)<\/Ntry>/g;
  const get = (block: string, tag: string) => {
    const m = block.match(new RegExp(`<${tag}[^>]*>([^<]+)<\\/${tag}>`));
    return m ? m[1] : undefined;
  };
  let m;
  while ((m = entryRe.exec(xml)) !== null) {
    const block = m[1];
    const amt = get(block, "Amt");
    const ccy = block.match(/<Amt[^>]*Ccy="([A-Z]{3})"/)?.[1] || "SEK";
    const cdtDbt = get(block, "CdtDbtInd");
    const dt = get(block, "BookgDt") || get(block, "Dt");
    const date = dt ? dt.match(/\d{4}-\d{2}-\d{2}/)?.[0] : undefined;
    const ref = get(block, "EndToEndId") || get(block, "AcctSvcrRef");
    const desc = get(block, "AddtlNtryInf") || get(block, "Ustrd");
    const cp = get(block, "Nm");
    if (!date || !amt) continue;
    const sign = cdtDbt === "DBIT" ? -1 : 1;
    out.push({
      external_id: ref,
      transaction_date: date,
      amount_cents: Math.round(parseFloat(amt) * 100) * sign,
      currency: ccy,
      counterparty: cp,
      reference: ref,
      description: desc,
      raw: { entry: block.substring(0, 500) },
    });
  }
  return out;
}

function parseSIE(content: string): ParsedTx[] {
  // SIE 4 #TRANS rows (simplified).
  const out: ParsedTx[] = [];
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    if (!line.startsWith("#TRANS")) continue;
    // #TRANS account {dim} amount date "text"
    const m = line.match(/#TRANS\s+(\d+)\s+\{[^}]*\}\s+(-?[\d.]+)\s+(\d{8})\s+"([^"]*)"/);
    if (!m) continue;
    const [, , amt, date, text] = m;
    const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    out.push({
      transaction_date: iso,
      amount_cents: Math.round(parseFloat(amt) * 100),
      currency: "SEK",
      description: text,
      reference: text,
      raw: { line },
    });
  }
  return out;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { fileName, content, format } = await req.json();
    if (!content || !format) {
      return new Response(JSON.stringify({ error: "content and format required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: batch, error: batchErr } = await supabase
      .from("bank_import_batches")
      .insert({ source: format, file_name: fileName, status: "processing" })
      .select()
      .single();
    if (batchErr) throw batchErr;

    let parsed: ParsedTx[] = [];
    if (format === "csv") parsed = parseCSV(content);
    else if (format === "camt053") parsed = parseCAMT053(content);
    else if (format === "sie") parsed = parseSIE(content);
    else throw new Error(`Unknown format: ${format}`);

    let imported = 0;
    let skipped = 0;
    let errors = 0;
    for (const tx of parsed) {
      const row = {
        batch_id: batch.id,
        source: format,
        external_id: tx.external_id || `${format}:${batch.id}:${imported + skipped}`,
        transaction_date: tx.transaction_date,
        value_date: tx.value_date || null,
        amount_cents: tx.amount_cents,
        currency: tx.currency,
        counterparty: tx.counterparty || null,
        reference: tx.reference || null,
        description: tx.description || null,
        raw_data: tx.raw,
      };
      const { error } = await supabase.from("bank_transactions").upsert(row, {
        onConflict: "source,external_id",
        ignoreDuplicates: true,
      });
      if (error) {
        errors++;
        console.error("[reconciliation-import-file] upsert error", error);
      } else {
        imported++;
      }
    }

    await supabase
      .from("bank_import_batches")
      .update({
        imported_count: imported,
        skipped_count: skipped,
        error_count: errors,
        status: errors > 0 ? "failed" : "completed",
      })
      .eq("id", batch.id);

    return new Response(JSON.stringify({ success: true, imported, skipped, errors, batch_id: batch.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[reconciliation-import-file] error", e);
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
