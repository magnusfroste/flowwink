/**
 * Lager 1: Block Quality Tests — FlowPilot Block Creation & Editing
 *
 * Tests the normalization and validation pipeline that FlowPilot's output passes
 * through before blocks are saved to pages.content_json. These tests verify:
 *
 * - htmlToTiptap: raw string → valid Tiptap doc conversion
 * - normalizeBlockData: per-block field normalization (tiptap, team, table)
 * - guessIcon / applyIconFallbacks: icon assignment pipeline
 * - validateBlockData: pre-save validation with actionable feedback for self-correction
 * - validateBlockContracts: required/forbidden field enforcement
 * - stripRemovedBlocks / normalizeBlocks: full pipeline integration
 *
 * "The system is only as useful as FlowPilot is smart — and these tests are the
 *  quality gate that proves the pipeline catches what FlowPilot gets wrong."
 *
 * These are pure-function unit tests. No DB or network required.
 * Every function under test is IMPORTED from
 * supabase/functions/_shared/normalize-blocks.ts — never re-implemented here.
 * See the note above the import block for why the old mirror was removed.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { BLOCK_REFERENCE, getImportableBlockTypes } from "@/lib/block-reference";

// ─── The source of truth, imported — not mirrored ────────────────────────────
//
// This file used to carry a ~400-line HAND-MAINTAINED COPY of normalize-blocks.ts,
// justified by a header claiming the module's Deno-style imports were
// "incompatible with vitest". That has not been true for a while — the sibling
// suite src/lib/__tests__/block-write-safety.guardrails.test.ts imports the very
// same module directly — and the copy had quietly fallen behind the source it
// claimed to mirror (no unknown-TYPE gate, no removal reasons, no envelope
// aliasing). Tests that green-light a stale copy of the thing under test are
// worse than no tests: they report on code that never runs in production.
// Import the source. If it changes, these tests change with it — which is the
// entire point of a quality gate.
import {
  htmlToTiptap,
  normalizeBlockData,
  normalizeBlocks,
  applyIconFallbacks,
  guessIcon,
  validateBlockData,
  validateBlockContracts,
  stripRemovedBlocks,
  TIPTAP_FIELDS,
  BLOCK_CONTRACTS,
  ICON_FALLBACKS,
  KEYWORD_ICON_MAP,
  BLOCK_HINTS,
  TIPTAP_HINT,
} from "../../../supabase/functions/_shared/normalize-blocks";
import { TIPTAP_NESTED_FIELDS } from "../../../supabase/functions/_shared/block-schema";


// ─── Helper: make a valid Tiptap doc ─────────────────────────────────────────

function makeTiptap(text: string): Record<string, unknown> {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. htmlToTiptap — raw string conversion
// ═══════════════════════════════════════════════════════════════════════════════

describe("htmlToTiptap — raw string conversion", () => {
  it("wraps plain text in a Tiptap paragraph doc", () => {
    const result = htmlToTiptap("Hello world");
    expect(result.type).toBe("doc");
    const content = result.content as any[];
    expect(content[0].type).toBe("paragraph");
    expect(content[0].content[0].text).toBe("Hello world");
  });

  it("strips HTML tags and preserves concatenated text content", () => {
    // htmlToTiptap strips ALL tags — no line splitting at tag boundaries
    // It only splits on \n or \n\n within the text content itself
    const result = htmlToTiptap("<h2>Title</h2><p>Body paragraph</p>") as any;
    const allText = result.content.map((p: any) => p.content?.[0]?.text ?? '').join('');
    expect(allText).toContain("Title");
    expect(allText).toContain("Body paragraph");
  });

  it("splits on double newlines to create multiple paragraphs", () => {
    const result = htmlToTiptap("Para one\n\nPara two\n\nPara three") as any;
    expect(result.content.length).toBe(3);
  });

  it("returns empty paragraph for empty string", () => {
    const result = htmlToTiptap("") as any;
    expect(result.type).toBe("doc");
    expect(result.content[0].type).toBe("paragraph");
    expect(result.content[0].content).toEqual([]);
  });

  it("returns empty paragraph for whitespace-only string", () => {
    const result = htmlToTiptap("   ") as any;
    expect(result.type).toBe("doc");
    expect(result.content[0].content).toEqual([]);
  });

  it("strips HTML tags leaving only text content", () => {
    const result = htmlToTiptap('<strong>Bold</strong> and <em>italic</em>') as any;
    const text = result.content[0].content[0].text;
    expect(text).toBe("Bold and italic");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. normalizeBlockData — field-level normalization
// ═══════════════════════════════════════════════════════════════════════════════

describe("normalizeBlockData — field normalization", () => {
  it("converts raw string 'content' field to Tiptap doc", () => {
    const block: Record<string, unknown> = {
      id: 'b1', type: 'text',
      data: { content: "This is plain text" },
    };
    normalizeBlockData(block);
    const data = block.data as any;
    expect(typeof data.content).toBe("object");
    expect(data.content.type).toBe("doc");
  });

  it("leaves valid Tiptap doc untouched", () => {
    const tiptap = makeTiptap("Already correct");
    const block: Record<string, unknown> = {
      id: 'b2', type: 'text',
      data: { content: tiptap },
    };
    normalizeBlockData(block);
    expect((block.data as any).content).toStrictEqual(tiptap);
  });

  it("converts raw string 'answer' inside accordion items to Tiptap", () => {
    const block: Record<string, unknown> = {
      id: 'b3', type: 'accordion',
      data: {
        items: [
          { question: "What is this?", answer: "This is the answer." },
          { question: "How much?",     answer: "€49/month." },
        ],
      },
    };
    normalizeBlockData(block);
    const items = (block.data as any).items;
    expect(typeof items[0].answer).toBe("object");
    expect(items[0].answer.type).toBe("doc");
    expect(typeof items[1].answer).toBe("object");
  });

  it("converts raw string 'content' inside tab items to Tiptap", () => {
    const block: Record<string, unknown> = {
      id: 'b4', type: 'tabs',
      data: {
        tabs: [
          { id: 'tab-1', title: 'Setup', content: "Setup instructions here." },
          { id: 'tab-2', title: 'Config', content: "Configuration details." },
        ],
      },
    };
    normalizeBlockData(block);
    const tabs = (block.data as any).tabs;
    expect(tabs[0].content.type).toBe("doc");
    expect(tabs[1].content.type).toBe("doc");
  });

  it("does NOT convert nested tiptap fields for non-matching block types", () => {
    // A 'features' block should NOT have its items walked for tiptap
    const block: Record<string, unknown> = {
      id: 'b5', type: 'features',
      data: {
        features: [{ id: 'f1', title: "Fast", description: "Very fast" }],
      },
    };
    normalizeBlockData(block);
    const features = (block.data as any).features;
    // descriptions remain as strings — they are not tiptap fields
    expect(typeof features[0].description).toBe("string");
  });

  it("maps team.members[].image → .photo and removes .image", () => {
    const block: Record<string, unknown> = {
      id: 'b6', type: 'team',
      data: {
        members: [
          { name: "Anna", role: "CEO", image: "https://example.com/anna.jpg" },
          { name: "Bob",  role: "CTO", photo: "https://example.com/bob.jpg", image: "old-url" },
        ],
      },
    };
    normalizeBlockData(block);
    const members = (block.data as any).members;
    // First member: image should become photo
    expect(members[0].photo).toBe("https://example.com/anna.jpg");
    expect(members[0].image).toBeUndefined();
    // Second member: photo takes priority over image
    expect(members[1].photo).toBe("https://example.com/bob.jpg");
    expect(members[1].image).toBeUndefined();
  });

  it("generates id for team members without id", () => {
    const block: Record<string, unknown> = {
      id: 'b7', type: 'team',
      data: { members: [{ name: "No-ID Person", role: "Staff" }] },
    };
    normalizeBlockData(block);
    const member = (block.data as any).members[0];
    expect(typeof member.id).toBe("string");
    expect(member.id.length).toBeGreaterThan(0);
  });

  it("normalizes table columns: assigns id, header, and align", () => {
    const block: Record<string, unknown> = {
      id: 'b8', type: 'table',
      data: {
        columns: [{ name: "Product" }, { title: "Price" }, { id: "qty", header: "Qty" }],
        rows: [],
      },
    };
    normalizeBlockData(block);
    const cols = (block.data as any).columns;
    expect(cols[0].id).toBe("col1");
    expect(cols[0].header).toBe("Product");
    expect(cols[0].align).toBe("left");
    expect(cols[1].header).toBe("Price");
    expect(cols[2].id).toBe("qty");
  });

  it("normalizes table rows from object with column header keys → column id keys", () => {
    const block: Record<string, unknown> = {
      id: 'b9', type: 'table',
      data: {
        columns: [{ id: "col1", header: "Product" }, { id: "col2", header: "Price" }],
        rows: [
          { Product: "Widget", Price: "€10" },
          { col1: "Gadget", col2: "€25" },
        ],
      },
    };
    normalizeBlockData(block);
    const rows = (block.data as any).rows;
    expect(rows[0].col1).toBe("Widget");
    expect(rows[0].col2).toBe("€10");
    expect(rows[1].col1).toBe("Gadget");
    expect(rows[1].col2).toBe("€25");
  });

  it("normalizes table rows from array format to object format", () => {
    const block: Record<string, unknown> = {
      id: 'b10', type: 'table',
      data: {
        columns: [{ id: "col1", header: "Name" }, { id: "col2", header: "Age" }],
        rows: [["Alice", "30"], ["Bob", "25"]],
      },
    };
    normalizeBlockData(block);
    const rows = (block.data as any).rows;
    expect(rows[0].col1).toBe("Alice");
    expect(rows[0].col2).toBe("30");
  });

  it("does nothing if block has no data", () => {
    const block: Record<string, unknown> = { id: 'bx', type: 'text' };
    expect(() => normalizeBlockData(block)).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. guessIcon — keyword-based icon guessing
// ═══════════════════════════════════════════════════════════════════════════════

describe("guessIcon — keyword-based icon assignment", () => {
  it("matches 'temperature' to Thermometer", () => {
    expect(guessIcon("temperature sensor", "Star")).toBe("Thermometer");
  });

  it("matches 'water' to Droplets", () => {
    expect(guessIcon("water leak detection", "Star")).toBe("Droplets");
  });

  it("matches 'security' to ShieldCheck", () => {
    expect(guessIcon("Security monitoring", "Star")).toBe("ShieldCheck");
  });

  it("matches 'energy' to Zap", () => {
    expect(guessIcon("energy consumption", "Star")).toBe("Zap");
  });

  it("matches 'AI data analytics' to BarChart3", () => {
    expect(guessIcon("AI data analytics platform", "Star")).toBe("BarChart3");
  });

  it("returns fallback when no keyword matches", () => {
    expect(guessIcon("Complete nonsense xyz", "TrendingUp")).toBe("TrendingUp");
  });

  it("is case insensitive", () => {
    expect(guessIcon("TEMPERATURE", "Star")).toBe("Thermometer");
    expect(guessIcon("Water", "Star")).toBe("Droplets");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. applyIconFallbacks — icon injection for blocks
// ═══════════════════════════════════════════════════════════════════════════════

describe("applyIconFallbacks — icon injection", () => {
  it("assigns fallback icon to features without icon", () => {
    const blocks = [{
      id: 'b1', type: 'features',
      data: {
        features: [
          { id: 'f1', title: "Fast", description: "Very fast" },
          { id: 'f2', title: "Secure", description: "Very secure", icon: "" },
        ],
      },
    }] as Record<string, unknown>[];
    applyIconFallbacks(blocks);
    const features = (blocks[0].data as any).features;
    expect(features[0].icon).toBeDefined();
    expect(typeof features[0].icon).toBe("string");
    expect(features[0].icon.length).toBeGreaterThan(0);
  });

  it("uses keyword guessing over generic fallback when title matches", () => {
    const blocks = [{
      id: 'b1', type: 'features',
      data: {
        features: [{ id: 'f1', title: "Water detection", description: "" }],
      },
    }] as Record<string, unknown>[];
    applyIconFallbacks(blocks);
    expect((blocks[0].data as any).features[0].icon).toBe("Droplets");
  });

  it("does NOT overwrite an existing icon", () => {
    const blocks = [{
      id: 'b1', type: 'features',
      data: {
        features: [{ id: 'f1', title: "Custom", icon: "HeartHandshake" }],
      },
    }] as Record<string, unknown>[];
    applyIconFallbacks(blocks);
    expect((blocks[0].data as any).features[0].icon).toBe("HeartHandshake");
  });

  it("treats 'null' string as missing icon", () => {
    const blocks = [{
      id: 'b1', type: 'features',
      data: {
        features: [{ id: 'f1', title: "Item", icon: "null" }],
      },
    }] as Record<string, unknown>[];
    applyIconFallbacks(blocks);
    expect((blocks[0].data as any).features[0].icon).not.toBe("null");
  });

  it("skips blocks without a known fallback type (e.g. hero)", () => {
    const blocks = [{
      id: 'b1', type: 'hero',
      data: { title: "Welcome" },
    }] as Record<string, unknown>[];
    expect(() => applyIconFallbacks(blocks)).not.toThrow();
  });

  it("applies fallback to stats items without icon", () => {
    const blocks = [{
      id: 'b1', type: 'stats',
      data: {
        stats: [
          { value: '1000+', label: 'Customers' },
          { value: '99%', label: 'Uptime', icon: 'Activity' },
        ],
      },
    }] as Record<string, unknown>[];
    applyIconFallbacks(blocks);
    const stats = (blocks[0].data as any).stats;
    expect(typeof stats[0].icon).toBe("string");
    expect(stats[0].icon.length).toBeGreaterThan(0);
    expect(stats[1].icon).toBe("Activity"); // untouched
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. validateBlockData — pre-save validation with actionable feedback
// ═══════════════════════════════════════════════════════════════════════════════

describe("validateBlockData — agentic self-correction feedback", () => {
  it("returns valid=true for correct hero block", () => {
    const result = validateBlockData("hero", { title: "Welcome to our site" });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns valid=false with error message when hero title is missing", () => {
    const result = validateBlockData("hero", { subtitle: "No title here" });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('"title"');
  });

  it("returns valid=false when forbidden field is present on cta block", () => {
    const result = validateBlockData("cta", {
      buttonText: "Click me",
      buttonUrl: "/contact",
      videoUrl: "https://youtube.com/watch?v=123", // forbidden!
    });
    expect(result.valid).toBe(false);
    // videoUrl trips TWO gates in the real module — it is both an unknown cta
    // field and an explicitly forbidden one — and the unknown-field error is
    // pushed first. Assert on the whole list, not on errors[0]: which gate
    // speaks first is an implementation detail, that both speak is the contract.
    expect(result.errors.join(' ')).toContain("forbidden");
    expect(result.errors.join(' ')).toContain("videoUrl");
  });

  it("returns valid=false when features block has forbidden backgroundType", () => {
    const result = validateBlockData("features", {
      features: [{ id: 'f1', title: "A", icon: "Star" }],
      backgroundType: "image", // belongs to hero, not features
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("backgroundType");
  });

  it("returns valid=false when text block has string content (raw HTML — common AI mistake)", () => {
    const result = validateBlockData("text", {
      content: "<p>This is HTML not Tiptap</p>",
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('"content"');
    expect(result.errors[0]).toContain("raw string");
    expect(result.errors[0]).toContain("Tiptap JSON");
  });

  it("includes TIPTAP_HINT in error for raw string content", () => {
    const result = validateBlockData("text", { content: "plain text" });
    expect(result.errors[0]).toContain('"type":"doc"');
  });

  it("returns valid=false when accordion items have raw string answers", () => {
    const result = validateBlockData("accordion", {
      items: [
        { question: "How?", answer: "This is the answer." }, // answer is string, not Tiptap
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("items[0].answer");
    expect(result.errors[0]).toContain("raw string");
  });

  it("returns valid=false when tabs have raw string content", () => {
    const result = validateBlockData("tabs", {
      tabs: [
        { id: 'tab-1', title: 'Intro', content: "Just a string, not Tiptap" },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("tabs[0].content");
    expect(result.errors[0]).toContain("raw string");
  });

  it("returns valid=true for tabs with correct Tiptap content objects", () => {
    const result = validateBlockData("tabs", {
      tabs: [
        { id: 'tab-1', title: 'Intro',
          content: makeTiptap("Introduction paragraph") },
        { id: 'tab-2', title: 'Details',
          content: makeTiptap("Details go here") },
      ],
    });
    expect(result.valid).toBe(true);
  });

  it("returns valid=false when bento-grid has no items", () => {
    const result = validateBlockData("bento-grid", { title: "Our Features", items: [] });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("items");
  });

  it("returns valid=true for correct bento-grid block", () => {
    const result = validateBlockData("bento-grid", {
      title: "Everything you need",
      items: [
        { id: 'b1', title: 'Monitoring', icon: 'Activity', span: 'wide' },
        { id: 'b2', title: 'Alerts',     icon: 'Bell',     span: 'normal' },
      ],
    });
    expect(result.valid).toBe(true);
  });

  it("includes a filled example in the error response for known block types", () => {
    const result = validateBlockData("features", { title: "Missing features array" });
    expect(result.valid).toBe(false);
    expect(result.example).toBeDefined();
    expect((result.example as any).features).toBeDefined();
    expect((result.example as any).features[0].icon).toBeDefined();
  });

  it("includes a hint string for self-correction", () => {
    const result = validateBlockData("features", { title: "Missing features array" });
    expect(typeof result.hint).toBe("string");
    expect(result.hint).toContain("features");
  });

  it("REFUSES an unknown block type — it renders as nothing", () => {
    // This test asserted valid=true ("pass-through") for as long as this file
    // ran against its own hand-written copy of the module. The real module has
    // failed closed here since the invented-type gate landed: a type nothing
    // renders is an invisible hole in the page, and letting it through is how
    // an agent reports a section that does not exist. The stale copy is exactly
    // why the inversion went unnoticed — the test was green about code that
    // never ran in production.
    const result = validateBlockData("custom-marketing-block", { any: "data" });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain("custom-marketing-block");
    expect(result.hint).toContain("describe_blocks");
  });

  it("cta requires buttonText — the one name the renderer reads", () => {
    const withButtonText = validateBlockData("cta", { buttonText: "Start" });
    const missingAll = validateBlockData("cta", { title: "No button at all" });
    expect(withButtonText.valid).toBe(true);
    expect(missingAll.valid).toBe(false);
    expect(missingAll.errors[0]).toContain('"buttonText"');

    // This expectation flipped when the contract was repaired (2026-08-22).
    // BLOCK_CONTRACTS.cta used to list the OR-group
    // ['buttonText','primaryButtonText','buttons'] while block-reference gives
    // cta only `buttonText` — so the last two satisfied the required-field gate
    // and were then refused by the unknown-field gate, and the required error
    // text recommended names that could not be written. The group is trimmed to
    // the renderer's name, and the other two are aliases in normalizeBlockData,
    // which is what keeps a legacy stored block editable on update. The error
    // must no longer offer a name the next gate refuses.
    expect(missingAll.errors.join(' ')).not.toContain("primaryButtonText");

    const block = { id: 'c1', type: 'cta', data: { primaryButtonText: "Start" } };
    normalizeBlockData(block);
    expect((block.data as Record<string, unknown>).buttonText).toBe("Start");
    expect(validateBlockData("cta", block.data as Record<string, unknown>).valid).toBe(true);
  });

  it("two-column accepts imageSrc OR content as satisfying required", () => {
    const withContent  = validateBlockData("two-column", { content: makeTiptap("Hello") });
    const withImage    = validateBlockData("two-column", { imageSrc: "https://example.com/img.jpg" });
    const missingBoth  = validateBlockData("two-column", { imageAlt: "alt text" });

    expect(withContent.valid).toBe(true);
    expect(withImage.valid).toBe(true);
    expect(missingBoth.valid).toBe(false);
  });

  it("newsletter block has no required fields — always passes", () => {
    const result = validateBlockData("newsletter", {});
    expect(result.valid).toBe(true);
  });

  it("reports multiple errors at once (combined forbidden + missing required)", () => {
    // features block: forbidden backgroundType AND missing features array
    const result = validateBlockData("features", {
      backgroundType: "image",   // forbidden
      title: "Only a title",     // missing features array
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. validateBlockContracts — marks invalid blocks for removal
// ═══════════════════════════════════════════════════════════════════════════════

describe("validateBlockContracts — block removal marking", () => {
  it("marks hero block without title for removal", () => {
    const blocks = [{ id: 'b1', type: 'hero', data: { subtitle: "Sub only" } }] as any[];
    validateBlockContracts(blocks);
    expect(blocks[0]._remove).toBe(true);
  });

  it("marks cta with forbidden videoUrl for removal", () => {
    const blocks = [{ id: 'b1', type: 'cta', data: { buttonText: "Go", videoUrl: "https://..." } }] as any[];
    validateBlockContracts(blocks);
    expect(blocks[0]._remove).toBe(true);
  });

  it("does NOT mark a valid hero block", () => {
    const blocks = [{ id: 'b1', type: 'hero', data: { title: "Welcome" } }] as any[];
    validateBlockContracts(blocks);
    expect(blocks[0]._remove).toBeUndefined();
  });

  it("marks block with missing data entirely for removal", () => {
    const blocks = [{ id: 'b1', type: 'text' }] as any[]; // no data key
    validateBlockContracts(blocks);
    expect(blocks[0]._remove).toBe(true);
  });

  it("REMOVES an unknown block type, with a reason that names the fix", () => {
    // Same inversion as the validateBlockData case above, on the manage_page
    // write path. "No contract" is NOT "unknown type": the truth about what
    // exists is KNOWN_BLOCK_TYPES, and a type outside it is removed — loudly.
    const blocks = [{ id: 'b1', type: 'custom-xyz', data: { anything: true } }] as any[];
    validateBlockContracts(blocks);
    expect(blocks[0]._remove).toBe(true);
    expect(String(blocks[0]._remove_reason)).toContain('not a block type');
    expect(String(blocks[0]._remove_reason)).toContain('describe_blocks');
  });

  it("a legitimate contract-FREE type is still kept — the distinction holds", () => {
    // The guard that keeps the gate above from becoming a regression:
    // section-divider/terms/newsletter render fine and rightly have no
    // BLOCK_CONTRACTS entry. Missing contract ≠ missing from the renderer.
    const blocks = [{ id: 'b1', type: 'section-divider', data: { shape: 'wave' } }] as any[];
    validateBlockContracts(blocks);
    expect(blocks[0]._remove).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. stripRemovedBlocks — cleanup after marking
// ═══════════════════════════════════════════════════════════════════════════════

describe("stripRemovedBlocks — cleanup", () => {
  it("removes blocks with _remove flag", () => {
    const blocks: Record<string, unknown>[] = [
      { id: 'b1', type: 'hero', data: { title: "Good" } },
      { id: 'b2', type: 'text', data: { content: makeTiptap("Good") } },
      { id: 'b3', type: 'bad',  data: {}, _remove: true },
    ];
    stripRemovedBlocks(blocks);
    expect(blocks.length).toBe(2);
    expect(blocks.every((b) => !b._remove)).toBe(true);
  });

  it("handles empty array without error", () => {
    const blocks: Record<string, unknown>[] = [];
    expect(() => stripRemovedBlocks(blocks)).not.toThrow();
    expect(blocks.length).toBe(0);
  });

  it("leaves array unchanged when nothing is flagged", () => {
    const blocks: Record<string, unknown>[] = [
      { id: 'b1', type: 'hero', data: { title: "Good" } },
    ];
    stripRemovedBlocks(blocks);
    expect(blocks.length).toBe(1);
  });

  it("removes all blocks when all are flagged", () => {
    const blocks: Record<string, unknown>[] = [
      { id: 'b1', _remove: true },
      { id: 'b2', _remove: true },
    ];
    stripRemovedBlocks(blocks);
    expect(blocks.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. normalizeBlocks — full pipeline integration
// ═══════════════════════════════════════════════════════════════════════════════

describe("normalizeBlocks — full pipeline", () => {
  it("converts raw string content to Tiptap in a text block", () => {
    const blocks: unknown[] = [
      { id: 'b1', type: 'text', data: { content: "Raw text from AI" } },
    ];
    normalizeBlocks(blocks);
    expect((blocks[0] as any).data.content.type).toBe("doc");
  });

  it("assigns icon fallbacks for features blocks", () => {
    const blocks: unknown[] = [
      {
        id: 'b1', type: 'features',
        data: { features: [{ id: 'f1', title: "Fast delivery" }] },
      },
    ];
    normalizeBlocks(blocks);
    expect((blocks[0] as any).data.features[0].icon).toBeDefined();
  });

  it("removes invalid hero block (missing title) in validate=true mode", () => {
    const blocks: unknown[] = [
      { id: 'b1', type: 'hero',  data: { subtitle: "No title" } }, // invalid
      { id: 'b2', type: 'stats', data: { stats: [{ value: '100', label: 'Users' }] } }, // valid
    ];
    normalizeBlocks(blocks);
    expect(blocks.length).toBe(1);
    expect((blocks[0] as any).type).toBe("stats");
  });

  it("keeps invalid blocks when validate=false", () => {
    const blocks: unknown[] = [
      { id: 'b1', type: 'hero', data: { subtitle: "No title" } }, // would normally be removed
    ];
    normalizeBlocks(blocks, { validate: false });
    expect(blocks.length).toBe(1);
  });

  it("full real-world scenario: mixed blocks with AI errors → clean output", () => {
    const blocks: unknown[] = [
      // Good hero
      { id: 'b1', type: 'hero', data: { title: "Welcome" } },
      // AI wrote raw HTML in text block
      { id: 'b2', type: 'text', data: { content: "<h2>About us</h2><p>We make software.</p>" } },
      // AI wrote raw strings in accordion answers
      {
        id: 'b3', type: 'accordion',
        data: {
          items: [
            { question: "How does it work?", answer: "Connect your systems." },
            { question: "What is the price?", answer: "€49/month." },
          ],
        },
      },
      // Features with missing icons
      {
        id: 'b4', type: 'features',
        data: {
          features: [
            { id: 'f1', title: "Security monitoring" },
            { id: 'f2', title: "Real-time analytics" },
          ],
        },
      },
      // Team with image instead of photo (AI uses wrong field)
      {
        id: 'b5', type: 'team',
        data: {
          members: [{ name: "Anna", role: "CEO", image: "https://example.com/anna.jpg" }],
        },
      },
      // Invalid block — will be removed
      { id: 'b6', type: 'stats', data: { stats: [] } }, // empty array → invalid
    ];

    normalizeBlocks(blocks);

    // invalid stats block removed
    expect(blocks.length).toBe(5);

    // text block: content is now Tiptap
    const textBlock = blocks.find((b: any) => b.id === 'b2') as any;
    expect(textBlock.data.content.type).toBe("doc");

    // accordion: answers are Tiptap
    const accordionBlock = blocks.find((b: any) => b.id === 'b3') as any;
    expect(accordionBlock.data.items[0].answer.type).toBe("doc");
    expect(accordionBlock.data.items[1].answer.type).toBe("doc");

    // features: icons were filled
    const featuresBlock = blocks.find((b: any) => b.id === 'b4') as any;
    expect(featuresBlock.data.features[0].icon).toBeDefined();
    expect(featuresBlock.data.features[0].icon).toBe("ShieldCheck"); // "Security" keyword
    expect(featuresBlock.data.features[1].icon).toBeDefined();

    // team: image → photo
    const teamBlock = blocks.find((b: any) => b.id === 'b5') as any;
    expect(teamBlock.data.members[0].photo).toBe("https://example.com/anna.jpg");
    expect(teamBlock.data.members[0].image).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. Self-correction loop — BLOCK_HINTS examples are retry-safe
//
// The agentic feedback loop works like this:
//   1. FlowPilot sends bad block data
//   2. validateBlockData() returns { valid: false, errors, hint, example }
//   3. FlowPilot uses `example` as block_data on the next attempt
//   4. validateBlockData() must return { valid: true } — otherwise the loop stalls
//
// These tests ensure every BLOCK_HINTS entry is itself a valid block.
// If any example is broken, the retry loop would fail on attempt #2.
// ═══════════════════════════════════════════════════════════════════════════════

describe("Self-correction loop — BLOCK_HINTS examples are retry-safe", () => {
  it.each(Object.entries(BLOCK_HINTS))(
    "%s hint is valid — using it as block_data produces valid=true",
    (blockType, hintData) => {
      const result = validateBlockData(blockType, hintData);
      expect(result.valid, `BLOCK_HINTS["${blockType}"] fails its own validation: ${result.errors.join('; ')}`).toBe(true);
      expect(result.errors).toHaveLength(0);
    },
  );

  it("full retry simulation: invalid → get example → re-validate → valid", () => {
    // Attempt 1: FlowPilot sends wrong data (missing features array)
    const attempt1 = validateBlockData("features", { title: "Our Features", variant: "cards" });
    expect(attempt1.valid).toBe(false);
    expect(attempt1.example).toBeDefined();

    // Attempt 2: FlowPilot uses the example from the error response
    const attempt2 = validateBlockData("features", attempt1.example!);
    expect(attempt2.valid).toBe(true);
    expect(attempt2.errors).toHaveLength(0);
  });

  it("retry simulation: tabs with raw string content → get example → valid", () => {
    // Attempt 1: FlowPilot writes raw strings in tab content
    const attempt1 = validateBlockData("tabs", {
      tabs: [{ id: 'tab-1', title: 'Intro', content: "Just a plain string" }],
    });
    expect(attempt1.valid).toBe(false);
    expect(attempt1.example).toBeDefined();

    // Attempt 2: use the provided example
    const attempt2 = validateBlockData("tabs", attempt1.example!);
    expect(attempt2.valid).toBe(true);
  });

  it("retry simulation: accordion with raw string answers → get example → valid", () => {
    const attempt1 = validateBlockData("accordion", {
      items: [{ question: "How?", answer: "Plain text answer" }],
    });
    expect(attempt1.valid).toBe(false);
    expect(attempt1.example).toBeDefined();

    const attempt2 = validateBlockData("accordion", attempt1.example!);
    expect(attempt2.valid).toBe(true);
  });

  it("retry simulation: bento-grid missing items → get example → valid", () => {
    const attempt1 = validateBlockData("bento-grid", { title: "Grid", variant: "default" });
    expect(attempt1.valid).toBe(false);
    expect(attempt1.example).toBeDefined();

    const attempt2 = validateBlockData("bento-grid", attempt1.example!);
    expect(attempt2.valid).toBe(true);
  });

  it("error response includes both hint string and example object", () => {
    const result = validateBlockData("pricing", { variant: "cards" }); // missing tiers
    expect(result.valid).toBe(false);
    expect(typeof result.hint).toBe("string");
    expect(result.hint).toContain("pricing");
    expect(typeof result.example).toBe("object");
    expect(result.example).not.toBeNull();
  });

  it("blocks without a BLOCK_HINTS entry return a fallback hint string, not undefined", () => {
    // 'hero' has no BLOCK_HINTS entry — but should still return a hint
    const result = validateBlockData("hero", { subtitle: "No title" });
    expect(result.valid).toBe(false);
    expect(typeof result.hint).toBe("string");
    expect(result.hint!.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. Block schema coverage — contracts and tiptap fields align with block-reference
//
// These tests catch drift between block-reference.ts (source of truth),
// normalize-blocks.ts BLOCK_CONTRACTS (validation gate), and normalize-blocks.ts
// TIPTAP_FIELDS / TIPTAP_NESTED_FIELDS (Tiptap conversion).
//
// When a new block type is added, these tests will fail until:
//   1. A BLOCK_CONTRACTS entry is added to normalize-blocks.ts (and the mirror here)
//   2. Any tiptap fields are added to TIPTAP_FIELDS or TIPTAP_NESTED_FIELDS
// ═══════════════════════════════════════════════════════════════════════════════

describe("Block schema coverage — contracts and tiptap fields align with block-reference", () => {
  // Block types where no validation contract is intentional.
  // These auto-fetch their own data and have no meaningful required fields.
  const EXPLICITLY_UNVALIDATED = new Set([
    'separator',    // pure layout — no data fields
    'info-box',     // content-only, string title is optional
    'chat',         // auto-connects to FlowPilot chat endpoint
    'category-nav', // auto-fetches product categories from DB
    'webinar',      // auto-fetches webinar events from DB
  ]);

  it("every importable block type has a BLOCK_CONTRACTS entry or is explicitly exempted", () => {
    const importable = getImportableBlockTypes();
    const contracted = new Set(Object.keys(BLOCK_CONTRACTS));
    const uncovered = importable.filter(t => !contracted.has(t) && !EXPLICITLY_UNVALIDATED.has(t));
    expect(
      uncovered,
      `These importable block types have no validation contract — add them to ` +
      `BLOCK_CONTRACTS in normalize-blocks.ts and the mirror in this test: ${uncovered.join(', ')}`,
    ).toHaveLength(0);
  });

  it("no BLOCK_CONTRACTS entry exists for a non-importable block type (orphan check)", () => {
    const importable = new Set(getImportableBlockTypes());
    const orphaned = Object.keys(BLOCK_CONTRACTS).filter(t => !importable.has(t));
    expect(
      orphaned,
      `Orphaned BLOCK_CONTRACTS entries for non-importable types: ${orphaned.join(', ')}`,
    ).toHaveLength(0);
  });

  // The mirror above is hand-maintained. It HAD silently drifted (it carried
  // `popup` and `latest-posts` entries the runtime gate never had), which is
  // invisible because every other test here reads the mirror, not the source.
  // This asserts the two key sets match, so updating one without the other fails.
  it("the BLOCK_CONTRACTS mirror matches normalize-blocks.ts (no silent drift)", () => {
    const source = readFileSync(
      resolve(__dirname, '../../../supabase/functions/_shared/normalize-blocks.ts'),
      'utf8',
    );
    const seg = source.slice(
      source.indexOf('export const BLOCK_CONTRACTS'),
      source.indexOf('export function validateBlockContracts'),
    );
    const sourceKeys = new Set(
      [...seg.matchAll(/^\s+('?[a-zA-Z][a-zA-Z-]*'?):\s*\{\s*required/gm)]
        .map(m => m[1].replace(/'/g, '')),
    );
    const mirrorKeys = new Set(Object.keys(BLOCK_CONTRACTS));
    const missingFromMirror = [...sourceKeys].filter(k => !mirrorKeys.has(k));
    const missingFromSource = [...mirrorKeys].filter(k => !sourceKeys.has(k));
    expect(
      { missingFromMirror, missingFromSource },
      `BLOCK_CONTRACTS drift between normalize-blocks.ts and this mirror — ` +
      `add to mirror: [${missingFromMirror.join(', ')}]; ` +
      `add to normalize-blocks.ts: [${missingFromSource.join(', ')}]`,
    ).toEqual({ missingFromMirror: [], missingFromSource: [] });
  });

  it("every top-level tiptap field in BLOCK_REFERENCE is covered by TIPTAP_FIELDS", () => {
    const uncovered: string[] = [];
    for (const block of BLOCK_REFERENCE) {
      for (const field of block.fields) {
        if (field.type === 'tiptap' && !TIPTAP_FIELDS.includes(field.name)) {
          uncovered.push(`${block.type}.${field.name}`);
        }
      }
    }
    expect(
      uncovered,
      `These tiptap fields are missing from TIPTAP_FIELDS in normalize-blocks.ts: ${uncovered.join(', ')}`,
    ).toHaveLength(0);
  });

  it("every nested tiptap field in BLOCK_REFERENCE.itemFields is covered by TIPTAP_NESTED_FIELDS", () => {
    const uncovered: string[] = [];
    for (const block of BLOCK_REFERENCE) {
      for (const field of block.fields) {
        if (field.type === 'array' && field.itemFields) {
          for (const sub of field.itemFields) {
            if (sub.type === 'tiptap') {
              const covered = TIPTAP_NESTED_FIELDS.some(
                n => n.blockType === block.type && n.arrayField === field.name && n.itemField === sub.name,
              );
              if (!covered) uncovered.push(`${block.type}.${field.name}[].${sub.name}`);
            }
          }
        }
      }
    }
    expect(
      uncovered,
      `These nested tiptap fields are missing from TIPTAP_NESTED_FIELDS. ` +
      `Add itemFields to the array field in block-reference.ts and re-run sync-block-schema.ts: ${uncovered.join(', ')}`,
    ).toHaveLength(0);
  });

  it("BLOCK_CONTRACTS count matches importable count minus exemptions", () => {
    const importableCount = getImportableBlockTypes().length;
    const contractedCount = Object.keys(BLOCK_CONTRACTS).length;
    const exemptedCount = EXPLICITLY_UNVALIDATED.size;
    expect(contractedCount).toBe(importableCount - exemptedCount);
  });
});
