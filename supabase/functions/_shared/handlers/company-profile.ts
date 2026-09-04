// Edge function backing get_company_profile + update_company_profile MCP skills.
// Reads/writes site_settings.company_profile (Business Identity).
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface Body {
  action?: "get" | "update";
  data?: Record<string, unknown>;
  merge?: boolean; // when update: shallow-merge instead of replace (default true)
  _skill?: string;
  [key: string]: unknown;
}

// company_profile — internal skill handler (get_company_profile /
// update_company_profile). Moved VERBATIM from the standalone
// company-profile edge function (edge-surface B1b). The edge: dispatch
// injected _skill; agent-execute now passes skill.name as a parameter.

export async function executeCompanyProfile(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  skillName: string,
): Promise<Record<string, unknown>> {

  try {
    const body = args as Body;
    const inferredAction =
      body.action ??
      (skillName === "update_company_profile" ? "update" : undefined) ??
      (skillName === "get_company_profile" ? "get" : undefined) ??
      "get";

    const sb = supabase;

    if (inferredAction === "get") {
      const { data, error } = await sb
        .from("site_settings")
        .select("value, updated_at")
        .eq("key", "company_profile")
        .maybeSingle();
      if (error) throw error;
      return json({
        success: true,
        company_profile: data?.value ?? null,
        updated_at: data?.updated_at ?? null,
      });
    }

    if (inferredAction === "update") {
      const fallbackData = Object.fromEntries(
        Object.entries(body).filter(([key, value]) => {
          if (key === "action" || key === "merge" || key === "_skill") return false;
          if (key.startsWith("_")) return false;
          return value !== undefined;
        }),
      );

      const incomingData = body.data && typeof body.data === "object"
        ? body.data
        : fallbackData;

      if (!incomingData || typeof incomingData !== "object" || Object.keys(incomingData).length === 0) {
        return json({ success: false, error: "data object is required for update" }, 400);
      }

      // Defensive normalization: the structured Business Identity fields have
      // shapes the page-authoring surfaces depend on (services and
      // differentiators are [{id, name, description}], proof_points are
      // {value, label, context}, testimonials are {quote, author, role,
      // company}, primary_cta is {label, destination, intent}). Agents guess —
      // strings, {description} with no name, a number where a labelled figure
      // belongs — so coerce or drop here rather than letting a half-shape reach
      // the editor and the prompts.
      const normalized = normalizeProfileShapes(incomingData as Record<string, unknown>);

      let next: Record<string, unknown> = normalized;
      if (body.merge !== false) {
        const { data: existing } = await sb
          .from("site_settings")
          .select("value")
          .eq("key", "company_profile")
          .maybeSingle();
        const current = (existing?.value ?? {}) as Record<string, unknown>;
        next = { ...current, ...normalized };
      }

      const { data, error } = await sb
        .from("site_settings")
        .upsert(
          { key: "company_profile", value: next, updated_at: new Date().toISOString() },
          { onConflict: "key" },
        )
        .select("value, updated_at")
        .single();
      if (error) throw error;

      // The identity is ONE fact with several readers: the header brand, the
      // page-title template, the schema.org organization. A template install
      // strips the fictional ones (installIdentityPolicy); this fills the
      // empty ones from the real name — and never overwrites a value someone
      // chose. New liteit read "Organization" in the header until this ran.
      const projected = await projectIdentityIntoChrome(sb, next);

      return json({
        success: true,
        company_profile: data.value,
        updated_at: data.updated_at,
        message: "Company profile updated",
        ...(projected.length ? { also_set: projected } : {}),
      });
    }

    return json({ success: false, error: `Unknown action: ${inferredAction}` }, 400);
  } catch (err) {
    console.error("[company-profile] error:", err);
    return json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      500,
    );
  }
}

// The edge: dispatch parsed the JSON body regardless of HTTP status, so
// callers only ever saw these objects — status codes are dropped, not lost.
function json(body: unknown, _status = 200): Record<string, unknown> {
  return body as Record<string, unknown>;
}

/**
 * Coerce the structured Business Identity fields into the shapes the editor and
 * the prompt projection expect. Mirrors src/lib/company-profile-shapes.ts —
 * two runtimes (Deno edge / Vite frontend), one contract, pinned by
 * src/lib/__tests__/business-identity-projection.guardrails.test.ts.
 *
 * Only keys PRESENT in the payload are touched: update_company_profile is a
 * shallow merge, so an absent key must stay absent rather than be written empty.
 */
function normalizeProfileShapes(data: Record<string, unknown>): Record<string, unknown> {
  const next = { ...data };
  if ("services" in next) next.services = normalizeNamedItems(next.services);
  if ("differentiators" in next) next.differentiators = normalizeNamedItems(next.differentiators);
  if ("proof_points" in next) next.proof_points = normalizeProofPoints(next.proof_points);
  if ("client_testimonials" in next) next.client_testimonials = normalizeTestimonials(next.client_testimonials);
  if ("primary_cta" in next) next.primary_cta = normalizePrimaryCta(next.primary_cta);
  return next;
}

const asText = (v: unknown): string =>
  typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";

const firstText = (o: Record<string, unknown>, keys: string[]): string => {
  for (const k of keys) {
    const v = asText(o[k]);
    if (v) return v;
  }
  return "";
};

/**
 * `[{id, name, description}]` — used by BOTH services and differentiators.
 *
 * Accepted inputs:
 *   - "Foo"                          → {id, name: "Foo", description: ""}
 *   - {name, description}            → {id, name, description}
 *   - {service, desc}                → {id, name: service, description: desc}
 *   - {title, summary}               → {id, name: title, description: summary}
 *   - {description: "..."} (no name) → DROPPED (would render as an empty card)
 *   - Record<string, string>         → [{name, description}, ...] (legacy object form)
 *
 * A missing description stays EMPTY. The page generator can omit a description;
 * it cannot un-invent one.
 */
function normalizeNamedItems(raw: unknown): Array<{ id: string; name: string; description: string }> {
  const out: Array<{ id: string; name: string; description: string }> = [];
  const push = (name: unknown, description: unknown, id?: unknown) => {
    const n = asText(name);
    if (!n) return; // drop nameless entries — they become empty placeholders in the UI
    out.push({ id: asText(id) || crypto.randomUUID(), name: n, description: asText(description) });
  };

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string") {
        push(item, "");
      } else if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        push(
          firstText(o, ["name", "service", "title", "label"]),
          firstText(o, ["description", "desc", "summary", "details"]),
          o.id,
        );
      }
    }
  } else if (typeof raw === "string") {
    push(raw, "");
  } else if (raw && typeof raw === "object") {
    // Legacy object form: { "Service A": "desc A", "Service B": "desc B" }
    for (const [name, description] of Object.entries(raw as Record<string, unknown>)) {
      push(name, description);
    }
  }

  return out;
}

/**
 * `[{id, value, label, context}]` — a figure held AS a figure.
 *
 * A bare string is split only on a LEADING number ("412 km kanalisation" →
 * value "412 km", label "kanalisation"); anything that does not start with a
 * digit keeps its whole text as the label and an empty value. Prose is never
 * mined for metrics here — that is the fabrication this field exists to stop.
 */
function normalizeProofPoints(raw: unknown): Array<{ id: string; value: string; label: string; context: string }> {
  const out: Array<{ id: string; value: string; label: string; context: string }> = [];
  const push = (value: unknown, label: unknown, context: unknown, id?: unknown) => {
    const v = asText(value);
    const l = asText(label);
    if (!v && !l) return;
    out.push({ id: asText(id) || crypto.randomUUID(), value: v, label: l, context: asText(context) });
  };

  const items = Array.isArray(raw) ? raw : raw === null || raw === undefined || raw === "" ? [] : [raw];
  for (const item of items) {
    if (typeof item === "string" || typeof item === "number") {
      const text = asText(item);
      const m = text.match(/^([+-]?\d[\d\s.,]*)\s*(%|[^\s\d]{1,12})?\s*(.*)$/u);
      if (m) {
        const unit = (m[2] ?? "").trim();
        push(`${m[1].trim()}${unit ? ` ${unit}` : ""}`, (m[3] ?? "").trim(), "");
      } else {
        push("", text, "");
      }
    } else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      push(
        firstText(o, ["value", "number", "metric", "stat", "figure"]),
        firstText(o, ["label", "title", "name", "caption", "unit_label"]),
        firstText(o, ["context", "description", "note", "period", "source"]),
        o.id,
      );
    }
  }
  return out;
}

/**
 * `[{id, quote, author, role, company}]`. The legacy single blob becomes ONE
 * unattributed testimonial — a missing name renders as no name, never as a
 * guessed one, and a blob is never split into quotes it did not declare.
 */
function normalizeTestimonials(raw: unknown): Array<{ id: string; quote: string; author: string; role: string; company: string }> {
  const out: Array<{ id: string; quote: string; author: string; role: string; company: string }> = [];
  const pushObj = (o: Record<string, unknown>) => {
    const quote = firstText(o, ["quote", "text", "body", "testimonial", "content"]);
    if (!quote) return;
    out.push({
      id: asText(o.id) || crypto.randomUUID(),
      quote,
      author: firstText(o, ["author", "name", "by", "person"]),
      role: firstText(o, ["role", "title", "position"]),
      company: firstText(o, ["company", "organization", "org", "company_name"]),
    });
  };
  const pushText = (v: unknown) => {
    const quote = asText(v);
    if (!quote) return;
    out.push({ id: crypto.randomUUID(), quote, author: "", role: "", company: "" });
  };

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string") pushText(item);
      else if (item && typeof item === "object") pushObj(item as Record<string, unknown>);
    }
  } else if (typeof raw === "string") {
    pushText(raw);
  } else if (raw && typeof raw === "object") {
    pushObj(raw as Record<string, unknown>);
  }
  return out;
}

/** `{label, destination, intent}` — or null. A CTA with no label is not a button. */
function normalizePrimaryCta(raw: unknown): { label: string; destination: string; intent: string } | null {
  if (typeof raw === "string") {
    const label = raw.trim();
    return label ? { label, destination: "", intent: "" } : null;
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const label = firstText(o, ["label", "text", "title", "cta", "cta_label"]);
    if (!label) return null;
    return {
      label,
      destination: firstText(o, ["destination", "url", "href", "link", "target", "path"]),
      intent: firstText(o, ["intent", "goal", "action", "description"]),
    };
  }
  return null;
}

/**
 * Fill empty chrome fields from the Business Identity. Returns the dotted keys
 * it set. Existing non-empty values are never touched: the identity is the
 * fallback, the setting is the choice.
 */
async function projectIdentityIntoChrome(sb: any, profile: Record<string, unknown>): Promise<string[]> {
  const name = typeof profile.company_name === "string" ? profile.company_name.trim() : "";
  if (!name) return [];
  const tagline = typeof profile.tagline === "string" ? profile.tagline.trim() : "";
  const description = typeof profile.description === "string" ? profile.description.trim() : "";
  const plan: Array<{ key: string; fills: Record<string, string> }> = [
    { key: "branding", fills: { organizationName: name, ...(tagline ? { brandTagline: tagline } : {}) } },
    { key: "seo", fills: { siteTitle: name, titleTemplate: `%s | ${name}`, ...(description ? { defaultDescription: description.slice(0, 160) } : {}) } },
    { key: "aeo", fills: { organizationName: name, ...(description ? { shortDescription: description.slice(0, 200) } : {}) } },
  ];
  const set: string[] = [];
  for (const { key, fills } of plan) {
    const { data: row, error: readErr } = await sb.from("site_settings").select("value").eq("key", key).maybeSingle();
    if (readErr) { console.warn(`[company-profile] ${key} read failed:`, readErr.message); continue; }
    const current = (row?.value && typeof row.value === "object") ? { ...(row.value as Record<string, unknown>) } : {};
    let changed = false;
    for (const [field, value] of Object.entries(fills)) {
      const existing = current[field];
      if (typeof existing === "string" && existing.trim()) continue;
      current[field] = value; changed = true; set.push(`${key}.${field}`);
    }
    if (!changed) continue;
    const { error: writeErr } = await sb.from("site_settings").upsert({ key, value: current, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (writeErr) console.warn(`[company-profile] ${key} write failed:`, writeErr.message);
  }
  return set;
}
