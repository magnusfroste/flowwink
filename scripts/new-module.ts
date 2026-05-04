#!/usr/bin/env bun
/**
 * new:module — Module scaffold CLI
 *
 *   bun run new:module my-thing
 *
 * Creates a minimal but complete unified module:
 *   - src/lib/modules/<id>-module.ts  (defineModule + skillSeed example)
 *   - docs/modules/<id>.md            (placeholder doc)
 *
 * After running, register the module by importing it from
 *   src/lib/modules/index.ts
 * (the file that aggregates all module imports).
 */

import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: bun run new:module <id>");
  console.error('  id must be lowercase, e.g. "calendar", "field-service"');
  process.exit(1);
}

const id = arg.toLowerCase().trim();
if (!/^[a-z][a-z0-9-]*$/.test(id)) {
  console.error(`Invalid id "${id}". Use lowercase letters, digits and dashes.`);
  process.exit(1);
}

const camel = id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const Pascal = camel[0].toUpperCase() + camel.slice(1);
const Title = id.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

const modulePath = join("src", "lib", "modules", `${id}-module.ts`);
const docPath = join("docs", "modules", `${id}.md`);

if (existsSync(modulePath)) {
  console.error(`Module already exists: ${modulePath}`);
  process.exit(1);
}

const moduleSrc = `import { defineModule } from '@/lib/module-def';
import { z } from 'zod';

/**
 * ${Title} module
 *
 * What this module owns:
 *   - (describe domain tables / RLS / admin UI)
 *
 * Skills exposed to FlowPilot / MCP:
 *   - (list skill names)
 *
 * @see docs/modules/${id}.md
 */

const inputSchema = z.object({
  // Define inputs your module accepts when invoked via moduleRegistry.publish()
  action: z.string(),
  payload: z.record(z.unknown()).optional(),
});

const outputSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

export const ${camel}Module = defineModule<Input, Output>({
  id: '${camel}' as any, // add to ModulesSettings type if needed
  name: '${Title}',
  version: '0.1.0',
  description: 'TODO: one-line description of what this module does for the user.',
  capabilities: [],
  inputSchema,
  outputSchema,

  // Declare the skills FlowPilot/MCP exposes when this module is enabled.
  // Each skill becomes an MCP tool automatically (see mcp-as-platform).
  skillSeeds: [
    // {
    //   name: 'list_${camel}_items',
    //   description: 'List ${Title} items. Use when: agent needs an overview. NOT for: single-item lookups.',
    //   handler: 'db:${id}', // or 'rpc:my_function' or 'edge:my-edge-fn'
    //   category: '${id}',
    //   mcp_exposed: true,
    //   tool_definition: {
    //     type: 'object',
    //     properties: { limit: { type: 'number' } },
    //     additionalProperties: false,
    //   },
    // },
  ],

  async publish(input: Input): Promise<Output> {
    return { success: true, data: { action: input.action } };
  },
});
`;

const docSrc = `# ${Title}

> Status: scaffolded — fill in once implementation begins.

## What it does

TODO: 1-2 sentence summary.

## Skills exposed

TODO: list each skill, its trigger conditions, and example payload.

## Tables / RLS

TODO: list owned tables and access rules.

## Settings

TODO: keys under \`site_settings.<module>\` (if any).

## Related

- Source: \`src/lib/modules/${id}-module.ts\`
- Memory: add a \`mem://\` entry once the module ships
`;

mkdirSync(dirname(modulePath), { recursive: true });
mkdirSync(dirname(docPath), { recursive: true });
writeFileSync(modulePath, moduleSrc);
writeFileSync(docPath, docSrc);

console.log(`✓ Created ${modulePath}`);
console.log(`✓ Created ${docPath}`);
console.log("");
console.log("Next steps:");
console.log(`  1. Add  '${camel}': boolean  to the ModulesSettings type (src/hooks/useModules.ts)`);
console.log(`  2. Import the module in src/lib/modules/index.ts (or the aggregator file)`);
console.log(`  3. Implement skillSeeds + publish()`);
console.log(`  4. Run  bun run lint:skills  to verify the agent contract`);
console.log(`  5. Document in docs/modules/${id}.md`);
