# Testing Guide — FlowPilot Autonomy Stack

This document describes the three-layer testing framework for FlowPilot and how to add new tests as the system evolves.

---

## Overview

All autonomy tests run **server-side** via the `run-autonomy-tests` edge function, meaning no local dev environment is needed. Tests are triggered from the admin panel at `/admin/autonomy-tests`.

| Layer | What it tests | Runs where | Dependencies |
|-------|--------------|------------|-------------|
| **L1 — Unit** | Pure functions from `agent-reason.ts` | Edge function (in-memory) | None |
| **L2 — Integration** | Edge function HTTP endpoints | Edge function → edge functions | `SUPABASE_SERVICE_ROLE_KEY` |
| **L3 — Scenario** | Database state, persistence, atomicity | Edge function → database | `SUPABASE_SERVICE_ROLE_KEY` |
| **L4 — Autonomy Health** | Live system: skills, soul, objectives seeded | Edge function → database | `SUPABASE_SERVICE_ROLE_KEY` |
| **L5 — Wiring** | End-to-end data flow: soul→prompt, memory→context, skill→tools, lock→skip | Edge function → all components | `SUPABASE_SERVICE_ROLE_KEY` |
| **L6 — Behavior** | OMATS Stage 3: personality, idle discipline, task completion, grounding, prioritization, tool selection, context use, resource awareness, scope boundaries | Edge function → AI provider | AI API key + `SUPABASE_SERVICE_ROLE_KEY` |

---

## File Locations

| File | Purpose |
|------|---------|
| `supabase/functions/run-autonomy-tests/index.ts` | Test runner edge function (all 3 layers) |
| `supabase/functions/tests/integration-autonomy.test.ts` | Deno-native integration tests (optional, for local dev) |
| `supabase/functions/_shared/agent-reason.ts` | The module under test |
| `src/pages/admin/AutonomyTestSuitePage.tsx` | Admin UI for running tests |

---

## Adding New Tests

### Step 1: Identify the Layer

- **New pure function** (prompt builder, token math, formatter) → **Layer 1**
- **New edge function endpoint** or changed API contract → **Layer 2**
- **New database behavior** (RLS, locking, persistence, triggers) → **Layer 3**

### Step 2: Write the Test

Open `supabase/functions/run-autonomy-tests/index.ts` and add your test to the appropriate `layer*Tests()` function.

#### Layer 1 Example (Unit)

```typescript
// Inside layer1Tests()
results.push(await runTest("myFunction: handles edge case", 1, async () => {
  const result = myFunction({ input: "edge" });
  assertEqual(result.status, "ok");
  assertContains(result.message, "processed");
}));
```

#### Layer 2 Example (Integration)

```typescript
// Inside layer2Tests()
results.push(await runTest("my-endpoint: returns correct shape", 2, async () => {
  const resp = await fetch(`${supabaseUrl}/functions/v1/my-endpoint`, {
    method: "POST", headers,
    body: JSON.stringify({ action: "test" }),
  });
  const data = await resp.json();
  assertEqual(resp.status, 200);
  assertExists(data.result);
}));
```

#### Layer 3 Example (Scenario)

```typescript
// Inside layer3Tests()
results.push(await runTest("My feature persists correctly", 3, async () => {
  // Setup: insert test data
  const { data } = await supabase.from("my_table").insert({
    name: "TEST — safe to delete",
  }).select("id").single();
  assertExists(data);

  try {
    // Act: exercise the feature
    const result = await myFeatureFunction(supabase, data.id);
    assertEqual(result.success, true);

    // Assert: verify database state
    const { data: row } = await supabase
      .from("my_table").select("*").eq("id", data.id).single();
    assertEqual(row.status, "completed");
  } finally {
    // Cleanup: always delete test data
    await supabase.from("my_table").delete().eq("id", data.id);
  }
}));
```

### Step 3: Import New Functions

If testing a new export from `agent-reason.ts`, add it to the import block at the top of the test runner:

```typescript
import {
  buildSystemPrompt,
  buildSoulPrompt,
  extractTokenUsage,
  // ... existing imports
  myNewFunction,  // ← add here
} from "../_shared/agent-reason.ts";
```

### Step 4: Deploy & Run

After editing the test runner, redeploy:

```bash
supabase functions deploy run-autonomy-tests --no-verify-jwt --project-ref <ref>
```

Then run from the admin panel at `/admin/autonomy-tests`.

---

## Available Assertions

| Function | Purpose | Example |
|----------|---------|---------|
| `assertEqual(actual, expected, msg?)` | Deep equality via JSON.stringify | `assertEqual(result, { ok: true })` |
| `assertExists(value, msg?)` | Not null/undefined | `assertExists(data.id)` |
| `assertContains(str, substr, msg?)` | String includes substring | `assertContains(prompt, "OBJECTIVES:")` |

---

## Test Naming Conventions

Use the format: `"subject: describes behavior"`

Good:
- `"extractTokenUsage: handles missing usage"`
- `"agent-execute: rejects missing skill"`
- `"Atomic checkout prevents double-lock"`

Bad:
- `"test1"`
- `"it should work"`

---

## When to Add Tests

| Scenario | What to test |
|----------|-------------|
| New skill added | L2: endpoint accepts/rejects correctly |
| New `agent-reason` export | L1: pure function behavior |
| New database table/column used by agent | L3: insert/read/update round-trip |
| Changed prompt structure | L1: `buildSystemPrompt` output contains expected sections |
| New checkout/locking logic | L3: atomic behavior, stale recovery |
| New heartbeat step | L1: state shape; L3: persistence round-trip |

---

## Cleanup Convention

Layer 3 tests that insert data **must** clean up after themselves using `try/finally`:

```typescript
try {
  // ... test logic
} finally {
  await supabase.from("table").delete().eq("id", testId);
}
```

Test data should include identifiable markers like `"TEST_"` or `"safe to delete"` in text fields.
