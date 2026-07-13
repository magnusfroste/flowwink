import { defineModule } from '@/lib/module-def';
import { z } from 'zod';
import type { SkillSeed } from '@/lib/module-bootstrap';

/**
 * Flowtable — Airtable-style flexible tables.
 *
 * What this module owns:
 *   - `flowtable_bases` / `flowtable_tables` / `flowtable_fields` / `flowtable_records`
 *   - Admin UI under `/admin/flowtable`
 *
 * Use cases:
 *   - Lightweight lists/CRUD that don't deserve a full module (call lists,
 *     prospecting sheets, content backlogs, expense pre-imports).
 *   - Staging area: clean & enrich rows, then push to CRM as leads or
 *     companies via the "Push to CRM" action.
 *
 * Skills (handler routed via agent-execute generic CRUD on the JSONB tables).
 */

const inputSchema = z.object({
  action: z.enum(['get_config']).default('get_config'),
});
const outputSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

const FLOWTABLE_SKILLS: SkillSeed[] = [
  {
    name: 'list_flowtable_bases',
    description:
      'List all Flowtable bases the current user can access. Use when: agent needs to discover existing ad-hoc tables (call lists, prospecting sheets, content backlogs). NOT for: structured CRM data (use list_leads/list_companies instead).',
    category: 'crm',
    handler: 'db:flowtable_bases',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_flowtable_bases',
        description: 'List Flowtable bases (Airtable-style workspaces).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list'] },
            limit: { type: 'number' },
          },
          required: ['action'],
          additionalProperties: false,
        },
      },
    },
  },
  {
    name: 'list_flowtable_records',
    description:
      'List records inside a Flowtable table. Use when: reading rows from a user-owned ad-hoc table (call lists, prospect sheets). Each record has a free-form `values` JSONB matching the table\'s field keys.',
    category: 'crm',
    handler: 'db:flowtable_records',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_flowtable_records',
        description: 'List Flowtable records, optionally filtered by table_id.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list'] },
            table_id: { type: 'string' },
            limit: { type: 'number' },
          },
          required: ['action'],
          additionalProperties: false,
        },
      },
    },
  },
  {
    name: 'list_flowtable_tables',
    description:
      'Discover the tables + field schema inside a Flowtable base (Airtable-style). Use when: an agent found a base (list_flowtable_bases) and needs to know which tables it holds + their field keys before querying. Returns each table with its record_count and fields [{key,name,type}]. The missing link between list_flowtable_bases and query_flowtable when table names are unknown.',
    category: 'crm',
    handler: 'rpc:list_flowtable_tables',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_flowtable_tables',
        description: 'List the tables and their field schema in a Flowtable base. Provide base_id OR base_slug.',
        parameters: {
          type: 'object',
          properties: {
            base_id: { type: 'string', description: 'Base id (from list_flowtable_bases)' },
            base_slug: { type: 'string', description: 'Base slug, e.g. field-service-ops' },
          },
        },
      },
    },
  },
  {
    name: 'query_flowtable',
    description:
      'Query a Flowtable table server-side: filter on field values (eq/neq/ilike pushed to the DB; gt/gte/lt/lte numeric, is_empty/not_empty), free-text search across all fields, sort by a field, and count_by aggregation (value → row count). Use when: answering questions over an imported sheet (call list, prospect CSV) WITHOUT paging thousands of rows into context — e.g. "how many rows per status?" is one call with count_by. NOT for: reading a handful of raw rows (list_flowtable_records); structured CRM data (manage_leads).',
    category: 'crm',
    handler: 'module:flowtable',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'query_flowtable',
        description: 'Filter/search/aggregate records in a Flowtable table by its JSONB field values.',
        parameters: {
          type: 'object',
          properties: {
            table_id: { type: 'string', description: 'Table UUID (preferred when known)' },
            table: { type: 'string', description: 'Table name or slug (alternative to table_id)' },
            base: { type: 'string', description: 'Base name or slug, to disambiguate table lookup' },
            filters: {
              type: 'array',
              description: 'AND-combined conditions on field values',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string', description: 'Field key (see fields in any response)' },
                  op: { type: 'string', enum: ['eq', 'neq', 'ilike', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'not_empty'] },
                  value: { type: 'string', description: 'Comparison value (omit for is_empty/not_empty)' },
                },
                required: ['field', 'op'],
              },
            },
            search: { type: 'string', description: 'Free-text ilike across ALL fields' },
            order_by: { type: 'string', description: 'Field key to sort by (numeric-aware)' },
            ascending: { type: 'boolean' },
            count_by: { type: 'string', description: 'Field key to aggregate: returns value → count map' },
            resolve_links: { type: 'boolean', description: 'For link-type fields (which store a related row id), expand each id to the target row\'s display value under item._links[field] = {id, display}. Default false.' },
            resolve_computed: { type: 'boolean', description: 'Compute lookup fields (a value pulled from the linked row) and rollup fields (an aggregate — count/sum/avg/min/max — over rows in another table that link back to this row) into item._computed[field]. Default false.' },
            limit: { type: 'number', description: 'Rows to return (default 50, max 500)' },
            offset: { type: 'number' },
          },
        },
      },
    },
    instructions:
      'Resolve the table via table_id, or table (+ base if ambiguous). Every response includes the table\'s fields (key/name/type) — use those keys in filters/order_by/count_by; unknown keys error with the valid list. eq/neq/ilike filters and search run in the database; gt/gte/lt/lte (numeric) and sorting/aggregation scan up to 20 000 rows in the handler (scan_capped=true signals truncation). For "how is X distributed?" call once with count_by=X instead of listing rows. Pagination: limit/offset over the matched set; total_matched tells you the full size. RELATIONS: a field with type="link" points at another table — its response entry carries link_table_id + link_table_name + link_display_field, and the value stored per row is the target row id. To traverse the relation in one call, pass resolve_links=true and read item._links[field]={id,display}; to filter by a link, use its id as the value (op=eq). Discover the target table\'s own fields with list_flowtable_tables. DERIVED FIELDS: type="lookup" pulls a field from the linked row (carries via_link_field + target_field); type="rollup" aggregates rows in another table that link back here (carries source_table_id + source_link_field + agg + agg_field). Pass resolve_computed=true to get both under item._computed[field] — e.g. "total order value per customer" is a rollup resolved in one call, no second query. USER FIELDS: type="user" stores a profiles.id (a real platform identity; user_role_filter in the schema shows any role scoping). resolve_links=true expands them to item._links[field]={id, display, email} — and manage_flowtable_record can SET an assignee by writing a profiles.id to the field (find people via the employees/profiles surfaces).',
  },
  {
    name: 'manage_flowtable_record',
    description:
      'Create, update, delete or get a single Flowtable record. Update MERGES the given values into the existing row by default (merge=false replaces). Use when: correcting or enriching rows in an imported sheet (mark a call done, fill a missing email). NOT for: bulk CSV import (admin UI at /admin/flowtable imports CSV with columns auto-created from the header row); querying (query_flowtable).',
    category: 'crm',
    handler: 'module:flowtable',
    scope: 'internal',
    
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_flowtable_record',
        description: 'CRUD on a single Flowtable record (values = object keyed by the table\'s field keys).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'update', 'delete', 'get'] },
            id: { type: 'string', description: 'Record UUID (update/delete/get)' },
            table_id: { type: 'string', description: 'Table UUID (create)' },
            table: { type: 'string', description: 'Table name or slug (create, alternative to table_id)' },
            base: { type: 'string', description: 'Base name or slug to disambiguate (create)' },
            values: { type: 'object', description: 'Field values keyed by field key' },
            merge: { type: 'boolean', description: 'update only: merge into existing values (default true); false replaces the whole object' },
          },
          required: ['action'],
        },
      },
    },
    instructions:
      'create: pass table (or table_id) + values; keys outside the table\'s fields are stored but flagged with a warning (they stay invisible in the grid until a matching field exists). update: MERGE semantics by default — only the keys you pass change; pass merge=false to replace the whole values object. Get field keys from query_flowtable/list_flowtable_records responses.',
  },
];

export const flowtableModule = defineModule<Input, Output>({
  id: 'flowtable' as never,
  name: 'Flowtable',
  version: '0.1.0',
  processes: [],
  maturity: 'L1',
  description:
    'Airtable-style flexible tables for lists, prospect sheets, content backlogs. CSV import/export + push-to-CRM bridge.',
  capabilities: [],
  inputSchema,
  outputSchema,
  skillSeeds: FLOWTABLE_SKILLS,

  async publish(): Promise<Output> {
    return { success: true };
  },
});
