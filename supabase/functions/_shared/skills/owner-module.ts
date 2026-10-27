/**
 * Which module AUTHORIZES a skill for a non-admin — one answer for every
 * surface that offers or runs skills: agent-execute's gate, the MCP gateway's
 * owner ceiling (ownerMayRun / filterByOwner) and workspace-chat's dispatch.
 *
 * The generated map (skill-modules.ts) says where a skill is SEEDED. Two
 * classes of skill are authorized by another module than the one they live in:
 *
 *  1. The effect, not the code. Skills that mint a real customer invoice
 *     (number from the series, rows in the ledger) live in whichever process
 *     module triggers them — `sales`, holding `ecommerce`, could issue a live
 *     invoice through send_invoice_for_order without ever being granted
 *     `invoicing` (matrix sweep 2, 2026-08-20). Until 2026-10-27 this table
 *     lived in agent-execute alone, and the gateway read the seeded map: an
 *     owned agent whose owner held `contracts` could generate_contract_invoice
 *     over MCP — the executor runs gateway calls as the service role and never
 *     re-asks. One table, every consumer.
 *
 *  2. The read that belongs to the write. describe_blocks and
 *     inspect_rendered_page are platform seeds (always present), which made
 *     them admin-only for an owned agent — so a colleague's Claude, held to
 *     `pages` through its owner, could write a page but never read the block
 *     contract first or look at the result (optic, 2026-10-27: that is the
 *     designed workflow, and it went blind the moment the owner stopped being
 *     an admin). Whoever may edit pages may read what a page is made of.
 *
 * Access to the SOURCE object still needs its own module through RLS: an
 * override ADDS a requirement, it never replaces one. The override lives here
 * and not in the module seed on purpose: `moduleId` in src/lib/modules/* also
 * drives navigation, cataloguing and sync:skills, and the skill does belong to
 * its process module. Authorization follows the effect; cataloguing does not.
 */
import { SKILL_OWNER_MODULE } from './skill-modules.ts';

export const SKILL_OWNER_MODULE_OVERRIDES: Readonly<Record<string, string>> = Object.freeze({
  send_invoice_for_order: 'invoicing',        // seeded in ecommerce (products-module)
  service_order_to_invoice: 'invoicing',      // seeded in fieldService
  generate_contract_invoice: 'invoicing',     // seeded in contracts
  pos_sale_to_invoice: 'invoicing',           // seeded in pos
  generate_subscription_invoice: 'invoicing', // seeded in subscriptions
  describe_blocks: 'pages',                   // platform seed; the block contract a page writer reads first
  inspect_rendered_page: 'pages',             // platform seed; what the page writer looks at afterwards
});

/** Owning module id for authorization, or null when unmapped (⇒ admin-only). */
export function ownerModuleOf(skillName: string): string | null {
  return SKILL_OWNER_MODULE_OVERRIDES[skillName] ?? SKILL_OWNER_MODULE[skillName] ?? null;
}
