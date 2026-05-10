/**
 * Skill argument normalization shared by agent-execute and any future
 * skill-invoking surface (chat-completion tool calls, MCP server, etc).
 *
 * Responsibilities:
 *  - Unwrap `{action, data: {...}}` → flat `{action, ...data}`
 *  - Map common monetary aliases to canonical *_cents columns
 *  - Derive `vat_cents` from `vat_rate` when missing
 *
 * Top-level fields take precedence over `data` fields when both exist.
 */
export function normalizeSkillArgs(raw: Record<string, unknown>): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  let merged: Record<string, unknown> = { ...raw };
  const inner = (raw as any).data;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    merged = { ...inner, ...merged };
    delete merged.data;
  }

  // Friendly aliases — only set canonical key if not already provided
  const aliasMap: Record<string, string> = {
    amount: 'amount_cents',
    value: 'value_cents',
    price: 'price_cents',
    budget: 'budget_cents',
    total: 'total_cents',
  };
  for (const [from, to] of Object.entries(aliasMap)) {
    if (merged[from] !== undefined && merged[to] === undefined) {
      const v = merged[from];
      // If looks like whole units (small int), upscale to cents
      merged[to] = typeof v === 'number' && Number.isInteger(v) && v < 1_000_000 ? v * 100 : v;
      delete merged[from];
    }
  }

  // vat_rate (percent) → vat_cents derived from amount_cents
  if (merged.vat_rate !== undefined && merged.vat_cents === undefined && typeof merged.amount_cents === 'number') {
    const rate = Number(merged.vat_rate);
    if (!Number.isNaN(rate)) {
      merged.vat_cents = Math.round((merged.amount_cents as number) * (rate / 100));
    }
    delete merged.vat_rate;
  }

  return merged;
}
