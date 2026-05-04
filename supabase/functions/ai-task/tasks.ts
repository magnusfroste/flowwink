/**
 * AI Task Registry
 *
 * Each entry = one consolidated AI workflow that previously lived in its own
 * edge function. To migrate a thin AI-wrapper:
 *   1. Add a TaskSpec here.
 *   2. Update the caller to invoke `ai-task` with `{ task: '<name>', input: {...} }`.
 *   3. Delete the legacy edge function.
 *
 * Conventions:
 *   - `tier`: 'fast' | 'reasoning' | 'multimodal' (sent to resolveAiConfig)
 *   - `system`/`user`: prompt builders, get the validated input
 *   - `tool`: optional structured-output tool (forces tool-call); preferred
 *     over JSON-mode for reliability
 *   - `parse`: turns the raw AI response into the final task output
 *
 * NEVER add intent-routing here (Law 1). Each task is invoked explicitly by
 * the caller. The task definition itself is just config + prompt.
 */

import { z } from "https://esm.sh/zod@3.23.8";
import type { AiTier } from "../_shared/ai-config.ts";

export interface TaskSpec<I = unknown, O = unknown> {
  name: string;
  description: string;
  tier: AiTier;
  inputSchema: z.ZodType<I>;
  system: (input: I) => string;
  user: (input: I) => string | Array<{ type: string; [k: string]: unknown }>;
  tool?: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
  /** Defaults to extracting tool_call.arguments when `tool` is set,
   *  otherwise message.content. */
  parse?: (raw: any) => O;
  /** Optional: extra defaults merged into the AI request body. */
  options?: { temperature?: number; max_tokens?: number };
}

// ─── analyze_brand ──────────────────────────────────────────────────────────
// NB: pure scrape — no AI. Kept here as an example of a "task" that just
// returns deterministic data. Most callers will go via Firecrawl directly.
// (We're NOT migrating analyze-brand: it isn't an AI task.)

// ─── score_candidate ────────────────────────────────────────────────────────
const scoreCandidateInput = z.object({
  job: z.object({
    title: z.string(),
    department: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    employment_type: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    requirements: z.string().nullable().optional(),
  }),
  candidate: z.object({
    name: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    cover_letter: z.string().nullable().optional(),
    parsed_resume: z.record(z.unknown()).optional(),
  }),
});

const scoreCandidateTask: TaskSpec<z.infer<typeof scoreCandidateInput>> = {
  name: "score_candidate",
  description: "Score a candidate against a job posting (0-100, breakdown, recommendation).",
  tier: "reasoning",
  inputSchema: scoreCandidateInput,
  system: () => `You are an expert technical recruiter. Score a candidate against a job posting using the provided tool. Be honest, specific, and cite evidence from the resume.

Scoring rules:
- Each match_breakdown dimension is 0-100.
- ai_score ≈ skills*0.40 + experience*0.30 + education*0.10 + location*0.10 + culture_fit*0.10
- recommendation: "advance" if ai_score>=75, "hold" if 55-74, "reject" if <55
- confidence_level: "high" / "medium" / "low" based on resume evidence`,
  user: (input) => `## Job Posting
${JSON.stringify(input.job, null, 2)}

## Candidate
${JSON.stringify(input.candidate, null, 2)}`,
  tool: {
    name: "submit_candidate_scoring",
    description: "Return structured candidate scoring",
    parameters: {
      type: "object",
      properties: {
        ai_score: { type: "number" },
        ai_reasoning: { type: "string" },
        ai_summary: { type: "string" },
        matching_skills: { type: "array", items: { type: "string" } },
        missing_skills: { type: "array", items: { type: "string" } },
        match_breakdown: {
          type: "object",
          properties: {
            skills: { type: "number" },
            experience: { type: "number" },
            education: { type: "number" },
            location: { type: "number" },
            culture_fit: { type: "number" },
          },
          required: ["skills", "experience", "education", "location", "culture_fit"],
        },
        recommendation: { type: "string", enum: ["advance", "hold", "reject"] },
        confidence_level: { type: "string", enum: ["high", "medium", "low"] },
      },
      required: ["ai_score", "ai_reasoning", "ai_summary", "match_breakdown", "recommendation", "confidence_level"],
    },
  },
  options: { temperature: 0.2, max_tokens: 2048 },
};

// ─── analyze_receipt ────────────────────────────────────────────────────────
const analyzeReceiptInput = z.object({
  image_url: z.string().url(),
  locale: z.string().default("se"),
});

const analyzeReceiptTask: TaskSpec<z.infer<typeof analyzeReceiptInput>> = {
  name: "analyze_receipt",
  description: "Extract structured data from a receipt image (vendor, total, VAT, category).",
  tier: "multimodal",
  inputSchema: analyzeReceiptInput,
  system: (input) => {
    const localeHint = input.locale === "se"
      ? 'Swedish receipt. VAT is "Moms". Currency SEK. Common rates: 25%, 12%, 6%.'
      : input.locale === "us"
      ? "US receipt. Currency USD."
      : "International receipt — detect currency and tax system.";
    return `You are a receipt analysis expert. Extract structured data from receipt images.
${localeHint}
Always call the extract_receipt_data tool. If unclear, still provide best estimates and set confidence to "low".`;
  },
  user: (input) => [
    { type: "text", text: "Analyze this receipt and extract all data:" },
    { type: "image_url", image_url: { url: input.image_url } },
  ],
  tool: {
    name: "extract_receipt_data",
    description: "Return structured receipt data",
    parameters: {
      type: "object",
      properties: {
        vendor: { type: "string" },
        date: { type: "string" },
        total_cents: { type: "number" },
        vat_cents: { type: "number" },
        vat_rate: { type: "number" },
        currency: { type: "string" },
        category: { type: "string", enum: ["travel", "meals", "office", "software", "representation", "fuel", "accommodation", "other"] },
        items: { type: "array", items: { type: "object", properties: { description: { type: "string" }, amount_cents: { type: "number" } } } },
        suggested_account_code: { type: "string" },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
      },
      required: ["vendor", "total_cents", "currency", "confidence"],
    },
  },
};

// ─── qualify_lead_summary ───────────────────────────────────────────────────
// Pure-AI summary part of the legacy qualify-lead. The deterministic scoring
// stays in qualify-lead/index.ts (it's not AI). FlowPilot can call this task
// after scoring to get a human-readable summary.
const qualifyLeadInput = z.object({
  lead: z.object({
    name: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    company: z.string().nullable().optional(),
    score: z.number(),
    status: z.string().nullable().optional(),
  }),
  recent_activities: z.array(z.object({
    type: z.string(),
    created_at: z.string(),
    metadata: z.record(z.unknown()).optional(),
  })).default([]),
});

const qualifyLeadSummaryTask: TaskSpec<z.infer<typeof qualifyLeadInput>> = {
  name: "qualify_lead_summary",
  description: "Generate a 1-2 sentence engagement summary and next-step suggestion for a lead.",
  tier: "fast",
  inputSchema: qualifyLeadInput,
  system: () => `You are a sales assistant. Given a lead and its activities, return a brief engagement summary and suggested next action. Be concrete.`,
  user: (input) => `Lead: ${JSON.stringify(input.lead)}
Recent activities (latest first):
${JSON.stringify(input.recent_activities, null, 2)}`,
  tool: {
    name: "submit_lead_summary",
    description: "Return lead summary",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "1-2 sentences" },
        suggested_next_action: { type: "string" },
        suggested_status: { type: "string", enum: ["lead", "opportunity", "customer", "lost"] },
      },
      required: ["summary", "suggested_next_action"],
    },
  },
  options: { temperature: 0.3, max_tokens: 400 },
};

// ─── Registry ───────────────────────────────────────────────────────────────
export const TASKS: Record<string, TaskSpec<any, any>> = {
  score_candidate: scoreCandidateTask,
  analyze_receipt: analyzeReceiptTask,
  qualify_lead_summary: qualifyLeadSummaryTask,
};

export function listTasks() {
  return Object.values(TASKS).map((t) => ({
    name: t.name,
    description: t.description,
    tier: t.tier,
  }));
}
