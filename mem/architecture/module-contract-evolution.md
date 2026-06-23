---
name: Module Contract Evolution Roadmap
description: 3-step plan to evolve UnifiedModuleDef toward fully declarative manifests (emits/listens split, integrations dep, ui.navItems/routes activation)
type: feature
---

## Current state
`defineModule()` in `src/lib/module-def.ts` is our module contract. Covers: inputSchema/outputSchema, requires (deps), agent.skills/skillSeeds/automations, data.tables/storageBuckets/settingsKeys, processes/maturity, capabilities, tier. ~70% of "fully declarative manifest" goal.

## 3-step evolution (ordered by ROI / risk)

### Step 1 — Split webhookEvents → emits / listens ✅ DONE
Why: enables `/admin/event-bus` producer→consumer graph and CI dead-listener/dead-event detection.
- `agent.emits[]` — events module emits
- `agent.listens[]` — events module consumes
- `webhookEvents` kept as alias for `emits` (backwards-compat — 12 existing modules unchanged)
- Helper `getModuleListenedEvents()` added in `module-webhook-events.ts`
- New modules should prefer `agent.emits` / `agent.listens`. Listeners default to `[]` until backfilled.

### Step 2 — `integrations: IntegrationDep[]` (do when scaffolding voice-web-module)
Why: today modul↔integration coupling is implicit in code. Blocks deklarativ health-checks, marketplace-läge, onboarding-UX.
Shape (draft):
```ts
integrations?: Array<{
  oneOf?: IntegrationId[];   // module needs at least one of these
  allOf?: IntegrationId[];   // module needs all of these
  optional?: IntegrationId[];// module can enhance with these
}>
```
Voice-web first consumer: `oneOf: ['elevenlabs', 'openai', 'local-voice']`.

### Step 3 — Activate `ui.navItems` + `ui.routes` (do when Sidebar.tsx ändå refaktoreras)
Why: Sidebar/routing slutar vara hårdkodad lista. Disabled moduler försvinner automatiskt från UI. Pages/widgets en modul exponerar deklareras i manifestet.
Risk: stor refaktor av Sidebar. Gör INTE isolerat — vänta tills Sidebar rörs av annat skäl.

## Long-term: ~90% declarative after step 2-3
Remaining 10% (module-versioning, migration-deklaration, semver compat-checks) väntar tills third-party moduler är på bordet.

## Inspiration
- Odoo `__manifest__.py` `depends` field
- WordPress plugin requirements
- VS Code `extensionDependencies`
- npm `peerDependencies` (closest analog for `integrations.oneOf`)
