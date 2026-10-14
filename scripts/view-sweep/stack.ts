/**
 * The local stack a browser test runs against — shared by the view sweep and
 * the public-blocks test so both find the same credentials, pick ports the
 * same way and start Vite without `npm run dev`'s migration pre-step.
 */
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import type { StackConfig } from './fixtures';

const REPO_ROOT = resolve(import.meta.dirname, '../..');
const DEFAULT_SUPABASE_URL = 'http://127.0.0.1:54321';

export function readStackConfig(): StackConfig {
  let supabaseUrl = process.env.VIEW_SWEEP_SUPABASE_URL ?? '';
  let anonKey = process.env.VIEW_SWEEP_ANON_KEY ?? '';
  let serviceRoleKey = process.env.VIEW_SWEEP_SERVICE_ROLE_KEY ?? '';
  if (!anonKey || !serviceRoleKey) {
    const bin = process.env.SUPABASE_BIN ?? 'supabase';
    const cwd = process.env.SUPABASE_WORKDIR ?? REPO_ROOT;
    let out: string;
    try {
      out = execFileSync(bin, ['status', '-o', 'env'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (e) {
      throw new Error(
        `view-sweep: no stack credentials. Set VIEW_SWEEP_ANON_KEY and VIEW_SWEEP_SERVICE_ROLE_KEY, or make \`${bin} status -o env\` work in ${cwd} ` +
          `(SUPABASE_BIN / SUPABASE_WORKDIR). Underlying: ${(e as Error).message.split('\n')[0]}`,
      );
    }
    const env: Record<string, string> = {};
    for (const line of out.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
      if (m) env[m[1]] = m[2];
    }
    supabaseUrl ||= env.API_URL ?? '';
    anonKey ||= env.ANON_KEY ?? env.PUBLISHABLE_KEY ?? '';
    serviceRoleKey ||= env.SERVICE_ROLE_KEY ?? env.SECRET_KEY ?? '';
  }
  supabaseUrl ||= DEFAULT_SUPABASE_URL;
  if (!anonKey || !serviceRoleKey) throw new Error('view-sweep: stack credentials incomplete (anon key / service role key missing)');
  return { supabaseUrl: supabaseUrl.replace(/\/$/, ''), anonKey, serviceRoleKey };
}

export async function freePort(preferred: number): Promise<number> {
  for (let port = preferred; port < preferred + 30; port++) {
    const ok = await new Promise<boolean>((res) => {
      const srv = createServer();
      srv.once('error', () => res(false));
      srv.listen(port, '127.0.0.1', () => srv.close(() => res(true)));
    });
    if (ok) return port;
  }
  throw new Error(`view-sweep: no free port in ${preferred}–${preferred + 29}`);
}

export async function startVite(cfg: StackConfig, port: number): Promise<{ proc: ChildProcess; baseUrl: string }> {
  // vite directly — `npm run dev` carries a migration pre-step the sweep must not run.
  const proc = spawn(join(REPO_ROOT, 'node_modules/.bin/vite'), ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: REPO_ROOT,
    env: { ...process.env, VITE_SUPABASE_URL: cfg.supabaseUrl, VITE_SUPABASE_PUBLISHABLE_KEY: cfg.anonKey, VITE_SUPABASE_PROJECT_ID: 'local' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  proc.stdout?.on('data', (d: Buffer) => (log += d.toString()));
  proc.stderr?.on('data', (d: Buffer) => (log += d.toString()));
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) throw new Error(`view-sweep: vite exited early (${proc.exitCode}):\n${log.slice(-800)}`);
    try {
      const res = await fetch(baseUrl, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return { proc, baseUrl };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  proc.kill('SIGTERM');
  throw new Error(`view-sweep: vite did not answer on ${baseUrl} within 60 s:\n${log.slice(-800)}`);
}
