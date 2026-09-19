/**
 * Throwaway sign-ins for the sweep — LOCAL database only.
 *
 * Users are created through the local GoTrue admin API with a password that is
 * generated in-process, held in memory for the length of the run, and never
 * written or printed. Roles are set on `user_roles`, the table useAuth reads
 * and UsersPage writes. The browser is signed in by handing supabase-js the
 * session it would have stored itself (localStorage `sb-<host>-auth-token`),
 * not by typing into the login form — the sweep tests pages, not the form.
 */
import { randomBytes } from 'node:crypto';
import { createClient, type Session } from '@supabase/supabase-js';
import type { Client } from 'pg';

export interface StackConfig {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
}

export interface FixtureUser {
  id: string;
  email: string;
  roles: string[];
  session: Session;
}

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

/** The sweep creates users and signs in. It does that to a local stack or not at all. */
export function assertLocal(url: string, what: string): void {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`view-sweep: ${what} is not a URL`);
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `view-sweep REFUSES to run: ${what} points at "${host}". ` +
        'This tool creates users and signs in as admin; it only ever runs against 127.0.0.1/localhost.',
    );
  }
}

/** Same derivation supabase-js uses for its default storage key. */
export function storageKeyFor(supabaseUrl: string): string {
  return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
}

async function gotrueAdmin(cfg: StackConfig, method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${cfg.supabaseUrl}/auth/v1/admin${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: cfg.serviceRoleKey,
      Authorization: `Bearer ${cfg.serviceRoleKey}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function createFixtureUser(
  cfg: StackConfig,
  db: Client,
  runId: string,
  label: string,
  roles: string[],
): Promise<FixtureUser> {
  const email = `view-sweep+${label}-${runId}@example.test`;
  const password = randomBytes(24).toString('base64url');
  // signup_type steers handle_new_user(); the role rows are normalised below
  // regardless, because on a virgin instance the FIRST signup claims admin
  // whatever it asked for.
  const signupType = roles.includes('admin') ? 'admin' : roles.includes('customer') ? 'customer' : 'employee';

  const res = await gotrueAdmin(cfg, 'POST', '/users', {
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `View Sweep ${label}`, signup_type: signupType },
  });
  if (!res.ok) {
    throw new Error(`view-sweep: could not create ${label} fixture user (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const id = ((await res.json()) as { id: string }).id;

  // Exactly the roles asked for — nothing the trigger added on its own.
  await db.query('delete from public.user_roles where user_id = $1 and role::text <> all($2::text[])', [id, roles]);
  for (const role of roles) {
    await db.query(
      'insert into public.user_roles (user_id, role) values ($1, $2::public.app_role) on conflict (user_id, role) do nothing',
      [id, role],
    );
  }

  const client = createClient(cfg.supabaseUrl, cfg.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`view-sweep: could not sign in ${label} fixture user: ${error?.message ?? 'no session'}`);
  }
  return { id, email, roles, session: data.session };
}

export async function deleteFixtureUser(cfg: StackConfig, user: FixtureUser): Promise<string | null> {
  const res = await gotrueAdmin(cfg, 'DELETE', `/users/${user.id}`);
  if (res.ok) return null;
  return `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`;
}

/** The most restricted staff role the platform seeds: fewest default module grants. */
export async function pickMostRestrictedRole(db: Client): Promise<{ role: string; grants: number } | null> {
  const res = await db.query(
    `select role::text as role, count(*)::int as grants
       from public.role_module_access_defaults
      group by role order by count(*) asc, role::text asc limit 1`,
  );
  return (res.rows[0] as { role: string; grants: number } | undefined) ?? null;
}

/** role → granted module ids, from the LIVE matrix (what the app reads). */
export async function loadAccessMap(db: Client): Promise<Record<string, Set<string>>> {
  const res = await db.query('select role::text as role, module_id from public.role_module_access');
  const map: Record<string, Set<string>> = {};
  for (const row of res.rows as Array<{ role: string; module_id: string }>) {
    (map[row.role] ??= new Set()).add(row.module_id);
  }
  return map;
}
