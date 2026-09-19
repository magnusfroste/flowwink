/**
 * One route, one visit: load it in a signed-in (or anonymous) browser context
 * and write down everything that went wrong while it rendered.
 */
import type { BrowserContext, ConsoleMessage, Page, Response as PwResponse } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export type FindingKind =
  | 'navigation-failure'
  | 'page-error'
  | 'console-error'
  | 'react-dev-warning'
  | 'api-error'
  | 'asset-error'
  | 'request-failed'
  | 'stack-unavailable'
  | 'access-flash'
  | 'access-ungated'
  | 'not-found'
  | 'error-page'
  | 'blank-main'
  | 'stuck-loading'
  | 'access-denied-unexpected'
  | 'access-granted-unexpected'
  | 'login-redirect-unexpected';

export interface Finding {
  kind: FindingKind;
  severity: 'error' | 'warn';
  /** Stable text used to group the same problem across routes. */
  signature: string;
  message: string;
  detail?: Record<string, unknown>;
}

export type Outcome = 'served' | 'denied' | 'login-redirect' | 'navigation-failed';

export interface RouteResult {
  role: string;
  pattern: string;
  url: string;
  source: string;
  finalPath: string | null;
  redirected: boolean;
  declaredRedirect: string | null;
  outcome: Outcome;
  expectedServed: boolean | null;
  durationMs: number;
  attempts: number;
  mainTextLength: number | null;
  findings: Finding[];
  screenshot: string | null;
}

export interface VisitInput {
  role: string;
  pattern: string;
  path: string;
  source: string;
  declaredRedirect: string | null;
  /** Staff role: what the role matrix says about a final pathname. null = no expectation. */
  expectServed: ((finalPath: string) => boolean) | null;
}

export interface VisitEnv {
  baseUrl: string;
  supabaseUrl: string;
  outDir: string;
  routeTimeoutMs: number;
}

/**
 * Console/network noise that is dropped, NOT reported. Printed verbatim in the
 * report so a reader can see what the sweep chose not to look at.
 */
export const NOISE_FILTERS: Array<{ id: string; where: 'console' | 'network'; pattern: RegExp; why: string }> = [
  {
    id: 'console-failed-to-load-resource',
    where: 'console',
    pattern: /Failed to load resource: (the server responded with a status of|net::)/,
    why: 'Chrome\'s own echo of an HTTP failure. The response listener already records every ≥400 from Supabase and from the app origin with method, path and PostgREST body — this line adds no information and would double-count.',
  },
  {
    id: 'console-vite',
    where: 'console',
    pattern: /^\[vite\]|\[hmr\]|WebSocket connection to 'ws:\/\/(127\.0\.0\.1|localhost):\d+\/.*' failed/i,
    why: 'Vite dev-server / HMR chatter. Does not exist in a production build.',
  },
  {
    id: 'console-react-devtools',
    where: 'console',
    pattern: /Download the React DevTools/,
    why: 'React dev-mode advertisement.',
  },
  {
    id: 'network-aborted',
    where: 'network',
    pattern: /net::ERR_ABORTED/,
    why: 'Requests the browser cancelled itself: a redirect or the end of the visit cuts in-flight fetches. Not a server failure.',
  },
  {
    id: 'network-third-party',
    where: 'network',
    pattern: /^third-party-origin$/,
    why: 'Responses from origins other than the app and the local Supabase API (fonts, stock images, analytics). The sweep runs offline-tolerant; third-party availability is not a FlowWink finding.',
  },
];

/** Dev-server artefacts that warrant ONE retry of the route instead of a finding. */
const DEV_RETRY_SIGNATURES = [
  /Outdated Optimize Dep/i,
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /optimized dependencies changed/i,
];

/**
 * The local gateway (Kong) answering FOR a service that is not there: the edge
 * runtime restarting, PostgREST reloading, the machine saturated. That is the
 * state of the stack, not of the page — the route is retried once, and what is
 * left is reported as a warning under its own kind so it cannot hide a page bug.
 * A 5xx the SERVICE produced (500, 546 worker limit, any PostgREST error) is
 * never matched here.
 */
const GATEWAY_UNAVAILABLE = /name resolution failed|invalid response was received from the upstream server|no Route matched|upstream server is timing out|failure to get a peer from the ring-balancer/i;
const NETWORK_FLAKE = /net::ERR_(NETWORK_CHANGED|CONNECTION_RESET|CONNECTION_REFUSED|EMPTY_RESPONSE|SOCKET_NOT_CONNECTED)/;

const SECRET_PARAM = /(token|apikey|api_key|key|secret|password|email|code)/i;

export function redactUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw.slice(0, 200);
  }
  const parts: string[] = [];
  for (const [k, v] of u.searchParams) {
    const value = SECRET_PARAM.test(k) || /^eyJ[A-Za-z0-9_-]{10,}/.test(v) ? '<redacted>' : v;
    parts.push(`${k}=${value}`);
  }
  const query = parts.length ? `?${parts.join('&')}` : '';
  return `${u.pathname}${query}`.slice(0, 400);
}

function redactText(s: string): string {
  return s
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '<jwt>')
    .replace(/sb_(publishable|secret)_[A-Za-z0-9_-]+/g, '<key>');
}

/** Strip the parts of a message that vary per route so identical problems group. */
function normalise(s: string): string {
  return redactText(s)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/https?:\/\/(127\.0\.0\.1|localhost):\d+/g, '<origin>')
    .replace(/\?t=\d+|\?v=[0-9a-f]+/g, '')
    .replace(/:\d+:\d+/g, ':<l>:<c>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

function slugify(s: string): string {
  return s.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'root';
}

async function consoleText(msg: ConsoleMessage): Promise<string> {
  // msg.text() flattens objects to "JSHandle@object"; pull real values so a
  // logged PostgREST error shows its code and message.
  const parts: string[] = [];
  for (const arg of msg.args()) {
    try {
      const v = await arg.evaluate((x: unknown) => {
        if (x instanceof Error) return `${x.name}: ${x.message}`;
        if (typeof x === 'object' && x !== null) {
          try {
            return JSON.stringify(x, (_k, val: unknown) => (val instanceof Error ? `${val.name}: ${val.message}` : val)).slice(0, 600);
          } catch {
            return String(x);
          }
        }
        return String(x);
      });
      parts.push(v);
    } catch {
      return msg.text();
    }
  }
  return parts.length ? parts.join(' ') : msg.text();
}

interface Probe {
  finalPath: string;
  bodyText: string;
  mainTextLength: number;
  hasMain: boolean;
  spinner: boolean;
  richContent: boolean;
}

async function probe(page: Page): Promise<Probe> {
  return page.evaluate(() => {
    const main = document.querySelector('main') ?? document.querySelector('#root') ?? document.body;
    const text = ((main as HTMLElement).innerText ?? '').trim();
    const spinnerEl = document.querySelector('.animate-spin');
    const visible = (el: Element | null) => !!el && (el as HTMLElement).getClientRects().length > 0;
    return {
      finalPath: location.pathname,
      bodyText: (document.body.innerText ?? '').slice(0, 4000),
      mainTextLength: text.length,
      hasMain: !!document.querySelector('main'),
      // A bare "Loading…" line is a spinner spelled out.
      spinner: visible(spinnerEl) || (text.length < 40 && /^(loading|laddar)\b/i.test(text)),
      // A page can be legitimately wordless: a canvas, a video room, an editor.
      richContent: !!main.querySelector('canvas, video, iframe, img, svg[role="img"], input, textarea, [contenteditable="true"]'),
    };
  });
}

async function visitOnce(context: BrowserContext, input: VisitInput, env: VisitEnv): Promise<Omit<RouteResult, 'attempts'> & { devNoise: boolean; retryWorthy: boolean }> {
  const started = Date.now();
  const url = `${env.baseUrl}${input.path}`;
  const findings: Finding[] = [];
  const pending: Array<Promise<void>> = [];
  let devNoise = false;
  let stackFlake = false;
  const page = await context.newPage();
  const appOrigin = new URL(env.baseUrl).origin;
  const apiOrigin = new URL(env.supabaseUrl).origin;

  const noteDevNoise = (text: string) => {
    if (DEV_RETRY_SIGNATURES.some((re) => re.test(text))) devNoise = true;
  };

  page.on('pageerror', (err) => {
    noteDevNoise(err.message);
    findings.push({
      kind: 'page-error',
      severity: 'error',
      signature: `pageerror: ${normalise(err.message)}`,
      message: redactText(err.message).slice(0, 600),
      detail: { stack: redactText(err.stack ?? '').split('\n').slice(0, 8) },
    });
  });

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    pending.push(
      (async () => {
        const text = redactText(await consoleText(msg));
        noteDevNoise(text);
        if (NOISE_FILTERS.some((f) => f.where === 'console' && f.pattern.test(text))) return;
        const isReactWarning = /^Warning: /.test(text) || /^%s/.test(msg.text()) && /Warning:/.test(msg.text());
        findings.push({
          kind: isReactWarning ? 'react-dev-warning' : 'console-error',
          severity: isReactWarning ? 'warn' : 'error',
          signature: `console: ${normalise(text)}`,
          message: text.slice(0, 800),
          detail: { location: msg.location().url ? `${redactUrl(msg.location().url)}:${msg.location().lineNumber}` : undefined },
        });
      })(),
    );
  });

  page.on('response', (res: PwResponse) => {
    const status = res.status();
    if (status < 400) return;
    const resUrl = res.url();
    let origin: string;
    try {
      origin = new URL(resUrl).origin;
    } catch {
      return;
    }
    const isApi = origin === apiOrigin;
    if (!isApi && origin !== appOrigin) return; // network-third-party
    pending.push(
      (async () => {
        let body = '';
        try {
          body = (await res.text()).slice(0, 1200);
        } catch {
          /* navigated away before the body arrived */
        }
        noteDevNoise(body);
        let pg: { code?: string; message?: string; details?: string; hint?: string } = {};
        try {
          const j = JSON.parse(body) as Record<string, unknown>;
          pg = {
            code: typeof j.code === 'string' ? j.code : typeof j.error_code === 'string' ? j.error_code : undefined,
            message: redactText(String(j.message ?? j.error ?? j.msg ?? '')).slice(0, 400) || undefined,
            details: j.details ? redactText(String(j.details)).slice(0, 300) : undefined,
            hint: j.hint ? redactText(String(j.hint)).slice(0, 300) : undefined,
          };
        } catch {
          if (body) pg = { message: redactText(body).slice(0, 300) };
        }
        const method = res.request().method();
        const pathOnly = new URL(resUrl).pathname;
        if (isApi && [502, 503, 504].includes(status) && (GATEWAY_UNAVAILABLE.test(body) || body === '')) {
          stackFlake = true;
          findings.push({
            kind: 'stack-unavailable',
            severity: 'warn',
            signature: `stack: gateway ${status} for ${pathOnly.split('/').slice(0, 4).join('/')}`,
            message: `${method} ${redactUrl(resUrl)} → ${status} (${pg.message ?? 'no body'})`,
            detail: { method, path: redactUrl(resUrl), status, ...pg },
          });
          return;
        }
        // The edge runtime killing a worker (CPU/memory/boot) is worth one more
        // try; if the function dies again it stays an error.
        if (isApi && (pg.code === 'WORKER_ERROR' || pg.code === 'WORKER_LIMIT' || pg.code === 'BOOT_ERROR')) stackFlake = true;
        findings.push({
          kind: isApi ? 'api-error' : 'asset-error',
          severity: 'error',
          signature: `${isApi ? 'api' : 'asset'}: ${method} ${pathOnly} → ${status}${pg.code ? ` ${pg.code}` : ''}${pg.message ? ` ${normalise(pg.message)}` : ''}`,
          message: `${method} ${redactUrl(resUrl)} → ${status}`,
          detail: { method, path: redactUrl(resUrl), status, ...pg },
        });
      })(),
    );
  });

  page.on('requestfailed', (req) => {
    const failure = req.failure()?.errorText ?? 'unknown';
    if (NOISE_FILTERS.some((f) => f.where === 'network' && f.pattern.test(failure))) return;
    let origin: string;
    try {
      origin = new URL(req.url()).origin;
    } catch {
      return;
    }
    if (origin !== apiOrigin && origin !== appOrigin) return;
    const flake = NETWORK_FLAKE.test(failure);
    if (flake) stackFlake = true;
    findings.push({
      kind: flake ? 'stack-unavailable' : 'request-failed',
      severity: flake ? 'warn' : 'error',
      signature: `request-failed: ${req.method()} ${new URL(req.url()).pathname} ${failure}`,
      message: `${req.method()} ${redactUrl(req.url())} — ${failure}`,
      detail: { method: req.method(), path: redactUrl(req.url()), failure },
    });
  });

  let outcome: Outcome = 'served';
  let finalPath: string | null = null;
  let mainTextLength: number | null = null;
  let screenshot: string | null = null;

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: env.routeTimeoutMs });
    const remaining = () => Math.max(500, env.routeTimeoutMs - (Date.now() - started));
    await page.waitForLoadState('networkidle', { timeout: Math.min(8000, remaining()) }).catch(() => undefined);
    // Settled = no visible spinner AND something to read, twice in a row. The
    // dev server compiles a lazy page on first request, so "network idle" alone
    // regularly fires while the Suspense fallback is still on screen.
    let calm = 0;
    while (remaining() > 500 && calm < 2) {
      const s = await probe(page);
      calm = !s.spinner && (s.mainTextLength >= 15 || s.richContent) ? calm + 1 : 0;
      if (calm < 2) await page.waitForTimeout(300);
    }
    // Queries that started late (a tab's own fetch) get to answer before the visit closes.
    await page.waitForLoadState('networkidle', { timeout: Math.min(5000, remaining()) }).catch(() => undefined);

    let p = await probe(page);
    // A deny can land AFTER the page has painted (the gate waits on a query).
    // Give it a moment, and keep the fact that content was on screen first.
    let flashed = false;
    if (input.expectServed && !/Access Denied/.test(p.bodyText) && !input.expectServed(p.finalPath)) {
      const before = p;
      try {
        await page.waitForFunction(() => /Access Denied/.test(document.body.innerText ?? ''), undefined, { timeout: 10_000 });
        p = await probe(page);
        flashed = before.mainTextLength >= 40 && !before.spinner;
        if (flashed) {
          findings.push({
            kind: 'access-flash',
            severity: 'warn',
            signature: 'access: a denied page rendered its content before the deny landed',
            message: `${before.mainTextLength} chars of page content were on screen for ${input.role} before "Access Denied" replaced them`,
          });
        }
      } catch {
        /* no deny arrived — judged below as served */
      }
    }
    finalPath = p.finalPath;
    mainTextLength = p.mainTextLength;

    if (p.finalPath === '/auth' || p.finalPath === '/account/login') outcome = 'login-redirect';
    else if (/Access Denied/.test(p.bodyText)) outcome = 'denied';

    const requestedPath = input.path.split('?')[0];
    const isLoginRoute = requestedPath === '/auth' || requestedPath === '/account/login';

    if (outcome === 'login-redirect' && !isLoginRoute && input.role !== 'anonymous') {
      findings.push({
        kind: 'login-redirect-unexpected',
        severity: 'error',
        signature: 'access: signed-in role bounced to login',
        message: `Signed in as ${input.role} but ended on ${p.finalPath}`,
      });
    }

    if (input.expectServed && outcome !== 'login-redirect') {
      const expected = input.expectServed(p.finalPath);
      if (expected && outcome === 'denied') {
        findings.push({
          kind: 'access-denied-unexpected',
          severity: 'error',
          signature: 'access: role matrix grants the page, the page denies it',
          message: `Role matrix allows ${p.finalPath} for ${input.role}, but the page rendered "Access Denied"`,
        });
      } else if (!expected && outcome === 'served') {
        findings.push({
          kind: 'access-granted-unexpected',
          severity: 'error',
          signature: 'access: role matrix denies the page, the page is served',
          message: `Role matrix denies ${p.finalPath} for ${input.role}, but the page rendered`,
        });
      }
    }

    if (outcome === 'served') {
      if (/Something went wrong/.test(p.bodyText) && /Error \d{3}/.test(p.bodyText)) {
        findings.push({
          kind: 'error-page',
          severity: 'error',
          signature: 'render: route error element shown',
          message: 'The router errorElement ("Something went wrong") rendered instead of the page',
        });
      } else if (/Page not found/.test(p.bodyText) && /Error 404/.test(p.bodyText)) {
        findings.push({
          kind: 'not-found',
          severity: 'error',
          signature: 'render: 404 page for a declared route',
          message: `A route from the route table rendered the 404 body (final path ${p.finalPath})`,
        });
      } else if (p.spinner && p.mainTextLength < 40) {
        findings.push({
          kind: 'stuck-loading',
          severity: 'error',
          signature: 'render: spinner never resolved',
          message: `Still showing a spinner / "Loading…" with ${p.mainTextLength} chars of text after settle`,
        });
      } else if (p.mainTextLength < 15 && !p.richContent) {
        findings.push({
          kind: 'blank-main',
          severity: 'error',
          signature: 'render: blank main region',
          message: `${p.hasMain ? '<main>' : '#root'} holds ${p.mainTextLength} chars of text after network idle`,
        });
      }
    }
  } catch (e) {
    outcome = 'navigation-failed';
    const message = (e as Error).message.split('\n')[0];
    noteDevNoise(message);
    findings.push({
      kind: 'navigation-failure',
      severity: 'error',
      signature: `navigation: ${normalise(message)}`,
      message,
    });
  }

  await Promise.race([Promise.allSettled(pending), new Promise((r) => setTimeout(r, 3000))]);

  // A correctly denied page still mounted AdminLayout's hooks; whatever they
  // tripped over is not what a permitted user would see.
  if (outcome === 'denied' && !findings.some((f) => f.kind === 'access-denied-unexpected')) {
    for (const f of findings) if (f.kind === 'api-error' || f.kind === 'console-error') f.severity = 'warn';
  }

  if (findings.some((f) => f.severity === 'error')) {
    try {
      const dir = join(env.outDir, 'screenshots', slugify(input.role));
      mkdirSync(dir, { recursive: true });
      screenshot = join(dir, `${slugify(input.path)}.png`);
      await page.screenshot({ path: screenshot, fullPage: false });
    } catch {
      screenshot = null;
    }
  }
  await page.close().catch(() => undefined);

  return {
    role: input.role,
    pattern: input.pattern,
    url: input.path,
    source: input.source,
    finalPath,
    redirected: finalPath !== null && finalPath !== input.path.split('?')[0],
    declaredRedirect: input.declaredRedirect,
    outcome,
    expectedServed: input.expectServed && finalPath ? input.expectServed(finalPath) : null,
    durationMs: Date.now() - started,
    mainTextLength,
    findings,
    screenshot,
    devNoise,
    retryWorthy:
      stackFlake || findings.some((f) => f.kind === 'stuck-loading' || f.kind === 'navigation-failure'),
  };
}

export async function visitRoute(context: BrowserContext, input: VisitInput, env: VisitEnv): Promise<RouteResult> {
  let result = await visitOnce(context, input, env);
  let attempts = 1;
  if (result.devNoise || result.retryWorthy) {
    // One retry, for states that belong to the environment and not the page:
    // Vite re-optimising deps mid-load, a first-request compile that outran the
    // budget (the second request is served from Vite's cache), or the local
    // gateway answering for a service that was restarting. Whatever survives
    // the retry is reported.
    await new Promise((r) => setTimeout(r, 2000));
    result = await visitOnce(context, input, env);
    attempts = 2;
  }
  const { devNoise: _devNoise, retryWorthy: _retryWorthy, ...rest } = result;
  void _devNoise;
  void _retryWorthy;
  return { ...rest, attempts };
}

export async function runPool<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(lanes);
  return results;
}
