/**
 * ONE state for an API key, read the same way on every page that lists one
 * (Developer → MCP Keys, /admin/agents, Federation → MCP collaborators) and by
 * the gateway that refuses it.
 *
 * - `revoked`  a person or the platform took it out of service (`revoked_at`).
 *               The row stays as history of who was connected and how much it
 *               called; deleting it is a separate, later act.
 * - `expired`  its `expires_at` has passed and nobody revoked it.
 * - `active`   otherwise.
 *
 * Until 2026-11-05 the pages derived this from `expires_at` alone, so a key a
 * person had revoked and one whose date had merely run out looked the same —
 * and one page kept the row while the other deleted it.
 */
export type KeyState = 'active' | 'revoked' | 'expired';

export interface KeyStateInput {
  revoked_at?: string | null;
  expires_at?: string | null;
}

export function keyState(key: KeyStateInput, now: Date = new Date()): KeyState {
  if (key.revoked_at) return 'revoked';
  if (key.expires_at && new Date(key.expires_at) < now) return 'expired';
  return 'active';
}

/** A key the gateway still accepts. */
export function isKeyActive(key: KeyStateInput, now: Date = new Date()): boolean {
  return keyState(key, now) === 'active';
}
