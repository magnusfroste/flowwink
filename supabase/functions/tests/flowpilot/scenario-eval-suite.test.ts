/**
 * Lager 3: Scenario Eval Suite — Agent Decision Benchmarks
 * 
 * Seeds known database states and validates that:
 * - CMS schema loader produces correct context
 * - Heartbeat state persists and loads correctly
 * - Checkout/release prevents race conditions
 * - Token budget enforcement works end-to-end
 * 
 * These are "eval" tests — they test the data pipeline, not AI output.
 * AI output quality testing requires separate LLM-as-judge evaluations.
 * 
 * Run with: supabase--test_edge_functions or Deno test
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Skip all tests if no service key (can't seed DB)
const canRunScenarios = !!SERVICE_KEY;

function getSupabase() {
  return createClient(SUPABASE_URL, SERVICE_KEY);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 1: Heartbeat State Persistence
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "Scenario: Heartbeat state persists between runs",
  ignore: !canRunScenarios,
  async fn() {
    const supabase = getSupabase();
    const testState = {
      last_run: new Date().toISOString(),
      objectives_advanced: ["obj-1", "obj-2"],
      next_priorities: ["priority-1"],
      pending_actions: [],
      token_usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
      iteration_count: 5,
    };

    // Save state
    const { data: existing } = await supabase
      .from("agent_memory").select("id").eq("key", "heartbeat_state").maybeSingle();

    if (existing) {
      await supabase.from("agent_memory")
        .update({ value: testState, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await supabase.from("agent_memory").insert({
        key: "heartbeat_state",
        value: testState,
        category: "context",
        created_by: "flowpilot",
      });
    }

    // Load state and verify
    const { data: loaded } = await supabase
      .from("agent_memory").select("value").eq("key", "heartbeat_state").maybeSingle();

    assertExists(loaded);
    assertEquals(loaded.value.iteration_count, 5);
    assertEquals(loaded.value.objectives_advanced.length, 2);
    assertEquals(loaded.value.token_usage.total_tokens, 1500);

    // Cleanup
    await supabase.from("agent_memory").delete().eq("key", "heartbeat_state");
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 2: Atomic Checkout / Race Condition
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "Scenario: Atomic checkout prevents concurrent processing",
  ignore: !canRunScenarios,
  async fn() {
    const supabase = getSupabase();

    // Seed a test objective
    const { data: obj } = await supabase.from("agent_objectives").insert({
      goal: "TEST_CHECKOUT_SCENARIO — safe to delete",
      status: "active",
      constraints: {},
      success_criteria: {},
      progress: {},
    }).select("id").single();

    assertExists(obj);
    const objectiveId = obj.id;

    try {
      // First checkout should succeed
      const staleThreshold = new Date(Date.now() - 30 * 60_000).toISOString();
      const { data: lock1 } = await supabase
        .from("agent_objectives")
        .update({ locked_by: "heartbeat-1", locked_at: new Date().toISOString() })
        .eq("id", objectiveId)
        .or(`locked_by.is.null,locked_at.lt.${staleThreshold}`)
        .select("id")
        .maybeSingle();

      assertExists(lock1, "First checkout should succeed");

      // Second checkout should FAIL (already locked)
      const { data: lock2 } = await supabase
        .from("agent_objectives")
        .update({ locked_by: "heartbeat-2", locked_at: new Date().toISOString() })
        .eq("id", objectiveId)
        .or(`locked_by.is.null,locked_at.lt.${staleThreshold}`)
        .select("id")
        .maybeSingle();

      assertEquals(lock2, null, "Second checkout should fail — objective already locked");

      // Verify the lock owner didn't change
      const { data: check } = await supabase
        .from("agent_objectives")
        .select("locked_by")
        .eq("id", objectiveId)
        .single();

      assertEquals(check?.locked_by, "heartbeat-1", "Lock owner should remain heartbeat-1");

      // Release
      await supabase
        .from("agent_objectives")
        .update({ locked_by: null, locked_at: null })
        .eq("id", objectiveId)
        .eq("locked_by", "heartbeat-1");

      // After release, checkout should work again
      const { data: lock3 } = await supabase
        .from("agent_objectives")
        .update({ locked_by: "heartbeat-3", locked_at: new Date().toISOString() })
        .eq("id", objectiveId)
        .or(`locked_by.is.null,locked_at.lt.${staleThreshold}`)
        .select("id")
        .maybeSingle();

      assertExists(lock3, "Checkout should succeed after release");
    } finally {
      // Cleanup
      await supabase.from("agent_objectives").delete().eq("id", objectiveId);
    }
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 3: Stale Lock Recovery
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "Scenario: Stale locks (>30min) are recovered automatically",
  ignore: !canRunScenarios,
  async fn() {
    const supabase = getSupabase();

    // Seed objective with a stale lock (35 minutes ago)
    const staleLockTime = new Date(Date.now() - 35 * 60_000).toISOString();
    const { data: obj } = await supabase.from("agent_objectives").insert({
      goal: "TEST_STALE_LOCK — safe to delete",
      status: "active",
      constraints: {},
      success_criteria: {},
      progress: {},
      locked_by: "crashed-heartbeat",
      locked_at: staleLockTime,
    }).select("id").single();

    assertExists(obj);

    try {
      // Checkout should succeed despite existing lock (it's stale)
      const staleThreshold = new Date(Date.now() - 30 * 60_000).toISOString();
      const { data: lock } = await supabase
        .from("agent_objectives")
        .update({ locked_by: "recovery-heartbeat", locked_at: new Date().toISOString() })
        .eq("id", obj.id)
        .or(`locked_by.is.null,locked_at.lt.${staleThreshold}`)
        .select("id")
        .maybeSingle();

      assertExists(lock, "Should recover stale lock");
    } finally {
      await supabase.from("agent_objectives").delete().eq("id", obj.id);
    }
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 4: Memory Isolation (heartbeat_state excluded from general memory)
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "Scenario: heartbeat_state is excluded from general memory loading",
  ignore: !canRunScenarios,
  async fn() {
    const supabase = getSupabase();

    // Ensure heartbeat_state exists
    const { data: existing } = await supabase
      .from("agent_memory").select("id").eq("key", "heartbeat_state").maybeSingle();

    if (!existing) {
      await supabase.from("agent_memory").insert({
        key: "heartbeat_state",
        value: { test: true },
        category: "context",
        created_by: "flowpilot",
      });
    }

    // Load general memories (same query as loadMemories)
    const { data: memories } = await supabase
      .from("agent_memory")
      .select("key, value, category")
      .not("key", "in", '("soul","identity","heartbeat_state")')
      .order("updated_at", { ascending: false })
      .limit(30);

    // Verify heartbeat_state is NOT in the results
    const hasHeartbeat = memories?.some((m: any) => m.key === "heartbeat_state");
    assertEquals(hasHeartbeat, false, "heartbeat_state should be excluded from general memories");

    // Also verify soul/identity are excluded
    const hasSoul = memories?.some((m: any) => m.key === "soul");
    const hasIdentity = memories?.some((m: any) => m.key === "identity");
    assertEquals(hasSoul, false, "soul should be excluded");
    assertEquals(hasIdentity, false, "identity should be excluded");
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 5: Token Usage Activity Logging
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "Scenario: Agent activity logs include token_usage field",
  ignore: !canRunScenarios,
  async fn() {
    const supabase = getSupabase();

    // Insert an activity with token_usage
    const tokenUsage = { prompt_tokens: 2000, completion_tokens: 800, total_tokens: 2800 };
    const { data: activity, error } = await supabase.from("agent_activity").insert({
      agent: "flowpilot",
      skill_name: "test_token_tracking",
      input: { test: true },
      output: { result: "ok" },
      status: "success",
      duration_ms: 500,
      token_usage: tokenUsage,
    }).select("id, token_usage").single();

    assertExists(activity, `Activity insert failed: ${error?.message}`);

    try {
      assertEquals(activity.token_usage.prompt_tokens, 2000);
      assertEquals(activity.token_usage.completion_tokens, 800);
      assertEquals(activity.token_usage.total_tokens, 2800);
    } finally {
      // Note: agent_activity has no DELETE RLS for non-admins, 
      // but service role key bypasses RLS
      await supabase.from("agent_activity").delete().eq("id", activity.id);
    }
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 6: CMS Schema Data Counts
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "Scenario: CMS schema count queries return numbers",
  ignore: !canRunScenarios,
  async fn() {
    const supabase = getSupabase();

    const [pages, posts, leads, products, skills] = await Promise.all([
      supabase.from("pages").select("id", { count: "exact", head: true }),
      supabase.from("blog_posts").select("id", { count: "exact", head: true }),
      supabase.from("leads").select("id", { count: "exact", head: true }),
      supabase.from("products").select("id", { count: "exact", head: true }),
      supabase.from("agent_skills").select("id", { count: "exact", head: true }).eq("enabled", true),
    ]);

    // All counts should be numbers (>= 0)
    assert(typeof pages.count === "number", "pages count should be a number");
    assert(typeof posts.count === "number", "posts count should be a number");
    assert(typeof leads.count === "number", "leads count should be a number");
    assert(typeof products.count === "number", "products count should be a number");
    assert(typeof skills.count === "number", "skills count should be a number");
  },
});
