/**
 * A shared secret for inbound provider webhooks that carry no signature.
 *
 * 46elks signs nothing; Twilio signs with the account auth token, which this
 * platform does not hold (it sends through an API key); GatewayAPI's JWT is
 * optional. Verified 2026-10-22: the three SMS/voice ingests accepted any POST,
 * so a forged inbound SMS made the instance reply by SMS (paid), and a forged
 * 46elks callback made it fetch an attacker URL with the 46elks credentials.
 *
 * The gate is a secret in the registered webhook URL (`?secret=…`), stored in
 * `site_settings.integrations.<provider>.config.webhook_secret` or the
 * `<PROVIDER>_WEBHOOK_SECRET` env. Configured → every POST must carry it.
 * Unconfigured → the request is accepted as before (Law 4, fail forward) and
 * the function logs that the endpoint is unprotected; the 46elks number panel
 * generates and registers one the next time the URLs are saved.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type WebhookSecretCheck = "ok" | "unconfigured" | "mismatch";

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** `?secret=` in the URL or an `x-webhook-secret` header, compared in constant time. */
export function checkWebhookSecret(req: Request, configured: string | null | undefined): WebhookSecretCheck {
  const expected = (configured ?? "").trim();
  if (!expected) return "unconfigured";
  let got = req.headers.get("x-webhook-secret") ?? "";
  try { got = new URL(req.url).searchParams.get("secret") ?? got; } catch { /* keep header */ }
  return constantTimeEqual(got.trim(), expected) ? "ok" : "mismatch";
}

export function generateWebhookSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The configured secret for `provider`: integration config first, then the env value the caller read. */
export async function loadWebhookSecret(supabase: SupabaseClient, provider: string, envValue: string | undefined): Promise<string> {
  const { data, error } = await supabase.from("site_settings").select("value").eq("key", "integrations").maybeSingle();
  if (error) console.error("[webhook-secret] integrations read failed:", error.message);
  const cfg = ((data?.value as Record<string, unknown> | null)?.[provider] as { config?: Record<string, unknown> } | undefined)?.config ?? {};
  return String(cfg.webhook_secret ?? "") || (envValue ?? "") || "";
}

/** The configured secret, or a freshly generated one written into the integration config. */
export async function ensureWebhookSecret(supabase: SupabaseClient, provider: string, envValue: string | undefined): Promise<string> {
  const existing = await loadWebhookSecret(supabase, provider, envValue);
  if (existing) return existing;
  const secret = generateWebhookSecret();
  const { data, error: readError } = await supabase.from("site_settings").select("value").eq("key", "integrations").maybeSingle();
  if (readError) throw new Error(`could not read integrations: ${readError.message}`);
  const value = ((data?.value as Record<string, unknown> | null) ?? {}) as Record<string, Record<string, unknown>>;
  const current = (value[provider] ?? {}) as Record<string, unknown>;
  const config = ((current.config ?? {}) as Record<string, unknown>);
  const next = { ...value, [provider]: { ...current, config: { ...config, webhook_secret: secret } } };
  const { error } = await supabase.from("site_settings").upsert({ key: "integrations", value: next }, { onConflict: "key" });
  if (error) throw new Error(`could not store webhook secret: ${error.message}`);
  return secret;
}

/** `https://api.46elks.com/...` and nothing else — the only host the 46elks credentials may be sent to. */
export function isElks46ApiUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.hostname === "api.46elks.com";
  } catch {
    return false;
  }
}
