---
title: "EPIC-NN — <Title>"
status: planned        # planned | in-progress | done
sprint: <N>
owner: unassigned
---

# EPIC-NN — <Title>

## Why
<1–2 paragraphs. What gap this closes, which modules it unblocks, the business
reason it ranks where it does.>

## Outcome (Definition of Done for the whole epic)
- [ ] All issues below merged
- [ ] Capabilities flipped to `done` in `capabilities/*.json`: `<ids>`
- [ ] Every shipped capability is **dual-surface** (MCP skill + admin UI)
- [ ] Mean parity of affected modules ≥ `<target>%`
- [ ] No regression in `npx vitest run` and `npm run lint`

## Capabilities delivered
| File | Capability id | From → To |
|---|---|---|
| `capabilities/<mod>.json` | `<id>` | missing → done |

## Issues
<Each issue uses templates/issue-template.md. List as a checklist.>
- [ ] **NN.1** — <title>
- [ ] **NN.2** — <title>

## Dependencies & sequencing
<What must land first. What this blocks.>

## How we measure success
<The metric(s) and the exact command/query that proves it.>
