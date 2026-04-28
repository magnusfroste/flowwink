// OCR-import av bankkontoutdrag (bild/PDF) → strukturerade bank_transactions.
// Två lägen:
//   - preview (default): returnerar parsade transaktioner UTAN att skriva
//   - commit=true:        skriver in i bank_transactions (efter användarens godkännande)
//
// Provider: OpenAI GPT-5 (vision) eller Gemini 2.5 Pro (vision).
// Aldrig Lovable AI — projektet är self-hosted.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParsedTx {
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
  const json = await res.json();
  const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("OpenAI returned no tool call");
  return JSON.parse(args);
}

async function ocrWithGemini(dataUrl: string, mime: string, base64: string, model: string) {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          {
            role: "user",
            parts: [
              { text: "Extract every posted transaction from this bank statement." },
              { inlineData: { mimeType: mime, data: base64 } },
            ],
          },
        ],
        tools: [{ functionDeclarations: [TOOL_DEF.function] }],
        toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["submit_transactions"] } },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const call = json.candidates?.[0]?.content?.parts?.find((p: any) => p.functionCall)?.functionCall;
  if (!call) throw new Error("Gemini returned no function call");
  return call.args;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const {
      fileName,
      contentBase64,
      mimeType,
      provider = "openai",
      model,
      commit = false,
      transactions: clientTransactions,
      currency_default: clientCurrency,
    } = body ?? {};

    let parsed: { transactions: ParsedTx[]; currency_default?: string };

    if (commit && Array.isArray(clientTransactions)) {
      // Användaren har godkänt en preview — hoppa över OCR och skriv direkt.
      parsed = { transactions: clientTransactions, currency_default: clientCurrency };
    } else {
      if (!contentBase64 || !mimeType) {
        return new Response(JSON.stringify({ error: "contentBase64 and mimeType required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const dataUrl = `data:${mimeType};base64,${contentBase64}`;
      const useModel =
        model ||
        (provider === "gemini" ? "gemini-2.5-pro" : "gpt-5");
      parsed =
        provider === "gemini"
          ? await ocrWithGemini(dataUrl, mimeType, contentBase64, useModel)
          : await ocrWithOpenAI(dataUrl, useModel);
    }

    const defaultCurrency = (parsed.currency_default || "SEK").toUpperCase();
    const txs: ParsedTx[] = (parsed.transactions || []).map((t) => ({
      transaction_date: t.transaction_date,
      amount_cents: Math.round(Number(t.amount_cents)),
      currency: (t.currency || defaultCurrency).toUpperCase(),
      counterparty: t.counterparty || undefined,
      reference: t.reference || undefined,
      description: t.description || undefined,
    })).filter((t) => t.transaction_date && Number.isFinite(t.amount_cents));

    if (!commit) {
      // Preview — returnera bara, skriv inget.
      return new Response(
        JSON.stringify({ success: true, preview: true, transactions: txs, currency_default: defaultCurrency }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Commit — skapa batch + skriv bank_transactions.
    const { data: batch, error: batchErr } = await supabase
      .from("bank_import_batches")
      .insert({ source: "ocr", file_name: fileName, status: "processing" })
      .select()
      .single();
    if (batchErr) throw batchErr;

    let imported = 0;
    let errors = 0;
    for (let i = 0; i < txs.length; i++) {
      const tx = txs[i];
      const { error } = await supabase.from("bank_transactions").upsert({
        batch_id: batch.id,
        source: "ocr",
        external_id: `ocr:${batch.id}:${i}`,
        transaction_date: tx.transaction_date,
        amount_cents: tx.amount_cents,
        currency: tx.currency,
        counterparty: tx.counterparty || null,
        reference: tx.reference || null,
        description: tx.description || null,
        raw_data: { ocr: true, provider, fileName },
      }, { onConflict: "source,external_id", ignoreDuplicates: true });
      if (error) { errors++; console.error("[ocr-import] upsert", error); }
      else imported++;
    }

    await supabase
      .from("bank_import_batches")
      .update({
        imported_count: imported,
        skipped_count: 0,
        error_count: errors,
        status: errors > 0 ? "failed" : "completed",
      })
      .eq("id", batch.id);

    return new Response(
      JSON.stringify({ success: true, imported, errors, batch_id: batch.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("[reconciliation-import-image] error", e);
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
