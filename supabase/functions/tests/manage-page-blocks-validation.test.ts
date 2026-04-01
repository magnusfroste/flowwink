/**
 * Lager 2+3: manage_page_blocks Validation Integration Tests
 *
 * Tests the agentic feedback loop end-to-end against the real agent-execute
 * edge function. Verifies that:
 *
 * - ADD with invalid block_data → validation_failed with errors, hint, example
 * - ADD with valid block_data → block saved correctly
 * - UPDATE with invalid block_data → validation_failed with current_data included
 * - UPDATE with valid block_data → block updated correctly
 * - UPDATE: using the example from a failed attempt produces success on retry
 * - GET_BLOCK returns the saved data for read-before-write pattern
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY to seed a test page and (optionally) a
 * test skill. The test is skipped when these are not available.
 *
 * Run with: deno test --allow-net --allow-env supabase/functions/tests/
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  assertEquals,
  assertExists,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const canRun = !!SERVICE_KEY && !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

const httpHeaders = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
};

function getSupabase() {
  return createClient(SUPABASE_URL, SERVICE_KEY);
}

async function callAgentExecute(body: Record<string, unknown>): Promise<{ status: number; data: any }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/agent-execute`, {
    method: "POST",
    headers: httpHeaders,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data };
}

/** Minimal valid Tiptap doc — for use in test block_data */
function tiptapDoc(text: string) {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

// ─── Test Setup / Teardown ────────────────────────────────────────────────────

/**
 * Seed a temporary test page and ensure manage_page_blocks skill exists.
 * Returns { pageId, cleanupSkillId } — cleanupSkillId is set only if we
 * created a temporary skill (so we can delete it after the tests).
 */
async function setupTestFixtures(): Promise<{ pageId: string; cleanupSkillId: string | null }> {
  const supabase = getSupabase();

  // 1. Create a test page with empty content
  const { data: page, error: pageErr } = await supabase
    .from("pages")
    .insert({
      title: "TEST_BLOCK_VALIDATION — safe to delete",
      slug: `test-block-validation-${Date.now()}`,
      content_json: [],
      status: "draft",
    })
    .select("id")
    .single();

  if (pageErr || !page) throw new Error(`Failed to create test page: ${pageErr?.message}`);

  // 2. Check if manage_page_blocks skill already exists
  const { data: existingSkill } = await supabase
    .from("agent_skills")
    .select("id")
    .eq("name", "manage_page_blocks")
    .eq("enabled", true)
    .maybeSingle();

  if (existingSkill) {
    return { pageId: page.id, cleanupSkillId: null };
  }

  // 3. Skill not found — seed a minimal one for this test run
  const { data: skill, error: skillErr } = await supabase
    .from("agent_skills")
    .insert({
      name: "manage_page_blocks",
      description: "TEST — manage page blocks. Use when: testing. NOT for: production.",
      enabled: true,
      scope: "internal",
      trust_level: "auto",
      requires_approval: false,
      tool_definition: {
        type: "function",
        function: {
          name: "manage_page_blocks",
          description: "Manage page blocks",
          parameters: { type: "object", properties: {} },
        },
      },
    })
    .select("id")
    .single();

  if (skillErr || !skill) throw new Error(`Failed to seed test skill: ${skillErr?.message}`);

  return { pageId: page.id, cleanupSkillId: skill.id };
}

async function cleanupTestFixtures(pageId: string, cleanupSkillId: string | null): Promise<void> {
  const supabase = getSupabase();
  await supabase.from("pages").delete().eq("id", pageId);
  if (cleanupSkillId) {
    await supabase.from("agent_skills").delete().eq("id", cleanupSkillId);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST: ADD action — validation feedback loop
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "manage_page_blocks add: invalid block_data returns validation_failed with actionable errors",
  ignore: !canRun,
  async fn() {
    const { pageId, cleanupSkillId } = await setupTestFixtures();

    try {
      // Send a text block with raw string content — most common AI mistake
      const { status, data } = await callAgentExecute({
        skill_name: "manage_page_blocks",
        agent_type: "flowpilot",
        arguments: {
          action: "add",
          page_id: pageId,
          block_type: "text",
          block_data: { content: "<h2>This is raw HTML, not Tiptap</h2>" },
        },
      });

      assertEquals(status, 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
      assertEquals(data.status, "validation_failed", "Expected validation_failed status");
      assertExists(data.validation_errors, "Should include validation_errors array");
      assertExists(data.hint, "Should include hint for self-correction");
      assert(Array.isArray(data.validation_errors), "validation_errors should be an array");
      assert(data.validation_errors.length > 0, "Should have at least one error");
      assert(
        data.validation_errors.some((e: string) => e.includes("raw string")),
        `Error should mention 'raw string', got: ${data.validation_errors.join('; ')}`,
      );
    } finally {
      await cleanupTestFixtures(pageId, cleanupSkillId);
    }
  },
});

Deno.test({
  name: "manage_page_blocks add: features block with forbidden backgroundType returns validation_failed",
  ignore: !canRun,
  async fn() {
    const { pageId, cleanupSkillId } = await setupTestFixtures();

    try {
      const { status, data } = await callAgentExecute({
        skill_name: "manage_page_blocks",
        agent_type: "flowpilot",
        arguments: {
          action: "add",
          page_id: pageId,
          block_type: "features",
          block_data: {
            features: [{ id: "f1", icon: "Star", title: "Fast", description: "Very fast" }],
            backgroundType: "image", // forbidden on features — belongs to hero
          },
        },
      });

      assertEquals(status, 200);
      assertEquals(data.status, "validation_failed");
      assert(
        data.validation_errors.some((e: string) => e.includes("backgroundType")),
        "Error should mention backgroundType",
      );
    } finally {
      await cleanupTestFixtures(pageId, cleanupSkillId);
    }
  },
});

Deno.test({
  name: "manage_page_blocks add: valid block is saved and returns block_id",
  ignore: !canRun,
  async fn() {
    const { pageId, cleanupSkillId } = await setupTestFixtures();

    try {
      const { status, data } = await callAgentExecute({
        skill_name: "manage_page_blocks",
        agent_type: "flowpilot",
        arguments: {
          action: "add",
          page_id: pageId,
          block_type: "hero",
          block_data: { title: "Welcome to the test page", subtitle: "Automated test block" },
        },
      });

      assertEquals(status, 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
      assertExists(data.block_id, "Should return block_id after successful add");
      assertEquals(data.type, "hero");
      assertEquals(data.position, 0, "First block should be at position 0");
      assertEquals(data.total_blocks, 1);
    } finally {
      await cleanupTestFixtures(pageId, cleanupSkillId);
    }
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST: UPDATE action — validation feedback loop
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "manage_page_blocks update: invalid update returns validation_failed with current_data",
  ignore: !canRun,
  async fn() {
    const { pageId, cleanupSkillId } = await setupTestFixtures();

    try {
      // Step 1: Add a valid hero block
      const addResult = await callAgentExecute({
        skill_name: "manage_page_blocks",
        agent_type: "flowpilot",
        arguments: {
          action: "add",
          page_id: pageId,
          block_type: "hero",
          block_data: { title: "Original Title" },
        },
      });
      assertEquals(addResult.status, 200);
      const blockId = addResult.data.block_id;
      assertExists(blockId);

      // Step 2: Try to update with forbidden field (videoUrl on hero merged with existing,
      // but features has forbidden backgroundType — use cta with videoUrl instead)
      // Actually, let's use text block instead with raw string content
      // First add a text block, then try to update it with raw HTML
      const addTextResult = await callAgentExecute({
        skill_name: "manage_page_blocks",
        agent_type: "flowpilot",
        arguments: {
          action: "add",
          page_id: pageId,
          block_type: "text",
          block_data: { content: tiptapDoc("Original content") },
        },
      });
      assertEquals(addTextResult.status, 200);
      const textBlockId = addTextResult.data.block_id;

      // Step 3: Update text block with raw string content (invalid)
      const updateResult = await callAgentExecute({
        skill_name: "manage_page_blocks",
        agent_type: "flowpilot",
        arguments: {
          action: "update",
          page_id: pageId,
          block_id: textBlockId,
          block_data: { content: "This should be Tiptap JSON, not a string" },
        },
      });

      assertEquals(updateResult.status, 200);
      assertEquals(updateResult.data.status, "validation_failed");
      assertExists(updateResult.data.current_data, "Update failure should include current_data for read-before-write");
      assertExists(updateResult.data.hint, "Should include hint");
    } finally {
      await cleanupTestFixtures(pageId, cleanupSkillId);
    }
  },
});

Deno.test({
  name: "manage_page_blocks update: valid update persists change",
  ignore: !canRun,
  async fn() {
    const { pageId, cleanupSkillId } = await setupTestFixtures();

    try {
      // Add block
      const addResult = await callAgentExecute({
        skill_name: "manage_page_blocks",
        agent_type: "flowpilot",
        arguments: {
          action: "add",
          page_id: pageId,
          block_type: "hero",
          block_data: { title: "Original Title" },
        },
      });
      assertEquals(addResult.status, 200);
      const blockId = addResult.data.block_id;

      // Update with valid data
      const updateResult = await callAgentExecute({
        skill_name: "manage_page_blocks",
        agent_type: "flowpilot",
        arguments: {
          action: "update",
          page_id: pageId,
          block_id: blockId,
          block_data: { title: "Updated Title", subtitle: "Added subtitle" },
        },
      });

      assertEquals(updateResult.status, 200, `Expected 200, got: ${JSON.stringify(updateResult.data)}`);
      assertEquals(updateResult.data.status, "updated");
      assertEquals(updateResult.data.block_id, blockId);
    } finally {
      await cleanupTestFixtures(pageId, cleanupSkillId);
    }
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST: Self-correction retry — use example from error on second attempt
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "manage_page_blocks: retry with example from validation_failed succeeds",
  ignore: !canRun,
  async fn() {
    const { pageId, cleanupSkillId } = await setupTestFixtures();

    try {
      // Attempt 1: send invalid features block (missing features array)
      const attempt1 = await callAgentExecute({
        skill_name: "manage_page_blocks",
        agent_type: "flowpilot",
        arguments: {
          action: "add",
          page_id: pageId,
          block_type: "features",
          block_data: { title: "Our Features", variant: "cards" }, // missing features array!
        },
      });

      assertEquals(attempt1.status, 200);
      assertEquals(attempt1.data.status, "validation_failed");
      assertExists(attempt1.data.example, "Should provide example for self-correction");

      // Attempt 2: use the example from the error response (simulates FlowPilot retry)
      const attempt2 = await callAgentExecute({
        skill_name: "manage_page_blocks",
        agent_type: "flowpilot",
        arguments: {
          action: "add",
          page_id: pageId,
          block_type: "features",
          block_data: attempt1.data.example, // 🔄 use the hint example
        },
      });

      assertEquals(attempt2.status, 200, `Retry should succeed, got: ${JSON.stringify(attempt2.data)}`);
      assertExists(attempt2.data.block_id, "Retry should save the block and return block_id");
      assertEquals(attempt2.data.type, "features");
    } finally {
      await cleanupTestFixtures(pageId, cleanupSkillId);
    }
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST: GET_BLOCK — read-before-write pattern
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "manage_page_blocks get_block: returns block data for read-before-write",
  ignore: !canRun,
  async fn() {
    const { pageId, cleanupSkillId } = await setupTestFixtures();

    try {
      // Add a block
      const addResult = await callAgentExecute({
        skill_name: "manage_page_blocks",
        agent_type: "flowpilot",
        arguments: {
          action: "add",
          page_id: pageId,
          block_type: "hero",
          block_data: { title: "Read-back test", subtitle: "Should be retrievable" },
        },
      });
      assertEquals(addResult.status, 200);
      const blockId = addResult.data.block_id;

      // Read it back
      const getResult = await callAgentExecute({
        skill_name: "manage_page_blocks",
        agent_type: "flowpilot",
        arguments: {
          action: "get_block",
          page_id: pageId,
          block_id: blockId,
        },
      });

      assertEquals(getResult.status, 200, `Expected 200, got: ${JSON.stringify(getResult.data)}`);
      assertEquals(getResult.data.block_id, blockId);
      assertEquals(getResult.data.type, "hero");
      assertExists(getResult.data.data, "Should return block data");
      assertEquals(getResult.data.data.title, "Read-back test");
    } finally {
      await cleanupTestFixtures(pageId, cleanupSkillId);
    }
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST: LIST action — returns block inventory
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "manage_page_blocks list: returns block inventory after additions",
  ignore: !canRun,
  async fn() {
    const { pageId, cleanupSkillId } = await setupTestFixtures();

    try {
      // Add two blocks
      await callAgentExecute({
        skill_name: "manage_page_blocks",
        agent_type: "flowpilot",
        arguments: {
          action: "add", page_id: pageId, block_type: "hero",
          block_data: { title: "Block 1" },
        },
      });
      await callAgentExecute({
        skill_name: "manage_page_blocks",
        agent_type: "flowpilot",
        arguments: {
          action: "add", page_id: pageId, block_type: "text",
          block_data: { content: tiptapDoc("Block 2 content") },
        },
      });

      // List
      const listResult = await callAgentExecute({
        skill_name: "manage_page_blocks",
        agent_type: "flowpilot",
        arguments: { action: "list", page_id: pageId },
      });

      assertEquals(listResult.status, 200);
      assertEquals(listResult.data.block_count, 2);
      assert(Array.isArray(listResult.data.blocks), "blocks should be an array");
      assertEquals(listResult.data.blocks[0].type, "hero");
      assertEquals(listResult.data.blocks[1].type, "text");
    } finally {
      await cleanupTestFixtures(pageId, cleanupSkillId);
    }
  },
});
