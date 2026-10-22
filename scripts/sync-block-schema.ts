/**
 * sync-block-schema.ts
 * 
 * Reads BLOCK_REFERENCE from src/lib/block-reference.ts and generates:
 *   1. supabase/functions/_shared/block-schema.ts  — AI prompt schema string
 *   2. supabase/functions/_shared/block-tools.ts   — OpenAI function-calling tool defs
 * 
 * Run: bun run scripts/sync-block-schema.ts
 * Run automatically before deploy or after adding new blocks.
 *
 * Both files are committed by the PR that changes the registry (they are not
 * among the bot-owned artifacts). The write gate reads block-tools.ts, not
 * block-reference.ts, so a registry edit without a re-run changes nothing the
 * agent hits — block-generated-files-fresh.guardrails.test.ts renders them
 * with renderBlockSchemaFiles() and fails on any difference.
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BLOCK_REFERENCE, getImportableBlockTypes, type BlockInfo, type BlockFieldInfo } from '../src/lib/block-reference';

/** The registry's importable blocks, in registry order. */
function importableBlocks(registry: BlockInfo[]): BlockInfo[] {
  const importable = getImportableBlockTypes();
  return registry.filter(b => importable.includes(b.type));
}

// ── 1. Generate AI prompt schema (for migrate-page) ──────────────────────────

function generatePromptSchema(registry: BlockInfo[]): string {
  const blocks = importableBlocks(registry);

  let schema = 'Available CMS block types:\n\n';

  blocks.forEach((block, i) => {
    schema += `${i + 1}. ${block.type} - ${block.name}\n`;
    schema += `   ${block.description}\n`;
    schema += `   Data: { ${formatFields(block.fields)} }\n\n`;
  });

  return schema;
}

const TIPTAP_EXAMPLE = `{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Section Title"}]},{"type":"paragraph","content":[{"type":"text","text":"Your paragraph text here."}]}]}`;

function formatFields(fields: BlockFieldInfo[]): string {
  return fields.map(f => {
    const req = f.required ? '' : '?';
    if (f.options) {
      return `${f.name}${req}: ${f.options.map(o => `'${o}'`).join(' | ')}`;
    }
    if (f.type === 'array') {
      if (f.itemFields && f.itemFields.length > 0) {
        const sub = f.itemFields.map(sf => {
          const sreq = sf.required ? '' : '?';
          if (sf.type === 'tiptap') return `${sf.name}${sreq}: <TiptapDoc>`;
          if (sf.options) return `${sf.name}${sreq}: ${sf.options.map(o => `'${o}'`).join(' | ')}`;
          return `${sf.name}${sreq}: ${sf.type}`;
        }).join(', ');
        const tiptapNote = f.itemFields.some(sf => sf.type === 'tiptap')
          ? ' — fields marked <TiptapDoc> must be Tiptap JSON objects, never strings'
          : '';
        return `${f.name}${req}: [{ ${sub} }]${tiptapNote ? `  /*${tiptapNote} */` : ''}`;
      }
      return `${f.name}${req}: [...]  /* ${f.description} */`;
    }
    if (f.type === 'tiptap') {
      return `${f.name}${req}: ${TIPTAP_EXAMPLE}  /* Tiptap JSON doc — use type:"doc" with paragraph/heading/bulletList nodes */`;
    }
    return `${f.name}${req}: ${f.type}`;
  }).join(', ');
}

/**
 * Collect all { blockType, arrayField, itemField } triples where itemField.type === 'tiptap'.
 * Used to generate the TIPTAP_NESTED_FIELDS export for normalize-blocks.ts.
 */
function collectNestedTiptapFields(blocks: BlockInfo[]): { blockType: string; arrayField: string; itemField: string }[] {
  const result: { blockType: string; arrayField: string; itemField: string }[] = [];
  for (const block of blocks) {
    for (const field of block.fields) {
      if (field.type === 'array' && field.itemFields) {
        for (const sub of field.itemFields) {
          if (sub.type === 'tiptap') {
            result.push({ blockType: block.type, arrayField: field.name, itemField: sub.name });
          }
        }
      }
    }
  }
  return result;
}

// ── 2. Generate OpenAI tool definitions (for copilot-action) ─────────────────

function fieldToJsonSchema(f: BlockFieldInfo): Record<string, unknown> {
  const base: Record<string, unknown> = { description: f.description };

  if (f.options && f.type === 'string') {
    base.type = 'string';
    base.enum = f.options;
  } else if (f.type === 'array') {
    base.type = 'array';
    base.items = { type: 'object' };
  } else if (f.type === 'object') {
    base.type = 'object';
  } else if (f.type === 'tiptap') {
    base.type = 'object';
    base.description = `${f.description} (Tiptap JSON: {"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"..."}]}]})`;
  } else if (f.type === 'number') {
    base.type = 'number';
  } else if (f.type === 'boolean') {
    base.type = 'boolean';
  } else {
    base.type = 'string';
  }

  return base;
}

function generateToolDefinitions(registry: BlockInfo[]): object[] {
  const blocks = importableBlocks(registry);

  return blocks.map(block => {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const f of block.fields) {
      properties[f.name] = fieldToJsonSchema(f);
      if (f.required) required.push(f.name);
    }

    return {
      type: 'function',
      function: {
        name: `create_${block.type.replace(/-/g, '_')}_block`,
        description: `Create a ${block.name} section: ${block.description}`,
        parameters: {
          type: 'object',
          properties,
          ...(required.length ? { required } : {}),
        },
      },
    };
  });
}

// ── 3. Render and write output files ───────────────────────────────────────

const HEADER = `/**
 * AUTO-GENERATED — DO NOT EDIT
 * 
 * Generated by: bun run scripts/sync-block-schema.ts
 * Source of truth: src/lib/block-reference.ts
 * 
 * Re-run after adding or modifying block types.
 */\n\n`;

export const BLOCK_SCHEMA_PATH = 'supabase/functions/_shared/block-schema.ts';
export const BLOCK_TOOLS_PATH = 'supabase/functions/_shared/block-tools.ts';

/** Both generated files, exactly as they are written. Pure: no I/O. */
export function renderBlockSchemaFiles(registry: BlockInfo[] = BLOCK_REFERENCE): { schema: string; tools: string; toolCount: number } {
  const promptSchema = generatePromptSchema(registry);
  const toolDefs = generateToolDefinitions(registry);

  // Collect all nested tiptap fields across all block types (importable + non-importable)
  const nestedTiptapFields = collectNestedTiptapFields(registry);

  // Block schema for migrate-page
  const schema = `${HEADER}export const BLOCK_TYPES_SCHEMA = ${JSON.stringify(promptSchema, null, 2)};\n\n` +
    `export const IMPORTABLE_BLOCK_TYPES = ${JSON.stringify(importableBlocks(registry).map(b => b.type))} as const;\n\n` +
    `/**\n * Auto-generated list of nested array item fields that must be Tiptap JSON.\n` +
    ` * Used by normalize-blocks.ts to auto-fix raw strings in nested arrays.\n` +
    ` * Source: block-reference.ts fields with type:'array' and itemFields[].type:'tiptap'\n */\n` +
    `export const TIPTAP_NESTED_FIELDS = ${JSON.stringify(nestedTiptapFields, null, 2)} as const;\n`;

  // Tool definitions for copilot-action
  const tools = `${HEADER}export const BLOCK_CREATION_TOOLS = ${JSON.stringify(toolDefs, null, 2)} as const;\n\n` +
    `/** Map tool call name back to block type */\n` +
    `export function toolNameToBlockType(toolName: string): string | null {\n` +
    `  if (!toolName.startsWith('create_') || !toolName.endsWith('_block')) return null;\n` +
    `  return toolName.slice(7, -6).replace(/_/g, '-');\n` +
    `}\n`;

  return { schema, tools, toolCount: toolDefs.length };
}

if (typeof process !== 'undefined' && process.argv[1] && /sync-block-schema/.test(process.argv[1])) {
  const root = resolve(import.meta.dirname ?? __dirname, '..');
  const { schema, tools, toolCount } = renderBlockSchemaFiles();
  writeFileSync(resolve(root, BLOCK_SCHEMA_PATH), schema);
  writeFileSync(resolve(root, BLOCK_TOOLS_PATH), tools);

  // Summary
  const importableCount = getImportableBlockTypes().length;
  const totalCount = BLOCK_REFERENCE.length;
  console.log(`✅ Generated block schema files:`);
  console.log(`   📄 _shared/block-schema.ts  — ${importableCount} importable blocks (of ${totalCount} total)`);
  console.log(`   📄 _shared/block-tools.ts   — ${toolCount} tool definitions`);
  console.log(`   📋 Excluded: ${BLOCK_REFERENCE.filter(b => !getImportableBlockTypes().includes(b.type)).map(b => b.type).join(', ')}`);
}
