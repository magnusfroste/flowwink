import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROCESS_IDS, MATURITY_LEVELS } from '@/lib/processes';

const modulesDir = path.join(process.cwd(), 'src/lib/modules');
const moduleFiles = fs
  .readdirSync(modulesDir)
  .filter((f) => f.endsWith('-module.ts'));

interface Parsed {
  file: string;
  id: string;
  processes: string[];
  maturity: string | null;
}

function parseModule(file: string): Parsed | null {
  const src = fs.readFileSync(path.join(modulesDir, file), 'utf8');
  const idMatch = src.match(/defineModule[\s\S]*?(?:^|\n)\s+id:\s*'([^']+)'/);
  if (!idMatch) return null;

  const processesMatch = src.match(/\n\s+processes:\s*\[([^\]]*)\]/);
  const maturityMatch = src.match(/\n\s+maturity:\s*'(L[1-5])'/);

  const processes = processesMatch
    ? Array.from(processesMatch[1].matchAll(/'([^']+)'/g), (m) => m[1])
    : [];

  return {
    file,
    id: idMatch[1],
    processes,
    maturity: maturityMatch ? maturityMatch[1] : null,
  };
}

const parsed = moduleFiles.map(parseModule).filter((m): m is Parsed => m !== null);

describe('process coverage guardrails', () => {
  it('every module declares a maturity level', () => {
    for (const mod of parsed) {
      expect(mod.maturity, `${mod.file} (id=${mod.id}) is missing maturity: 'L1'..'L5'`).not.toBeNull();
      expect(MATURITY_LEVELS).toContain(mod.maturity as never);
    }
  });

  it('every module declares a processes array (may be empty)', () => {
    for (const mod of parsed) {
      // already captured as [] if absent; require literal presence in source
      const src = fs.readFileSync(path.join(modulesDir, mod.file), 'utf8');
      expect(
        /\n\s+processes:\s*\[/.test(src),
        `${mod.file} is missing processes: [] (empty array allowed for pure-platform modules)`,
      ).toBe(true);
    }
  });

  it('every declared process is a known ProcessId', () => {
    for (const mod of parsed) {
      for (const p of mod.processes) {
        expect(
          (PROCESS_IDS as readonly string[]).includes(p),
          `${mod.file} declares unknown process "${p}". Update src/lib/processes.ts.`,
        ).toBe(true);
      }
    }
  });

  it('every core process has at least one module', () => {
    for (const pid of PROCESS_IDS) {
      const owners = parsed.filter((m) => m.processes.includes(pid));
      expect(owners.length, `process "${pid}" has no modules — orphan in docs/processes/`).toBeGreaterThan(0);
    }
  });
});
