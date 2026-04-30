# The OpenClaw Laws — FlowWink's Inviolable Architecture

> Four architectural laws inherited from the [OpenClaw](https://github.com/openclaw/openclaw) reference model.
> Every contributor — human or agent — must respect these. They are what keeps an autonomous platform sane at scale.

---

## Law 1 — No Hardcoded Intent Detection

**Never** add regex patterns, keyword lists, or `if`-statements to route specific user intents to specific skills. The agent MUST select skills through its general reasoning engine (ReAct loop + scoring algorithm) using skill metadata alone.

```ts
// ❌ Forbidden — hardcoded routing
if (/migrate|import/i.test(message)) forcePick('migrate_url');

// ✅ Correct — let scoring rank the skill
{
  description: 'Migrate or import an existing site. Use when: …  NOT for: …'
}
```

**Why it matters:** Hardcoded routing creates an unmaintainable web of special cases that prevents real autonomy. Every new capability would require a new `if`-statement instead of registering a skill.

---

## Law 2 — Skills Are Self-Describing

Every skill MUST contain enough metadata (`description`, `Use when:`, `NOT for:`, `tool_definition.parameters`) for the general scoring algorithm to select it correctly. If a skill isn't being picked up, the fix is **always better metadata** — never a routing hack.

This is enforced by the [Skill Linter](../architecture/skill-linter.md) and the [Agent Contract Integrity](../architecture/agent-contract-integrity.md) checklist.

---

## Law 3 — Blocks Are Interfaces, Not Pipelines

Public website blocks have **two responsibilities only**:
1. **Intent capture** — structured UI that makes the visitor's intent explicit
2. **Response rendering** — display the agent's answer in a visual format

A block must NEVER build its own AI pipeline. All intelligence flows through `chat-completion` (the unified reasoning hub).

```
❌  Block → dedicated edge function → AI model
✅  Block → chat-completion → skill execution → block renders response
```

**Refinement (utility vs skill):** Pure text transforms (improve / translate / summarize) are utilities and may call `chat-completion` directly. Anything needing business context (KB, identity, CRM, policy) must register as a skill.

---

## Law 4 — Fail Forward, Don't Gate

Prefer runtime fallbacks over static validation gates. If the credentials exist, the feature works — don't require manual `enabled` flags on top of working API keys. Auto-create missing taxonomies, auto-seed missing skills, degrade gracefully when an integration is unavailable.

---

## Why these laws ship as a package

The four laws are mutually reinforcing:

- Law 2 makes Law 1 possible (good metadata = no hardcoded routing needed).
- Law 3 forces all reasoning into one engine, where Law 2's metadata can actually be evaluated fairly.
- Law 4 keeps the system usable while modules are still being assembled.

Break one law and the rest erode within weeks. That's why FlowWink runs CI guardrails (`bun run lint:skills`, `module-registry-guardrails`, schema-vs-DB diffing) to enforce them automatically.

---

## See also

- [`architecture/agent-contract-integrity.md`](../architecture/agent-contract-integrity.md) — pre-release checklist
- [`architecture/skill-linter.md`](../architecture/skill-linter.md) — automated enforcement
- [`concepts/operator-strategy.md`](./operator-strategy.md) — how operators (FlowPilot, OpenClaw, external) plug into this model
