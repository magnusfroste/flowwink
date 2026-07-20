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

      // Defensive normalization: services MUST be [{id, name, description}].
      // Agents often guess (strings, {description} only, etc.) — coerce or drop
      // so the UI never renders empty placeholder cards.
      const normalized = normalizeServicesField(incomingData as Record<string, unknown>);

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

      return json({
        success: true,
        company_profile: data.value,
        updated_at: data.updated_at,
        message: "Company profile updated",
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
 * Coerce common malformed shapes for `services` into the canonical
 * [{id, name, description}] form expected by the UI.
 *
 * Accepted inputs:
 *   - "Foo"                          → {id, name: "Foo", description: ""}
 *   - {name, description}            → {id, name, description}
 *   - {service, desc}                → {id, name: service, description: desc}
 *   - {title, summary}               → {id, name: title, description: summary}
 *   - {description: "..."} (no name) → DROPPED (would render as empty card)
 *   - Record<string, string>         → [{name, description}, ...] (legacy object form)
 */
function normalizeServicesField(data: Record<string, unknown>): Record<string, unknown> {
  if (!("services" in data)) return data;
  const raw = data.services;
  const out: Array<{ id: string; name: string; description: string }> = [];

  const pushItem = (name: unknown, description: unknown, id?: unknown) => {
    const n = typeof name === "string" ? name.trim() : "";
    if (!n) return; // drop nameless entries — they become empty placeholders in the UI
    out.push({
      id: typeof id === "string" && id ? id : crypto.randomUUID(),
      name: n,
      description: typeof description === "string" ? description.trim() : "",
    });
  };

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string") {
        pushItem(item, "");
      } else if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        const name = o.name ?? o.service ?? o.title ?? o.label;
        const description = o.description ?? o.desc ?? o.summary ?? o.details ?? "";
        pushItem(name, description, o.id);
      }
    }
  } else if (raw && typeof raw === "object") {
    // Legacy object form: { "Service A": "desc A", "Service B": "desc B" }
    for (const [name, description] of Object.entries(raw as Record<string, unknown>)) {
      pushItem(name, description);
    }
  }

  return { ...data, services: out };
}
