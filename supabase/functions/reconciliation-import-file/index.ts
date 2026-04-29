// Import bank statement: CSV (generic), CAMT.053 (XML, ISO 20022), SIE 4 (Swedish).
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

interface ParseResult {
  transactions: ParsedTx[];
  /** Account identifier read from the file header (IBAN/BBAN/account number) — used to auto-link bank_account_id. */
  source_account?: string;
  /** SIE only: list of GL accounts that look like bank accounts (19xx in BAS). */
  bank_gl_accounts?: string[];
}

// ---------------- CSV ----------------

function parseCSV(content: string): ParseResult {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { transactions: [] };
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
  return { transactions: out };
}

// ---------------- CAMT.053 ----------------

function parseCAMT053(xml: string): ParseResult {
  const get = (block: string, tag: string) => {
    const m = block.match(new RegExp(`<${tag}[^>]*>([^<]+)<\\/${tag}>`));
    return m ? m[1] : undefined;
  };

  // Extract source account from <Stmt><Acct> header. Order: IBAN > Othr/Id > BBAN.
  // Falls back to scanning the whole document if no <Stmt> wrapper.
  const stmtMatch = xml.match(/<Stmt>([\s\S]*?)<\/Stmt>/);
  const headerScope = stmtMatch ? stmtMatch[1].split("<Ntry>")[0] : xml.split("<Ntry>")[0];
  const acctBlockMatch = headerScope.match(/<Acct>([\s\S]*?)<\/Acct>/);
  const acctBlock = acctBlockMatch ? acctBlockMatch[1] : headerScope;
  const source_account =
    get(acctBlock, "IBAN") ||
    get(acctBlock, "BBAN") ||
    acctBlock.match(/<Othr>[\s\S]*?<Id>([^<]+)<\/Id>/)?.[1];

  const transactions: ParsedTx[] = [];
  const entryRe = /<Ntry>([\s\S]*?)<\/Ntry>/g;
  let m;
  while ((m = entryRe.exec(xml)) !== null) {
    const block = m[1];
    const amt = get(block, "Amt");
    const ccy = block.match(/<Amt[^>]*Ccy="([A-Z]{3})"/)?.[1] || "SEK";
    const cdtDbt = get(block, "CdtDbtInd");
    const dt = get(block, "BookgDt") || get(block, "Dt");
    const date = dt ? dt.match(/\d{4}-\d{2}-\d{2}/)?.[0] : undefined;
    const valDt = get(block, "ValDt");
    const value_date = valDt ? valDt.match(/\d{4}-\d{2}-\d{2}/)?.[0] : undefined;
    const ref = get(block, "EndToEndId") || get(block, "AcctSvcrRef");
    const desc = get(block, "AddtlNtryInf") || get(block, "Ustrd");
    const cp = get(block, "Nm");
    if (!date || !amt) continue;
    const sign = cdtDbt === "DBIT" ? -1 : 1;
    transactions.push({
      external_id: ref,
      transaction_date: date,
      value_date,
      amount_cents: Math.round(parseFloat(amt) * 100) * sign,
      currency: ccy,
      counterparty: cp,
      reference: ref,
      description: desc,
      raw: { entry: block.substring(0, 500) },
    });
  }
  return { transactions, source_account };
}

// ---------------- SIE 4 ----------------

/**
 * SIE 4 parser — reads #VER blocks and treats each verification as one bank transaction
 * (using the line that hits a bank GL account, typically 19xx in BAS).
 *
 * Format reminder:
 *   #VER A "1" 20240115 "Customer payment" 20240115
 *   {
 *     #TRANS 1930 {} 1500.00 20240115 "Invoice 1042"
 *     #TRANS 1510 {} -1500.00 20240115 "Invoice 1042"
 *   }
 */
function parseSIE(content: string): ParseResult {
  const transactions: ParsedTx[] = [];
  const bankGlSet = new Set<string>();

  // Extract account list (#KONTO 1930 "Bank") to know which accounts are bank accounts.
  const kontoRe = /^#KONTO\s+(\d+)\s+"([^"]*)"/gm;
  const accountNames = new Map<string, string>();
  let km;
  while ((km = kontoRe.exec(content)) !== null) {
    const code = km[1];
    accountNames.set(code, km[2]);
    if (/^19\d{2}$/.test(code)) bankGlSet.add(code); // BAS class 19 = liquid funds
  }

  // If no #KONTO directives, fall back to anything starting with 19.
  const isBankAccount = (code: string) =>
    bankGlSet.size > 0 ? bankGlSet.has(code) : /^19\d{2}$/.test(code);

  // Iterate #VER blocks.
  const verRe = /^#VER\s+(\S+)\s+"([^"]*)"\s+(\d{8})\s+"([^"]*)"(?:\s+(\d{8}))?\s*\r?\n\{([\s\S]*?)^\}/gm;
  let vm;
  while ((vm = verRe.exec(content)) !== null) {
    const [, series, verNum, verDate, verText, , block] = vm;
    const transRe = /#TRANS\s+(\d+)\s+\{[^}]*\}\s+(-?[\d.]+)(?:\s+(\d{8}))?(?:\s+"([^"]*)")?/g;
    const transLines: { account: string; amount: number; date?: string; text?: string }[] = [];
    let tm;
    while ((tm = transRe.exec(block)) !== null) {
      transLines.push({
        account: tm[1],
        amount: parseFloat(tm[2]),
        date: tm[3],
        text: tm[4],
      });
    }
    if (!transLines.length) continue;

    // Pick the bank-side line as the canonical bank transaction.
    const bankLine = transLines.find((l) => isBankAccount(l.account));
    if (!bankLine) continue;

    // Counterparty hint: the largest non-bank line's account name.
    const nonBank = transLines.find((l) => !isBankAccount(l.account));
    const counterparty = nonBank
      ? accountNames.get(nonBank.account) || `Konto ${nonBank.account}`
      : undefined;

    const dateRaw = bankLine.date || verDate;
    const iso = `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`;

    transactions.push({
      external_id: `sie:${series}:${verNum}`,
      transaction_date: iso,
      amount_cents: Math.round(bankLine.amount * 100),
      currency: "SEK",
      counterparty,
      reference: bankLine.text || verText,
      description: verText,
      raw: { ver: `${series} ${verNum}`, lines: transLines.length, bank_account: bankLine.account },
    });
  }

  // Fallback: if file has no #VER blocks (raw export), treat each #TRANS individually as before.
  if (transactions.length === 0) {
    const transOnly = /^#TRANS\s+(\d+)\s+\{[^}]*\}\s+(-?[\d.]+)\s+(\d{8})\s+"([^"]*)"/gm;
    let tm;
    while ((tm = transOnly.exec(content)) !== null) {
      const [, account, amt, date, text] = tm;
      if (!isBankAccount(account)) continue;
      const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
      transactions.push({
        transaction_date: iso,
        amount_cents: Math.round(parseFloat(amt) * 100),
        currency: "SEK",
        description: text,
        reference: text,
        raw: { line: tm[0], account },
      });
    }
  }

  return { transactions, bank_gl_accounts: Array.from(bankGlSet) };
}

// ---------------- handler ----------------

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

    let result: ParseResult = { transactions: [] };
    if (format === "csv") result = parseCSV(content);
    else if (format === "camt053") result = parseCAMT053(content);
    else if (format === "sie") result = parseSIE(content);
    else throw new Error(`Unknown format: ${format}`);

    // ---- Resolve target bank_account_id ----
    // Strategy:
    //   1) If parser found a source_account (CAMT IBAN/BBAN), match against bank_accounts.account_number.
    //   2) If SIE has bank_gl_accounts, match the first one against bank_accounts.gl_account.
    //   3) Else, fall back to the default account.
    let targetBankAccountId: string | null = null;
    let matchReason = "default";

    if (result.source_account) {
      const normalized = result.source_account.replace(/\s/g, "").toUpperCase();
      const { data: matches } = await supabase
        .from("bank_accounts")
        .select("id, account_number")
        .eq("archived", false);
      const hit = (matches || []).find(
        (a: any) => (a.account_number || "").replace(/\s/g, "").toUpperCase() === normalized,
      );
      if (hit) {
        targetBankAccountId = hit.id;
        matchReason = `iban:${normalized}`;
      }
    }

    if (!targetBankAccountId && result.bank_gl_accounts?.length) {
      const { data: glMatches } = await supabase
        .from("bank_accounts")
        .select("id, gl_account")
        .eq("archived", false)
        .in("gl_account", result.bank_gl_accounts);
      if (glMatches && glMatches.length) {
        targetBankAccountId = glMatches[0].id;
        matchReason = `gl:${glMatches[0].gl_account}`;
      }
    }

    if (!targetBankAccountId) {
      const { data: def } = await supabase
        .from("bank_accounts")
        .select("id")
        .eq("is_default", true)
        .eq("archived", false)
        .maybeSingle();
      if (def) targetBankAccountId = def.id;
    }

    const { data: batch, error: batchErr } = await supabase
      .from("bank_import_batches")
      .insert({
        source: format,
        file_name: fileName,
        status: "processing",
        metadata: {
          source_account: result.source_account || null,
          bank_gl_accounts: result.bank_gl_accounts || [],
          bank_account_id: targetBankAccountId,
          match_reason: matchReason,
        },
      })
      .select()
      .single();
    if (batchErr) throw batchErr;

    let imported = 0;
    let skipped = 0;
    let errors = 0;
    for (const tx of result.transactions) {
      const row = {
        batch_id: batch.id,
        bank_account_id: targetBankAccountId,
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

    return new Response(
      JSON.stringify({
        success: true,
        imported,
        skipped,
        errors,
        batch_id: batch.id,
        bank_account_id: targetBankAccountId,
        match_reason: matchReason,
        source_account: result.source_account || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("[reconciliation-import-file] error", e);
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
