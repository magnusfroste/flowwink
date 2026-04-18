import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

interface ParsedModule {
  exportName: string;
  id: string;
  fileName: string;
  source: string;
  skills: string[];
}

const projectRoot = process.cwd();

function readProjectFile(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function parseUnifiedModules(): ParsedModule[] {
  const modulesDir = path.join(projectRoot, 'src/lib/modules');

  return fs
    .readdirSync(modulesDir)
    .filter((fileName) => fileName.endsWith('-module.ts'))
    .map((fileName) => {
      const source = fs.readFileSync(path.join(modulesDir, fileName), 'utf8');
      const exportMatch = source.match(/export const\s+(\w+)\s*=\s*defineModule/);
      const idMatch = source.match(/id:\s*'([^']+)'(?:\s+as\s+any)?/);
      const skillsMatch = source.match(/skills:\s*\[([\s\S]*?)\]/);

      if (!exportMatch || !idMatch) {
        return null;
      }

      return {
        exportName: exportMatch[1],
        id: idMatch[1],
        fileName,
        source,
        skills: skillsMatch ? Array.from(skillsMatch[1].matchAll(/'([^']+)'/g), (m) => m[1]) : [],
      } satisfies ParsedModule;
    })
    .filter((mod): mod is ParsedModule => mod !== null);
}

function parseModuleSettingsKeys(): string[] {
  const source = readProjectFile('src/hooks/useModules.tsx');
  const blockMatch = source.match(/export const defaultModulesSettings: ModulesSettings = \{([\s\S]*?)^\};/m);
  if (!blockMatch) return [];

  return Array.from(blockMatch[1].matchAll(/^\s{2}([A-Za-z0-9_]+):\s*\{/gm), (m) => m[1]);
}

const parsedModules = parseUnifiedModules();
const modulesIndexSource = readProjectFile('src/lib/modules/index.ts');
const moduleRegistrySource = readProjectFile('src/lib/module-registry.ts');
const moduleSettingsKeys = parseModuleSettingsKeys();

const nonToggleableUnifiedModules = new Set(['email']);

describe('module registry guardrails', () => {
  it('exports every defineModule module from src/lib/modules/index.ts', () => {
    for (const mod of parsedModules) {
      expect(modulesIndexSource, `${mod.fileName} is not exported from src/lib/modules/index.ts`).toContain(
        `export { ${mod.exportName} }`,
      );
    }
  });

  it('keeps every toggleable unified module aligned with ModulesSettings keys', () => {
    for (const mod of parsedModules.filter((entry) => !nonToggleableUnifiedModules.has(entry.id))) {
      expect(
        moduleSettingsKeys,
        `${mod.id} exists as defineModule() but is missing from defaultModulesSettings in useModules.tsx`,
      ).toContain(mod.id);
    }
  });

  it('imports every toggleable unified module into module-registry.ts', () => {
    for (const mod of parsedModules.filter((entry) => !nonToggleableUnifiedModules.has(entry.id))) {
      expect(
        moduleRegistrySource,
        `${mod.exportName} is not imported into src/lib/module-registry.ts, so self-registration can drift silently`,
      ).toContain(mod.exportName);
    }
  });

  it('requires skill-owning modules to declare core manifest fields', () => {
    for (const mod of parsedModules.filter((entry) => entry.skills.length > 0)) {
      expect(mod.source, `${mod.id} is missing a description in its module manifest`).toMatch(/description:\s*['`]/);
      expect(mod.source, `${mod.id} is missing capabilities in its module manifest`).toMatch(/capabilities:\s*\[/);
      expect(mod.source, `${mod.id} is missing inputSchema in its module manifest`).toMatch(/inputSchema[, :]/);
      expect(mod.source, `${mod.id} is missing outputSchema in its module manifest`).toMatch(/outputSchema[, :]/);
      expect(mod.source, `${mod.id} is missing publish() in its module manifest`).toMatch(/async publish\(/);
    }
  });
});