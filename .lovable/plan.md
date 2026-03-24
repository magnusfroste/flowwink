

# Plan: OpenClaw Core Refactor — `_shared/pilot/`

## Status: Phase 3 Complete ✅ + Documentation Complete ✅

### Completed Phases

#### Phase 1 — Extract Generic Core
1. Created `_shared/pilot/prompt-compiler.ts` — 6-layer prompt compiler (298L)
2. Created `_shared/pilot/built-in-tools.ts` — 40+ tool definitions (241L)
3. Created `_shared/domains/cms-context.ts` — CMS domain pack (246L)
4. Created `_shared/pilot/index.ts` — barrel re-exports
5. Updated `_shared/types.ts` — added `freshSitePlaybook` to `PromptCompilerInput`

#### Phase 2 — Extract Handlers
6. Created `_shared/pilot/handlers.ts` — 40+ built-in tool handlers (1401L)

#### Phase 3 — Extract Reasoning Loop
7. Created `_shared/pilot/reason.ts` — ReAct loop, skill loading, context pruning (871L)
8. Converted `_shared/agent-reason.ts` to backward-compatible re-export facade (107L)

#### Phase 4 — Documentation
9. Created `docs/pilot/README.md` — Overview, architecture diagram, file map, domain pack guide
10. Created `docs/pilot/architecture.md` — Deep technical reference (data flow, configs, internals)
11. Created `docs/pilot/handlers-reference.md` — All 40+ handlers with what/when/behavior

## Architecture (Final)

```text
supabase/functions/
├── _shared/
│   ├── pilot/                          ← GENERIC CORE (domain-agnostic)
│   │   ├── index.ts                    Barrel re-exports
│   │   ├── reason.ts            (871L) ReAct loop, skill loading, context pruning
│   │   ├── prompt-compiler.ts   (298L) 6-layer system prompt assembly
│   │   ├── handlers.ts         (1401L) 40+ built-in tool handlers
│   │   └── built-in-tools.ts   (241L)  Tool JSON schemas
│   │
│   ├── domains/                        ← DOMAIN PACKS (vertical-specific)
│   │   └── cms-context.ts       (246L) CMS schema, insights, maturity detection
│   │
│   ├── agent-reason.ts          (107L) Backward-compat facade (re-exports pilot/)
│   ├── types.ts                        Shared TypeScript interfaces
│   ├── ai-config.ts                    Model routing (OpenAI, Gemini, local, n8n)
│   ├── concurrency.ts                  Lane-based lock manager
│   ├── token-tracking.ts               Token extraction & budget tracking
│   └── trace.ts                        Correlation IDs

docs/
├── pilot/
│   ├── README.md                       Overview + getting started for contributors
│   ├── architecture.md                 Deep technical reference
│   └── handlers-reference.md           All handler docs
└── OPENCLAW-LAW.md                     Architectural law (unchanged)
```
