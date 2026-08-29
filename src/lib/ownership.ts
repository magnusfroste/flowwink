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
  quotes: {
    column: 'owner_id',
    invalidate: ['quotes', 'quote'],
  },
  projects: {
    column: 'owner_id',
    invalidate: ['projects', 'project'],
  },
} as const;

export type OwnedEntity = keyof typeof OWNERSHIP;

export function ownerColumn(entity: OwnedEntity): string {
  return OWNERSHIP[entity].column;
}

/**
 * The Mina/Alla lens, applied where it belongs: in the query result, never in
 * a policy. "Mine" means the owner column equals my uid — an unassigned record
 * is nobody's and disappears under the lens, which is honest: if it should be
 * yours, assign it (one chip click).
 *
 * Client-side today because no CRM list paginates yet; when one does, the same
 * map drives an `.eq(column, uid)` server-side instead. The lens NEVER touches
 * aggregates — a KPI that silently shows "mine" while claiming to show the
 * pipeline is how two people report different revenue.
 */
export type OwnershipLens = 'all' | 'mine';

// T is unconstrained on purpose: concrete row interfaces (Company, Deal, Lead,
// Quote) have no index signature, so `T extends Record<string, unknown>`
// rejected them — and Vite's build never caught it because only
// `tsc -p tsconfig.app.json` typechecks. The owner column is read through a
// narrow cast at the one access site instead.
export function applyLens<T>(
  rows: T[] | undefined,
  entity: OwnedEntity,
  lens: OwnershipLens,
  uid: string | null | undefined,
  /**
   * Owners I currently cover (active ownership_delegations). Under "mine",
   * their records count as mine for the duration — Anna's lens grows Björn's
   * pipeline for two vacation weeks and shrinks back on its own. Nothing is
   * reassigned, so nothing can be forgotten.
   */
  covered?: ReadonlyArray<string>,
): T[] {
  if (!rows) return [];
  if (lens !== 'mine' || !uid) return rows;
  const col = OWNERSHIP[entity].column;
  const mine = new Set<string>([uid, ...(covered ?? [])]);
  // Narrow cast at the one access site — T stays unconstrained per the note
  // above (local's fix: concrete row interfaces have no index signature).
  return rows.filter((r) => {
    const v = (r as Record<string, unknown>)[col];
    return typeof v === 'string' && mine.has(v);
  });
}
