---
title: The 3-Stage Pipeline — spec, build, verify & release
description: How work flows from decision to deployed reality, and which stage is allowed to certify what.
category: concepts
order: 52
---

# The 3-Stage Pipeline

The parity program runs on a three-stage pipeline that combines the best of two
worlds: **cloud agents** (breadth — specs, parallel audits, code, static checks)
and **local-capable agents** (depth — the real runtime, fleet credentials).
Each stage certifies **only what that stage alone can certify**, and no stage
re-does another stage's work.

```
STAGE 1 · SPEC          STAGE 2 · BUILD            STAGE 3 · VERIFY & RELEASE
(decide first)          (machine gates)            (run it for real)
─────────────────       ──────────────────         ─────────────────────────
capability entry    →   implement on branch    →   verification loop w/ REAL args
+ issue spec            CI: parity:check,          DB effect · Dt=Cr · both surfaces
(what/why/DoD)          skill-linter, vitest,      fleet deploy (migrations, fns,
                        handler-args-lint,         sync:skills)
                        [runtime smoke]            flip status → done + regen matrix
─────────────────       ──────────────────         ─────────────────────────
Gate: spec exists       Gate: green CI             Gate: ran green through the
and follows the         on the PR                  real runtime, deployed
template
```

## Stage 1 — SPEC (decide first, code later)

Who: the owner + any agent (cloud is fine — no runtime needed).

- Every change starts as a **written decision**: a capability row in
  `capabilities/<module>.json` and, for non-trivial work, an issue spec from
  [`templates/issue-template.md`](./templates/issue-template.md) (context, exact
  files, acceptance criteria, test command, DoD).
- The spec is the contract. If it isn't written here first, it doesn't get built.
- Output: a spec any agent can pick up cold.

## Stage 2 — BUILD (machine gates in CI)

Who: **any** agent — cloud, local, or human. The author doesn't matter because
the gates are neutral.

- Implement on a feature branch, open a draft PR.
- CI certifies everything that is checkable without credentials:
  - `npm run parity:check` — the parity matrix matches the capability files
    (no hand-edited or stale scores)
  - `scripts/skill-linter.ts` — skill metadata contract (blocking)
  - `scripts/handler-args-lint.ts` — skill schema ↔ handler args
  - `npx vitest run`, ESLint, `tsc`
  - *(planned)* **ephemeral runtime smoke**: `supabase start` in CI +
    `npm run local:smoke` with BUGS=0 — moves the cheap half of the verification
    loop into the neutral judge, so a `done` claim can be machine-refuted on the
    PR regardless of who authored it
- **Status ceiling: `partial`.** Stage 2 may flip a capability from `missing` to
  `partial` when both surfaces exist in code and CI is green — never to `done`.

## Stage 3 — VERIFY & RELEASE (the only stage that may say `done`)

Who: a **local-capable** agent or human — OrbStack + local Supabase +
`functions serve`, and fleet credentials.

- Run the capability through the **real runtime with real arguments** per
  [`verification-loop.md`](./verification-loop.md): exact errors, DB effect,
  balanced postings (Dt = Cr), both surfaces (gateway `rest/execute` + admin UI).
- Deploy what was verified: idempotent migration → `functions deploy` per
  instance → `skills:json` + `sync:skills -- --apply`.
- **Only now** flip the capability `status: "done"`, update its `verify` field
  with what was run and observed, and regenerate the matrix.

## The one rule that makes the division un-cheatable

> **`done` is reserved for Stage 3.** Cloud can build and claim `partial`; CI can
> refute; only executed reality grants `done`. ("If you didn't run it, it isn't
> done.")

## Why this split

| | Cloud agent | CI (neutral judge) | Local agent |
|---|---|---|---|
| Strength | breadth, parallelism, specs, code | repeatable, author-agnostic | the real runtime, creds, interactive debugging |
| Certifies | the decision (Stage 1) | the mechanics (Stage 2) | the reality (Stage 3) |
| Cannot | run skills, deploy fleet | run real-args business flows, deploy | parallelize cheaply |

The interface between stages is **artifacts, not memory**: git, the capability
files, the generated matrix, and handoff docs. That is what lets any agent pick
up at any stage cold.
