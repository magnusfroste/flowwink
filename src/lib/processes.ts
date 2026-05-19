/**
 * Business Processes — FlowWink Coverage Map
 *
 * Single source of truth for the cross-module business processes the platform
 * supports. Each module declares which processes it participates in via
 * `defineModule({ processes: [...], maturity: 'L3' })`.
 *
 * @see docs/processes/README.md — process narratives + sales framing
 * @see src/lib/__tests__/process-coverage.guardrails.test.ts — invariant tests
 */

export const PROCESS_IDS = [
  'lead-to-customer',
  'quote-to-cash',
  'procure-to-pay',
  'order-to-delivery',
  'hire-to-retire',
  'content-to-conversion',
  'record-to-report',
  'support-to-resolution',
] as const;

export type ProcessId = typeof PROCESS_IDS[number];

export const PROCESS_LABELS: Record<ProcessId, string> = {
  'lead-to-customer': 'Lead-to-Customer',
  'quote-to-cash': 'Quote-to-Cash',
  'procure-to-pay': 'Procure-to-Pay',
  'order-to-delivery': 'Order-to-Delivery',
  'hire-to-retire': 'Hire-to-Retire',
  'content-to-conversion': 'Content-to-Conversion',
  'record-to-report': 'Record-to-Report',
  'support-to-resolution': 'Support-to-Resolution',
};

/**
 * Maturity scale — see docs/processes/README.md.
 *
 *  L1  Stub          — data model only
 *  L2  Manual        — admin can CRUD; no automation
 *  L3  Operational   — happy path works end-to-end
 *  L4  Agent-augmented — an agent can run parts autonomously
 *  L5  Production-grade — edge cases, approvals, audit trail
 */
export const MATURITY_LEVELS = ['L1', 'L2', 'L3', 'L4', 'L5'] as const;
export type MaturityLevel = typeof MATURITY_LEVELS[number];

export const MATURITY_LABELS: Record<MaturityLevel, string> = {
  L1: 'Stub',
  L2: 'Manual',
  L3: 'Operational',
  L4: 'Agent-augmented',
  L5: 'Production-grade',
};

export function isProcessId(value: string): value is ProcessId {
  return (PROCESS_IDS as readonly string[]).includes(value);
}

export function isMaturityLevel(value: string): value is MaturityLevel {
  return (MATURITY_LEVELS as readonly string[]).includes(value);
}
