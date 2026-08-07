/**
 * Ownership lives in ONE map, because it already lives under three names.
 *
 * `leads.assigned_to`, `deals.owner_id`, `companies.account_owner` — same idea,
 * three spellings, all wire identifiers that stay as they are (naming policy:
 * fix the story, not the wire). Every surface that reads or writes ownership
 * goes through this map; the alternative is five hooks that each know one
 * column name and drift apart — the one-of-N-places bug shape this codebase
 * keeps finding.
 *
 * Ownership is a lens and a label, NEVER a security boundary. The "Mina/Alla"
 * filter applies these columns in queries; RLS must never reference them.
 * (Odoo wires "my records" into record rules — that is where salespeople stop
 * seeing each other's pipelines and start calling the same customer twice.)
 */

export const OWNERSHIP = {
  leads: {
    column: 'assigned_to',
    /** Query keys to invalidate after a reassignment. */
    invalidate: ['leads', 'lead'],
  },
  deals: {
    column: 'owner_id',
    invalidate: ['deals', 'deal'],
  },
  companies: {
    column: 'account_owner',
    invalidate: ['companies', 'company'],
  },
} as const;

export type OwnedEntity = keyof typeof OWNERSHIP;

export function ownerColumn(entity: OwnedEntity): string {
  return OWNERSHIP[entity].column;
}
