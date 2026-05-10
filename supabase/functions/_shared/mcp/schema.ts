/**
 * MCP schema utilities — pure functions used by mcp-server and any tooling
 * that needs to expose JSON Schema to OpenAI/litellm-compatible clients.
 *
 * Extracted from supabase/functions/mcp-server/index.ts as part of the
 * separation-of-concerns refactor (phase 3 — MCP-server routing/schema).
 */

/**
 * Flatten a JSON Schema for OpenAI gpt-4.1 tool-calling compatibility.
 *
 * OpenAI (and litellm proxies) reject the entire tools array with HTTP 400
 * if any top-level inputSchema contains `allOf` / `oneOf` / `anyOf` / `not`
 * / `if` / `then` / `else`. We use these constructs in `manage_*` skills to
 * express per-action required fields. This helper merges branches into a
 * single flat schema; per-action `required` arrays are dropped (the skill
 * description documents per-action required fields, and runtime handlers
 * still validate NOT NULL).
 */
export function flattenSchemaForOpenAI(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== "object") {
    return { type: "object", properties: {} };
  }
  const s = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {
    type: "object",
    properties: { ...((s.properties as Record<string, unknown>) || {}) },
  };
  if (Array.isArray(s.required)) {
    out.required = [...(s.required as string[])];
  }
  if (typeof s.description === "string") out.description = s.description;

  const mergeBranchProps = (branch: unknown) => {
    if (!branch || typeof branch !== "object") return;
    const b = branch as Record<string, unknown>;
    if (b.properties && typeof b.properties === "object") {
      const props = out.properties as Record<string, unknown>;
      for (const [k, v] of Object.entries(b.properties as Record<string, unknown>)) {
        if (!(k in props)) props[k] = v;
      }
    }
    for (const key of ["allOf", "oneOf", "anyOf"] as const) {
      if (Array.isArray(b[key])) {
        for (const sub of b[key] as unknown[]) mergeBranchProps(sub);
      }
    }
    if (b.then) mergeBranchProps(b.then);
    if (b.else) mergeBranchProps(b.else);
  };

  for (const key of ["allOf", "oneOf", "anyOf"] as const) {
    if (Array.isArray(s[key])) {
      for (const branch of s[key] as unknown[]) mergeBranchProps(branch);
    }
  }
  if (s.if) {
    if (s.then) mergeBranchProps(s.then);
    if (s.else) mergeBranchProps(s.else);
  }
  return out;
}

/**
 * Detect whether a schema has any top-level construct OpenAI gpt-4.1
 * rejects. Diagnostic-only — flattenSchemaForOpenAI handles the fix.
 */
export function hasUnsafeTopLevelKeyword(schema: unknown): boolean {
  if (!schema || typeof schema !== "object") return false;
  const s = schema as Record<string, unknown>;
  return ["allOf", "oneOf", "anyOf", "not", "if", "then", "else"].some((k) => k in s);
}
