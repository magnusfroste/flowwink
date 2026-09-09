/**
 * Auth diagnostics — a small ring buffer of the auth failures the browser saw.
 *
 * "Sometimes I get errors" (optic, 2026-09-04) is not a bug report anyone can
 * act on, and the auth server's audit log does not say WHY a browser dropped
 * a session. So the client keeps the last few failed token refreshes and
 * expired-JWT responses itself, in localStorage, and the sign-in page shows
 * the most recent one when it is fresh. That turns "it signed me out" into
 * "refresh_token_already_used at 21:53" — a sentence an operator can forward
 * and an engineer can diagnose.
 *
 * Only failure metadata is stored (status, error code, time, URL path) —
 * never a token, never a body beyond the server's own error code.
 */
import { logger } from '@/lib/logger';

export interface AuthDiagnostic {
  at: string; // ISO time
  kind: 'refresh_failed' | 'jwt_rejected';
  status: number;
  code?: string;
  message?: string;
  path?: string;
}

const KEY = 'flowwink.auth-diagnostics';
const MAX = 20;

export function readAuthDiagnostics(): AuthDiagnostic[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as AuthDiagnostic[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordAuthDiagnostic(entry: AuthDiagnostic): void {
  logger.warn('[auth]', entry.kind, entry.status, entry.code ?? '', entry.message ?? '');
  try {
    const next = [...readAuthDiagnostics(), entry].slice(-MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode / quota — the log line above still fires */
  }
}

/** The latest diagnostic if it happened within `withinMs` (default 15 min). */
export function recentAuthDiagnostic(withinMs = 15 * 60_000): AuthDiagnostic | null {
  const all = readAuthDiagnostics();
  const last = all[all.length - 1];
  if (!last) return null;
  return Date.now() - new Date(last.at).getTime() <= withinMs ? last : null;
}

/**
 * Inspect a Supabase response and record it if it is an auth failure. Called
 * from the client's fetch wrapper; reads the body only on the two shapes that
 * matter (a failed token grant, a PostgREST/GoTrue 401), from a clone, so the
 * caller's stream is untouched.
 */
export async function noteAuthResponse(url: string, res: Response): Promise<void> {
  try {
    const path = new URL(url, 'https://x.invalid').pathname;
    const isTokenGrant = path.endsWith('/auth/v1/token');
    if (isTokenGrant && !res.ok) {
      const body = await safeJson(res);
      recordAuthDiagnostic({
        at: new Date().toISOString(),
        kind: 'refresh_failed',
        status: res.status,
        code: body?.error_code ?? body?.error ?? undefined,
        message: body?.msg ?? body?.error_description ?? undefined,
        path,
      });
      return;
    }
    if (res.status === 401 && !isTokenGrant) {
      const body = await safeJson(res);
      // PGRST301 = JWT expired/invalid at PostgREST; GoTrue 401s carry msg.
      recordAuthDiagnostic({
        at: new Date().toISOString(),
        kind: 'jwt_rejected',
        status: 401,
        code: body?.code ?? body?.error_code ?? undefined,
        message: body?.message ?? body?.msg ?? undefined,
        path,
      });
    }
  } catch {
    /* diagnostics must never break a request */
  }
}

async function safeJson(res: Response): Promise<Record<string, string> | null> {
  try {
    return (await res.clone().json()) as Record<string, string>;
  } catch {
    return null;
  }
}

/** Human-readable one-liner for the sign-in page. English: admin UI copy. */
export function describeAuthDiagnostic(d: AuthDiagnostic): string {
  const when = new Date(d.at).toLocaleTimeString();
  const what = d.kind === 'refresh_failed' ? 'Session refresh failed' : 'Session token rejected';
  const detail = [d.code, d.message].filter(Boolean).join(' — ') || `HTTP ${d.status}`;
  return `${what} at ${when}: ${detail}`;
}
