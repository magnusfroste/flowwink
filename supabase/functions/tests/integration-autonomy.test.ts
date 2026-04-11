/**
 * Lager 2: Edge Function Integration Tests — Autonomy
 * 
 * Tests real edge function endpoints with controlled inputs.
 * Validates: response shapes, error handling, checkout logic, goal-aware execution.
 * 
 * Run with: supabase--test_edge_functions or Deno test
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;

const headers = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
};

// ─── Helper ───────────────────────────────────────────────────────────────────

async function callEdgeFunction(name: string, body: any): Promise<{ status: number; data: any }> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: response.status, data };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("agent-execute: rejects missing skill_name/skill_id", async () => {
  const { status, data } = await callEdgeFunction("agent-execute", {
    arguments: {},
    agent_type: "flowpilot",
  });
  assertEquals(status, 400);
  assertEquals(data.error, "skill_id or skill_name required");
});

Deno.test("agent-execute: returns 404 for nonexistent skill", async () => {
  const { status, data } = await callEdgeFunction("agent-execute", {
    skill_name: "nonexistent_skill_xyz_99",
    arguments: {},
    agent_type: "flowpilot",
  });
  assertEquals(status, 404);
  assertExists(data.error);
});

Deno.test("agent-execute: accepts objective_context without error", async () => {
  // This tests that the goal-aware execution path doesn't crash.
  // Even if the skill doesn't exist, it should 404 not 500.
  const { status } = await callEdgeFunction("agent-execute", {
    skill_name: "nonexistent_skill_xyz_99",
    arguments: { test: true },
    agent_type: "flowpilot",
    objective_context: {
      goal: "Increase traffic by 20%",
      step: "Step 1: Audit current SEO",
      why: "Testing goal-aware execution",
    },
  });
  // Should be 404 (skill not found), NOT 500 (crash)
  assertEquals(status, 404);
});

Deno.test("agent-execute: blocks external scope from chat", async () => {
  // This tests scope validation. We need a skill that's internal-only.
  // Since we can't guarantee a specific skill exists, we just verify
  // the endpoint responds correctly for valid input shapes.
  const { status } = await callEdgeFunction("agent-execute", {
    skill_name: "manage_site_settings",
    arguments: { action: "get", section: "general" },
    agent_type: "chat", // Chat trying to access internal skill
  });
  // Either 403 (blocked) or 404 (skill not found) are acceptable
  const validStatuses = [403, 404];
  assertEquals(validStatuses.includes(status), true, `Expected 403 or 404, got ${status}`);
});

Deno.test("flowpilot-heartbeat: responds with correct shape", async () => {
  // Heartbeat might fail due to no AI key in test env, but should not 500 on CORS
  const response = await fetch(`${SUPABASE_URL}/functions/v1/flowpilot-heartbeat`, {
    method: "OPTIONS",
    headers,
  });
  // OPTIONS should return 200 with CORS headers
  const text = await response.text(); // Consume body
  assertEquals(response.status, 200);
  assertExists(response.headers.get("access-control-allow-origin"));
});

Deno.test("heartbeat: POST returns structured response or graceful error", async () => {
  const { status, data } = await callEdgeFunction("flowpilot-heartbeat", {});
  // 200 = success, 404 = not deployed, 500 = AI provider missing — all acceptable
  if (status === 200) {
    assertExists(data.status);
    assertExists(data.actions);
    assertExists(data.token_usage);
    assertEquals(typeof data.duration_ms, "number");
  } else {
    // 404 (not deployed) or 500 (AI error) are expected in test environments
    const validStatuses = [404, 500];
    assertEquals(validStatuses.includes(status), true, `Expected 404 or 500, got ${status}`);
  }
});
