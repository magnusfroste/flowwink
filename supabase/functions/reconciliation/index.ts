// Unified reconciliation router
// Routes by URL path segment:
//   POST /functions/v1/reconciliation/auto-match    → auto-match unmatched bank txs
//   POST /functions/v1/reconciliation/import-file   → import CSV/CAMT.053/SIE 4 file
//   POST /functions/v1/reconciliation/import-image  → OCR bank statement image (preview/commit)
//   POST /functions/v1/reconciliation/sync-stripe   → import Stripe payouts
//
// Consolidates reconciliation-auto-match, reconciliation-import-file,
// reconciliation-import-image, reconciliation-sync-stripe into one Edge Function.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceClient } from '../_shared/supabase-clients.ts';
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const idx = segments.lastIndexOf("reconciliation");
  const action = idx >= 0 && segments.length > idx + 1 ? segments[idx + 1] : "";

  try {
    switch (action) {
      case "auto-match":   return await handleAutoMatch();
      case "import-file":  return await handleImportFile(req);
      case "import-image": return await handleImportImage(req);
      case "sync-stripe":  return await handleSyncStripe();
      default:
        return json({
          error: "Unknown reconciliation action",
          hint: "POST to /functions/v1/reconciliation/{auto-match|import-file|import-image|sync-stripe}",
        }, 404);
    }
  } catch (e: any) {
    console.error(`[reconciliation/${action}] error`, e);
    return json({ success: false, error: e.message || "Internal error" }, 500);
  }
});

const sb = () => getServiceClient();

// =============================================================================
// AUTO-MATCH (was reconciliation-auto-match)
// =============================================================================

async function handleAutoMatch(): Promise<Response> {
  const supabase = sb();

  const { data: txs, error: txErr } = await supabase
    .from("bank_transactions")
    .select("id, transaction_date, amount_cents, currency, reference, counterparty")
    .eq("status", "unmatched")
    .limit(500);
  if (txErr) throw txErr;

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, total_cents, currency, created_at")
    .in("status", ["sent", "overdue"]);
  const { data: expenses } = await supabase
    .from("expenses")
    .select("id, description, amount_cents, currency, created_at")
    .eq("status", "approved");

  let matched = 0;
  let suggested = 0;
  for (const tx of txs || []) {
    const candidates: Array<{
      entity_type: "invoice" | "expense";
      entity_id: string;
      amount: number;
      ref: string;
      date: string;
    }> = [];

    if (tx.amount_cents > 0) {
      for (const inv of invoices || []) {
        if (inv.currency !== tx.currency) continue;
        if (inv.total_cents !== tx.amount_cents) continue;
        candidates.push({ entity_type: "invoice", entity_id: inv.id, amount: inv.total_cents, ref: inv.invoice_number, date: inv.created_at });
      }
    }
    if (tx.amount_cents < 0) {
      for (const exp of expenses || []) {
        if (exp.currency !== tx.currency) continue;
        if (exp.amount_cents !== Math.abs(tx.amount_cents)) continue;
        candidates.push({ entity_type: "expense", entity_id: exp.id, amount: -exp.amount_cents, ref: exp.description || "", date: exp.created_at });
      }
    }

    if (candidates.length === 0) continue;

    const txRef = (tx.reference || "").toLowerCase();
    let chosen = candidates[0];
    let confidence = 0.6;
    let isAuto = false;

    for (const c of candidates) {
      if (c.ref && txRef.includes(c.ref.toLowerCase())) {
        chosen = c; confidence = 0.95; isAuto = true; break;
      }
    }

    const { data: existing } = await supabase
      .from("reconciliation_matches").select("id").eq("bank_transaction_id", tx.id).limit(1);
    if (existing && existing.length > 0) continue;

    const { error: insErr } = await supabase.from("reconciliation_matches").insert({
      bank_transaction_id: tx.id,
      entity_type: chosen.entity_type,
      entity_id: chosen.entity_id,
      amount_cents: chosen.amount,
      match_type: isAuto ? "auto" : "suggested",
      confidence,
    });
    if (insErr) { console.error("[auto-match] insert error", insErr); continue; }
    if (isAuto) matched++; else suggested++;
  }

  return json({ success: true, matched, suggested });
}

// =============================================================================
// IMPORT-FILE (was reconciliation-import-file)
// =============================================================================

interface ParsedTx {
  external_id?: string;
  transaction_date: string;
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
  source_account?: string;
  bank_gl_accounts?: string[];
}

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

  if (dateIdx < 0 || amountIdx < 0) throw new Error("CSV must contain at least date + amount columns");

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

function parseCAMT053(xml: string): ParseResult {
  const get = (block: string, tag: string) => {
    const m = block.match(new RegExp(`<${tag}[^>]*>([^<]+)<\\/${tag}>`));
    return m ? m[1] : undefined;
  };
  const stmtMatch = xml.match(/<Stmt>([\s\S]*?)<\/Stmt>/);
  const headerScope = stmtMatch ? stmtMatch[1].split("<Ntry>")[0] : xml.split("<Ntry>")[0];
  const acctBlockMatch = headerScope.match(/<Acct>([\s\S]*?)<\/Acct>/);
  const acctBlock = acctBlockMatch ? acctBlockMatch[1] : headerScope;
  const source_account =
    get(acctBlock, "IBAN") || get(acctBlock, "BBAN") ||
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
      external_id: ref, transaction_date: date, value_date,
      amount_cents: Math.round(parseFloat(amt) * 100) * sign,
      currency: ccy, counterparty: cp, reference: ref, description: desc,
      raw: { entry: block.substring(0, 500) },
    });
  }
  return { transactions, source_account };
}

function parseSIE(content: string): ParseResult {
  const transactions: ParsedTx[] = [];
  const bankGlSet = new Set<string>();
  const kontoRe = /^#KONTO\s+(\d+)\s+"([^"]*)"/gm;
  const accountNames = new Map<string, string>();
  let km;
  while ((km = kontoRe.exec(content)) !== null) {
    const code = km[1];
    accountNames.set(code, km[2]);
    if (/^19\d{2}$/.test(code)) bankGlSet.add(code);
  }
  const isBankAccount = (code: string) =>
    bankGlSet.size > 0 ? bankGlSet.has(code) : /^19\d{2}$/.test(code);

  const verRe = /^#VER\s+(\S+)\s+"([^"]*)"\s+(\d{8})\s+"([^"]*)"(?:\s+(\d{8}))?\s*\r?\n\{([\s\S]*?)^\}/gm;
  let vm;
  while ((vm = verRe.exec(content)) !== null) {
    const [, series, verNum, verDate, verText, , block] = vm;
    const transRe = /#TRANS\s+(\d+)\s+\{[^}]*\}\s+(-?[\d.]+)(?:\s+(\d{8}))?(?:\s+"([^"]*)")?/g;
    const transLines: { account: string; amount: number; date?: string; text?: string }[] = [];
    let tm;
    while ((tm = transRe.exec(block)) !== null) {
      transLines.push({ account: tm[1], amount: parseFloat(tm[2]), date: tm[3], text: tm[4] });
    }
    if (!transLines.length) continue;
    const bankLine = transLines.find((l) => isBankAccount(l.account));
    if (!bankLine) continue;
    const nonBank = transLines.find((l) => !isBankAccount(l.account));
    const counterparty = nonBank ? accountNames.get(nonBank.account) || `Konto ${nonBank.account}` : undefined;
    const dateRaw = bankLine.date || verDate;
    const iso = `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`;
    transactions.push({
      external_id: `sie:${series}:${verNum}`,
      transaction_date: iso,
      amount_cents: Math.round(bankLine.amount * 100),
      currency: "SEK", counterparty,
      reference: bankLine.text || verText, description: verText,
      raw: { ver: `${series} ${verNum}`, lines: transLines.length, bank_account: bankLine.account },
    });
  }

  if (transactions.length === 0) {
    const transOnly = /^#TRANS\s+(\d+)\s+\{[^}]*\}\s+(-?[\d.]+)\s+(\d{8})\s+"([^"]*)"/gm;
    let tm;
    while ((tm = transOnly.exec(content)) !== null) {
      const [, account, amt, date, text] = tm;
      if (!isBankAccount(account)) continue;
      const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
      transactions.push({
        transaction_date: iso, amount_cents: Math.round(parseFloat(amt) * 100),
        currency: "SEK", description: text, reference: text,
        raw: { line: tm[0], account },
      });
    }
  }

  return { transactions, bank_gl_accounts: Array.from(bankGlSet) };
}

async function handleImportFile(req: Request): Promise<Response> {
  const supabase = sb();
  const { fileName, content, format } = await req.json();
  if (!content || !format) return json({ error: "content and format required" }, 400);

  let result: ParseResult = { transactions: [] };
  if (format === "csv") result = parseCSV(content);
  else if (format === "camt053") result = parseCAMT053(content);
  else if (format === "sie") result = parseSIE(content);
  else throw new Error(`Unknown format: ${format}`);

  let targetBankAccountId: string | null = null;
  let matchReason = "default";

  if (result.source_account) {
    const normalized = result.source_account.replace(/\s/g, "").toUpperCase();
    const { data: matches } = await supabase
      .from("bank_accounts").select("id, account_number").eq("archived", false);
    const hit = (matches || []).find(
      (a: any) => (a.account_number || "").replace(/\s/g, "").toUpperCase() === normalized,
    );
    if (hit) { targetBankAccountId = hit.id; matchReason = `iban:${normalized}`; }
  }

  if (!targetBankAccountId && result.bank_gl_accounts?.length) {
    const { data: glMatches } = await supabase
      .from("bank_accounts").select("id, gl_account").eq("archived", false)
      .in("gl_account", result.bank_gl_accounts);
    if (glMatches && glMatches.length) {
      targetBankAccountId = glMatches[0].id;
      matchReason = `gl:${glMatches[0].gl_account}`;
    }
  }

  if (!targetBankAccountId) {
    const { data: def } = await supabase
      .from("bank_accounts").select("id").eq("is_default", true).eq("archived", false).maybeSingle();
    if (def) targetBankAccountId = def.id;
  }

  const { data: batch, error: batchErr } = await supabase
    .from("bank_import_batches")
    .insert({
      source: format, file_name: fileName, status: "processing",
      metadata: {
        source_account: result.source_account || null,
        bank_gl_accounts: result.bank_gl_accounts || [],
        bank_account_id: targetBankAccountId,
        match_reason: matchReason,
      },
    })
    .select().single();
  if (batchErr) throw batchErr;

  let imported = 0;
  let skipped = 0;
  let errors = 0;
  for (const tx of result.transactions) {
    const row = {
      batch_id: batch.id, bank_account_id: targetBankAccountId, source: format,
      external_id: tx.external_id || `${format}:${batch.id}:${imported + skipped}`,
      transaction_date: tx.transaction_date, value_date: tx.value_date || null,
      amount_cents: tx.amount_cents, currency: tx.currency,
      counterparty: tx.counterparty || null, reference: tx.reference || null,
      description: tx.description || null, raw_data: tx.raw,
    };
    const { error } = await supabase.from("bank_transactions").upsert(row, {
      onConflict: "source,external_id", ignoreDuplicates: true,
    });
    if (error) { errors++; console.error("[reconciliation/import-file] upsert error", error); }
    else imported++;
  }

  await supabase.from("bank_import_batches").update({
    imported_count: imported, skipped_count: skipped, error_count: errors,
    status: errors > 0 ? "failed" : "completed",
  }).eq("id", batch.id);

  return json({
    success: true, imported, skipped, errors, batch_id: batch.id,
    bank_account_id: targetBankAccountId, match_reason: matchReason,
    source_account: result.source_account || null,
  });
}

// =============================================================================
// IMPORT-IMAGE (was reconciliation-import-image) — OCR vision
// =============================================================================

interface OcrTx {
  transaction_date: string;
  amount_cents: number;
  currency: string;
  counterparty?: string;
  reference?: string;
  description?: string;
}

const SYSTEM_PROMPT = `You extract bank statement transactions from images or PDFs of bank account printouts/screenshots.
Rules:
- Output one row per visible posted transaction. Skip headers, totals, balances, and pending lines.
- transaction_date in ISO YYYY-MM-DD. Infer year from page if needed.
- amount_cents is integer; debits/withdrawals are NEGATIVE, credits/deposits are POSITIVE.
- currency is ISO 4217 (default SEK if statement is Swedish and currency is missing).
- counterparty = the merchant or person; reference = OCR/message/payment reference if shown; description = free text on the row.
- If you cannot read a value confidently, omit it (do not guess).`;

const TOOL_DEF = {
  type: "function",
  function: {
    name: "submit_transactions",
    description: "Return the list of bank transactions extracted from the statement image.",
    parameters: {
      type: "object",
      properties: {
        currency_default: { type: "string", description: "ISO 4217 currency used when row currency is missing." },
        transactions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              transaction_date: { type: "string" },
              amount_cents: { type: "integer" },
              currency: { type: "string" },
              counterparty: { type: "string" },
              reference: { type: "string" },
              description: { type: "string" },
            },
            required: ["transaction_date", "amount_cents"],
          },
        },
      },
      required: ["transactions"],
    },
  },
};

async function ocrWithOpenAI(dataUrl: string, model: string) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY is not configured");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract every posted transaction from this bank statement." },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      tools: [TOOL_DEF],
      tool_choice: { type: "function", function: { name: "submit_transactions" } },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("OpenAI returned no tool call");
  return JSON.parse(args);
}

async function ocrWithGemini(_dataUrl: string, mime: string, base64: string, model: string) {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [
          { text: "Extract every posted transaction from this bank statement." },
          { inlineData: { mimeType: mime, data: base64 } },
        ] }],
        tools: [{ functionDeclarations: [TOOL_DEF.function] }],
        toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["submit_transactions"] } },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const call = j.candidates?.[0]?.content?.parts?.find((p: any) => p.functionCall)?.functionCall;
  if (!call) throw new Error("Gemini returned no function call");
  return call.args;
}

async function handleImportImage(req: Request): Promise<Response> {
  const supabase = sb();
  const body = await req.json();
  const {
    fileName, contentBase64, mimeType, provider = "openai", model,
    commit = false, transactions: clientTransactions, currency_default: clientCurrency,
  } = body ?? {};

  let parsed: { transactions: OcrTx[]; currency_default?: string };

  if (commit && Array.isArray(clientTransactions)) {
    parsed = { transactions: clientTransactions, currency_default: clientCurrency };
  } else {
    if (!contentBase64 || !mimeType) {
      return json({ error: "contentBase64 and mimeType required" }, 400);
    }
    const dataUrl = `data:${mimeType};base64,${contentBase64}`;
    const useModel = model || (provider === "gemini" ? "gemini-2.5-pro" : "gpt-5");
    parsed = provider === "gemini"
      ? await ocrWithGemini(dataUrl, mimeType, contentBase64, useModel)
      : await ocrWithOpenAI(dataUrl, useModel);
  }

  const defaultCurrency = (parsed.currency_default || "SEK").toUpperCase();
  const txs: OcrTx[] = (parsed.transactions || []).map((t) => ({
    transaction_date: t.transaction_date,
    amount_cents: Math.round(Number(t.amount_cents)),
    currency: (t.currency || defaultCurrency).toUpperCase(),
    counterparty: t.counterparty || undefined,
    reference: t.reference || undefined,
    description: t.description || undefined,
  })).filter((t) => t.transaction_date && Number.isFinite(t.amount_cents));

  if (!commit) {
    return json({ success: true, preview: true, transactions: txs, currency_default: defaultCurrency });
  }

  const { data: batch, error: batchErr } = await supabase
    .from("bank_import_batches")
    .insert({ source: "ocr", file_name: fileName, status: "processing" })
    .select().single();
  if (batchErr) throw batchErr;

  let imported = 0;
  let errors = 0;
  for (let i = 0; i < txs.length; i++) {
    const tx = txs[i];
    const { error } = await supabase.from("bank_transactions").upsert({
      batch_id: batch.id, source: "ocr",
      external_id: `ocr:${batch.id}:${i}`,
      transaction_date: tx.transaction_date,
      amount_cents: tx.amount_cents, currency: tx.currency,
      counterparty: tx.counterparty || null, reference: tx.reference || null,
      description: tx.description || null,
      raw_data: { ocr: true, provider, fileName },
    }, { onConflict: "source,external_id", ignoreDuplicates: true });
    if (error) { errors++; console.error("[reconciliation/import-image] upsert", error); }
    else imported++;
  }

  await supabase.from("bank_import_batches").update({
    imported_count: imported, skipped_count: 0, error_count: errors,
    status: errors > 0 ? "failed" : "completed",
  }).eq("id", batch.id);

  return json({ success: true, imported, errors, batch_id: batch.id });
}

// =============================================================================
// SYNC-STRIPE (was reconciliation-sync-stripe)
// =============================================================================

async function handleSyncStripe(): Promise<Response> {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) return json({ error: "STRIPE_SECRET_KEY not configured" }, 503);

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
  const supabase = sb();

  const { data: batch, error: batchErr } = await supabase
    .from("bank_import_batches")
    .insert({ source: "stripe", status: "processing" })
    .select().single();
  if (batchErr) throw batchErr;

  const since = Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
  const payouts = await stripe.payouts.list({ created: { gte: since }, limit: 100 });

  let imported = 0;
  let skipped = 0;
  for (const p of payouts.data) {
    const row = {
      batch_id: batch.id, source: "stripe" as const, external_id: p.id,
      transaction_date: new Date(p.arrival_date * 1000).toISOString().slice(0, 10),
      value_date: new Date(p.created * 1000).toISOString().slice(0, 10),
      amount_cents: p.amount, currency: p.currency.toUpperCase(),
      counterparty: "Stripe Payout", reference: p.id,
      description: p.description || `Payout ${p.id}`,
      raw_data: p as unknown as Record<string, unknown>,
    };
    const { error } = await supabase.from("bank_transactions").upsert(row, {
      onConflict: "source,external_id", ignoreDuplicates: true,
    });
    if (error) { console.error("[reconciliation/sync-stripe] upsert error", error); skipped++; }
    else imported++;
  }

  await supabase.from("bank_import_batches")
    .update({ imported_count: imported, skipped_count: skipped, status: "completed" })
    .eq("id", batch.id);

  return json({ success: true, imported, skipped, batch_id: batch.id });
}
