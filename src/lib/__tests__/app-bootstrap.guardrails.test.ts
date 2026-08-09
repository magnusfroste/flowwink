/**
 * Two defaults that are invisible until they are wrong.
 *
 * `new QueryClient()` with no options gives every one of the 151 query hooks
 * `staleTime: 0` — stale the instant it resolves — so returning to the tab
 * refetches the whole admin surface. And a root rendered without StrictMode
 * never gets the development double-mount that exposes an effect which is not
 * safe to run twice.
 *
 * Neither shows up in a test or a type error; both are one line. These
 * guardrails keep them from quietly disappearing in a later refactor.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const app = strip(read('src/App.tsx'));
const main = strip(read('src/main.tsx'));

describe('the query client carries deliberate defaults', () => {
  it('is not constructed bare', () => {
    expect(app).not.toMatch(/new QueryClient\(\s*\)/);
    expect(app).toMatch(/new QueryClient\(\s*\{/);
  });

  it('sets a staleTime floor', () => {
    expect(app).toMatch(/defaultOptions:\s*\{[\s\S]*queries:\s*\{[\s\S]*staleTime:/);
  });

  it('does not retry a failing query three times', () => {
    // The default is 3 with exponential backoff — ~7s of spinner before an
    // operator learns anything went wrong.
    const m = app.match(/retry:\s*(\d+)/);
    expect(m, 'retry should be set explicitly').not.toBeNull();
    expect(Number(m![1])).toBeLessThanOrEqual(1);
  });
});

describe('the root mounts under StrictMode', () => {
  it('imports and wraps with it', () => {
    expect(main).toMatch(/import \{ StrictMode \} from "react"/);
    expect(main).toMatch(/<StrictMode>[\s\S]*<App \/>[\s\S]*<\/StrictMode>/);
  });

  it('still guards the root element rather than asserting it away', () => {
    // The `!` non-null assertion turns a missing #root into a stack trace
    // pointing at React instead of at the HTML.
    expect(main).not.toMatch(/getElementById\("root"\)!/);
  });
});
