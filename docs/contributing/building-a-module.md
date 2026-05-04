# Building a Module

> Audience: contributors adding a new vertical to FlowWink.
> Status: canonical — supersedes scattered "how to add a module" notes.

A module is a **self-contained business capability** (e.g. CRM, Calendar,
Reconciliation). Modules are opt-in, declarative, and expose their power to
FlowPilot/MCP through skills.

## TL;DR

```bash
bun run new:module my-thing       # scaffold module + doc
# ... implement skillSeeds + publish() ...
bun run lint:skills               # verify agent contract
```

Then follow the [New Module Checklist](../../mem/development/new-module-checklist.md).

---

## 1. Architecture in one picture

```
┌─────────────────────────────────────────────────────────────────┐
│  src/lib/modules/<id>-module.ts   ← single source of truth     │
│  defineModule({                                                 │
│    id, name, version, capabilities,                             │
│    inputSchema / outputSchema / publish(),                      │
│    skillSeeds: [...],   ← FlowPilot + MCP tools                 │
│    automations, seedData, webhookEvents (optional)              │
│  })                                                             │
└─────────────────────────────────────────────────────────────────┘
                  │
                  ├── enabled? → site_settings.modules.<id>
                  ├── skills installed → agent_skills (via bootstrap)
                  ├── MCP exposes them → mcp-server reads agent_skills
                  └── UI visible → useIsModuleEnabled('<id>')
```

This replaces 4 legacy registration files. Do **not** reach for the old
`module-contracts.ts` / `module-bootstraps/*.ts` / `skill-map.ts` /
`module-registry.ts` register-functions — `defineModule()` writes to all of
them at runtime.

---

## 2. Edge functions — minimize, don't multiply

The biggest contributor anti-pattern is "I need AI, let me create
`my-feature/index.ts`". We have **90+ functions** today and ~30 of them are
50-line wrappers around the same `resolveAiConfig + fetch` boilerplate.

### Decision tree

| You need to… | Do this |
|---|---|
| Call an LLM with a prompt + structured output | Add a `TaskSpec` to `supabase/functions/ai-task/tasks.ts`. Invoke via `POST /ai-task` with `{ task, input }`. |
| Send an email | Call `email-send` with `{ to, subject, html }`. Provider (SMTP/Resend) is resolved centrally. |
| Read/write a whitelisted table | Use the generic CRUD in `agent-execute` (`db:<table>` handler). |
| Hit a third-party webhook | Use `send-webhook` (or add a config to it). |
| Custom non-AI logic, OAuth callback, streaming chat, complex multi-step orchestration | OK — create a new edge function. |

### Adding an AI task

```ts
// supabase/functions/ai-task/tasks.ts
const myInput = z.object({ topic: z.string() });

export const myTask: TaskSpec<z.infer<typeof myInput>> = {
  name: "summarize_topic",
  description: "Summarize a topic in 3 bullets.",
  tier: "fast",                     // 'fast' | 'reasoning' | 'multimodal'
  inputSchema: myInput,
  system: () => "You are a concise analyst.",
  user: (i) => `Summarize: ${i.topic}`,
  tool: {
    name: "submit_summary",
    description: "Return summary",
    parameters: {
      type: "object",
      properties: { bullets: { type: "array", items: { type: "string" } } },
      required: ["bullets"],
    },
  },
  options: { temperature: 0.3 },
};

// then add to TASKS in tasks.ts
```

Caller:

```ts
const { data } = await supabase.functions.invoke("ai-task", {
  body: { task: "summarize_topic", input: { topic: "RAG pipelines" } },
});
// → data.result.bullets
```

The hub handles CORS, auth, provider fallback (vision, local LLM),
Anthropic↔OpenAI translation, rate limits, and structured output. Your task
file is ~30 lines.

---

## 3. Skills — the contract with FlowPilot and external claws

Every skill is also an MCP tool. Treat the `description` as **production
prompt engineering** — that's what the agent's scoring algorithm reads to
decide whether to pick your skill.

```ts
skillSeeds: [{
  name: 'create_invoice',
  description: 'Create a new invoice for a customer. ' +
    'Use when: user has confirmed line items and recipient. ' +
    'NOT for: drafts, quotes, or recurring subscriptions (use draft_invoice / create_quote / create_subscription).',
  handler: 'rpc:create_invoice',
  category: 'invoicing',
  mcp_exposed: true,
  tool_definition: {
    type: 'object',
    properties: {
      customer_id: { type: 'string', format: 'uuid' },
      line_items: { type: 'array', items: { /* ... */ } },
      due_date: { type: 'string', format: 'date' },
    },
    required: ['customer_id', 'line_items', 'due_date'],
    additionalProperties: false,
  },
}]
```

Verify with:

```bash
bun run lint:skills            # all enabled skills
bun run lint:skill create_invoice
```

The linter checks the four **Agent Contract Integrity** layers:
arg-mapping, NOT NULL coverage, value domains/enums, module registration.

---

## 4. UI patterns

- Admin pages live under `src/pages/admin/<Module>Page.tsx`.
- Always gate with `useIsModuleEnabled('<id>')` and render a graceful upsell when disabled.
- Sidebar entry: add to the navigation manifest, also gated by `useIsModuleEnabled`.
- Settings: render a `ModuleSettingsCard` so the user can toggle the module + provide config.

## 5. Migrations

All migrations idempotent. RLS on every new table. Roles via the
`has_role()` security-definer function — never store roles on the profile.

See [contributing.md → Database Migrations](./contributing.md#database-migrations).

## 6. Documentation

- `docs/modules/<id>.md` — user-facing module doc.
- `prd.md` — add the module to the product overview.
- `mem://` — only if you introduce a non-obvious architectural decision.

## 7. Before you open a PR

Run the [New Module Checklist](../../mem/development/new-module-checklist.md).
The CI guardrails enforce most of it; the rest is human review.
