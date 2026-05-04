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
 *   - `load`: (optional) fetches DB context BEFORE the AI call. Receives the
 *     validated input + a service-role supabase client. Returns extra fields
 *     merged into the prompt-input. Use this for tasks that take an entity_id
 *     and need to hydrate it (replaces dedicated wrapper functions).
 *   - `apply`: (optional) writes the AI result back to DB AFTER the call.
 *     Receives the validated input, the parsed result, and a service-role
 *     client. Return value is included in the response under `apply`.
 *
 * NEVER add intent-routing here (Law 1). Each task is invoked explicitly by
 * the caller. The task definition itself is just config + prompt.
 */

import { z } from "https://esm.sh/zod@3.23.8";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { AiTier } from "../_shared/ai-config.ts";

export interface TaskSpec<I = unknown, O = unknown> {
  name: string;
  description: string;
  tier: AiTier;
  inputSchema: z.ZodType<I>;
  /** Optional pre-step: load extra context from DB. Returns a partial that
   *  gets merged into the input passed to system/user/tool. */
  load?: (
    input: I,
    supabase: SupabaseClient,
  ) => Promise<Record<string, unknown>>;
  system: (input: I & Record<string, unknown>) => string;
  user: (
    input: I & Record<string, unknown>,
  ) => string | Array<{ type: string; [k: string]: unknown }>;
  tool?: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
  /** Defaults to extracting tool_call.arguments when `tool` is set,
   *  otherwise message.content. */
  parse?: (raw: any) => O;
  /** Optional post-step: write the parsed result back to DB. */
  apply?: (
    input: I & Record<string, unknown>,
    result: O,
    supabase: SupabaseClient,
  ) => Promise<unknown>;
  /** Optional: extra defaults merged into the AI request body. */
  options?: { temperature?: number; max_tokens?: number };
}

// ─── score_candidate ────────────────────────────────────────────────────────
// Self-contained replacement for the legacy `score-candidate` edge function.
// Caller passes `application_id`; load() hydrates job + candidate; apply()
// writes scoring back to applications.
const scoreCandidateInput = z.object({
  application_id: z.string().uuid(),
});

const scoreCandidateTask: TaskSpec<z.infer<typeof scoreCandidateInput>, any> = {
  name: "score_candidate",
  description:
    "Score a candidate against a job posting. Loads application+job, returns ai_score/breakdown/recommendation, writes back to applications row.",
  tier: "reasoning",
  inputSchema: scoreCandidateInput,
  load: async (input, supabase) => {
    const { data: app, error } = await supabase
      .from("applications")
      .select("*, job_postings(*)")
      .eq("id", input.application_id)
      .single();
    if (error || !app) throw new Error("Application not found");
    const job = (app as any).job_postings;
    if (!job) throw new Error("Job posting not found");
    return {
      job: {
        title: job.title,
        department: job.department,
        location: job.location,
        employment_type: job.employment_type,
        description: job.description,
        requirements: job.requirements,
      },
      candidate: {
        name: app.candidate_name,
        email: app.candidate_email,
        cover_letter: app.cover_letter,
        parsed_resume: app.parsed_resume ?? {},
      },
    };
  },
  system: () =>
    `You are an expert technical recruiter. Score a candidate against a job posting using the provided tool. Be honest, specific, and cite evidence from the resume.

Scoring rules:
- Each match_breakdown dimension is 0-100.
- ai_score ≈ skills*0.40 + experience*0.30 + education*0.10 + location*0.10 + culture_fit*0.10
- recommendation: "advance" if ai_score>=75, "hold" if 55-74, "reject" if <55
- confidence_level: "high" / "medium" / "low" based on resume evidence`,
  user: (input) =>
    `## Job Posting\n${JSON.stringify((input as any).job, null, 2)}\n\n## Candidate\n${JSON.stringify((input as any).candidate, null, 2)}`,
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
  apply: async (input, scoring: any, supabase) => {
    const { error } = await supabase
      .from("applications")
      .update({
        ai_score: scoring.ai_score,
        ai_reasoning: scoring.ai_reasoning,
        ai_summary: scoring.ai_summary,
        matching_skills: scoring.matching_skills ?? [],
        missing_skills: scoring.missing_skills ?? [],
        match_breakdown: scoring.match_breakdown ?? {},
        recommendation: scoring.recommendation ?? null,
        confidence_level: scoring.confidence_level ?? null,
      })
      .eq("id", (input as any).application_id);
    if (error) throw new Error(`Failed to update application: ${error.message}`);
    return { application_id: (input as any).application_id, updated: true };
  },
  options: { temperature: 0.2, max_tokens: 2048 },
};

// ─── analyze_receipt ────────────────────────────────────────────────────────
const analyzeReceiptInput = z.object({
  image_url: z.string().url(),
  locale: z.string().default("se"),
});

const SE_ACCOUNT_MAP: Record<string, string> = {
  travel: "5800",
  meals: "6072",
  office: "6110",
  software: "6540",
  representation: "7690",
  fuel: "5611",
  accommodation: "5810",
  other: "6992",
};

const analyzeReceiptTask: TaskSpec<z.infer<typeof analyzeReceiptInput>, any> = {
  name: "analyze_receipt",
  description: "Extract structured data from a receipt image (vendor, total, VAT, category).",
  tier: "multimodal",
  inputSchema: analyzeReceiptInput,
  system: (input) => {
    const localeHint = (input as any).locale === "se"
      ? 'Swedish receipt. VAT is "Moms". Currency SEK. Common rates: 25%, 12%, 6%.'
      : (input as any).locale === "us"
      ? "US receipt. Currency USD."
      : "International receipt — detect currency and tax system.";
    return `You are a receipt analysis expert. Extract structured data from receipt images.
${localeHint}
Always call the extract_receipt_data tool. If unclear, still provide best estimates and set confidence to "low".`;
  },
  user: (input) => [
    { type: "text", text: "Analyze this receipt and extract all data:" },
    { type: "image_url", image_url: { url: (input as any).image_url } },
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
  parse: (raw: any) => {
    if (raw && !raw.suggested_account_code && raw.category) {
      raw.suggested_account_code = SE_ACCOUNT_MAP[raw.category] ?? "6992";
    }
    return raw;
  },
};

// ─── qualify_lead_summary ───────────────────────────────────────────────────
// Pure-AI summary. Deterministic scoring stays in qualify-lead/index.ts.
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
  user: (input) => `Lead: ${JSON.stringify((input as any).lead)}
Recent activities (latest first):
${JSON.stringify((input as any).recent_activities, null, 2)}`,
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
