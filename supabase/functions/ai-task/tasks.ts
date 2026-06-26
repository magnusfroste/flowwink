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

// ─── generate_blog_from_webinar ──────────────────────────────────────────────
// Closes the webinar → content loop. Loads completed webinar metadata,
// produces a blog draft (title + slug + tiptap-friendly markdown), and
// inserts it into blog_posts as status='draft'.
const generateBlogFromWebinarInput = z.object({
  webinar_id: z.string().uuid(),
  source_text: z.string().optional(), // optional transcript / summary
});

const generateBlogFromWebinarTask: TaskSpec<
  z.infer<typeof generateBlogFromWebinarInput>,
  any
> = {
  name: "generate_blog_from_webinar",
  description:
    "Turn a completed webinar into a blog post draft. Loads webinar metadata; if source_text is omitted, the model writes from title + description + agenda + recording_url. Inserts blog_posts row as status=draft.",
  tier: "reasoning",
  inputSchema: generateBlogFromWebinarInput,
  load: async (input, supabase) => {
    const { data: w, error } = await supabase
      .from("webinars")
      .select(
        "id, title, description, agenda, date, recording_url, cover_image, platform"
      )
      .eq("id", input.webinar_id)
      .maybeSingle();
    if (error || !w) throw new Error("Webinar not found");
    if (w.status && w.status !== "completed") {
      // soft warning — still allow drafting, but flag
    }
    return { webinar: w };
  },
  system: () =>
    `You are a B2B content writer. Convert the supplied webinar into a single, evergreen blog post draft. Rules:
- Title: clear value proposition, 50–70 chars, no clickbait.
- Slug: lowercase kebab-case derived from title, max 60 chars.
- Body: well-structured Markdown — short intro, 3–5 H2 sections drawn from the agenda, a "Key takeaways" bullet list, and a closing CTA paragraph that links to the recording_url if present.
- Excerpt: 1–2 sentences, ≤ 160 chars, suitable as meta-description.
- Tags: 3–6 lowercase topical tags.
Never invent statistics, names, or product features that are not in the source.`,
  user: (input) => {
    const w = (input as any).webinar;
    const txt = (input as any).source_text;
    return `## Webinar metadata\n${JSON.stringify(w, null, 2)}\n\n${
      txt ? `## Source transcript / notes\n${txt}` : "## Source\n(no transcript provided — write from metadata only)"
    }`;
  },
  tool: {
    name: "submit_blog_draft",
    description: "Return a structured blog draft to be inserted as draft.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        slug: { type: "string" },
        excerpt: { type: "string" },
        body_markdown: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["title", "slug", "excerpt", "body_markdown"],
    },
  },
  apply: async (input, result, supabase) => {
    const w = (input as any).webinar;
    const { data, error } = await supabase
      .from("blog_posts")
      .insert({
        title: result.title,
        slug: result.slug,
        excerpt: result.excerpt,
        content: result.body_markdown, // raw markdown — Tiptap loader handles it
        status: "draft",
        cover_image: w?.cover_image ?? null,
        tags: result.tags ?? [],
        source: "webinar",
        source_id: w?.id ?? null,
      })
      .select("id, slug")
      .maybeSingle();
    if (error) {
      // Don't crash the AI call — return error info so caller can decide
      return { inserted: false, error: error.message };
    }
    return { inserted: true, blog_post_id: data?.id, slug: data?.slug };
  },
  options: { temperature: 0.5, max_tokens: 2000 },
};

// ─── ticket_triage ──────────────────────────────────────────────────────────
// Loads the ticket, classifies priority/category, suggests KB articles to
// recommend in the response, and writes the triage result back to the row.
// Pure SaaS-layer reasoning — usable from /admin/tickets button, automations
// (executor=platform), MCP clients, and FlowPilot alike. Does NOT auto-reply
// (drafting customer-facing replies is a separate, opt-in step).
const ticketTriageInput = z.object({
  ticket_id: z.string().uuid(),
});

const ticketTriageTask: TaskSpec<z.infer<typeof ticketTriageInput>, any> = {
  name: "ticket_triage",
  description:
    "Triage a single helpdesk ticket: classify priority + category, suggest up to 3 relevant KB articles, write a 1-sentence internal summary. Loads ticket; writes back priority, category and suggested_kb_article_ids.",
  tier: "fast",
  inputSchema: ticketTriageInput,
  load: async (input, supabase) => {
    const { data: ticket, error } = await supabase
      .from("tickets")
      .select(
        "id, subject, description, priority, category, status, contact_email, contact_name, source",
      )
      .eq("id", input.ticket_id)
      .maybeSingle();
    if (error || !ticket) throw new Error("Ticket not found");

    // Pull a small KB index (title + slug + id) so the model can pick from
    // real article IDs instead of inventing them. Keep cheap: 50 published.
    const { data: kb } = await supabase
      .from("kb_articles")
      .select("id, title, slug, summary")
      .eq("status", "published")
      .order("updated_at", { ascending: false })
      .limit(50);

    return {
      ticket,
      kb_index: (kb ?? []).map((a: any) => ({
        id: a.id,
        title: a.title,
        slug: a.slug,
        summary: a.summary ?? null,
      })),
    };
  },
  system: () =>
    `You are a support-desk triage assistant. Given a ticket and a small index of published KB articles, return a structured triage.

Rules:
- priority: urgent (production down / data loss / security), high (blocking workflow), medium (normal request), low (cosmetic / question).
- category: bug | feature | question | billing | other. Pick "billing" for invoice/payment/subscription issues; "bug" only when the user reports broken behavior; "feature" for explicit requests; "question" for how-to / clarification; otherwise "other".
- suggested_kb_article_ids: pick 0–3 ids from kb_index whose title/summary clearly matches the ticket. NEVER invent ids.
- internal_summary: 1 sentence for the assignee, plain language, no fluff.
- confidence: high if both priority and category are obvious from the text; medium if one is inferred; low if the description is vague.`,
  user: (input) =>
    `## Ticket\n${JSON.stringify((input as any).ticket, null, 2)}\n\n## KB index (id, title, slug, summary)\n${JSON.stringify((input as any).kb_index, null, 2)}`,
  tool: {
    name: "submit_ticket_triage",
    description: "Return structured triage for the ticket",
    parameters: {
      type: "object",
      properties: {
        priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
        category: {
          type: "string",
          enum: ["bug", "feature", "question", "billing", "other"],
        },
        suggested_kb_article_ids: {
          type: "array",
          items: { type: "string" },
          maxItems: 3,
        },
        internal_summary: { type: "string" },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
      },
      required: [
        "priority",
        "category",
        "suggested_kb_article_ids",
        "internal_summary",
        "confidence",
      ],
    },
  },
  apply: async (input, result: any, supabase) => {
    // Filter suggested ids to ones that actually exist in kb_index
    // (defense-in-depth even though the prompt forbids invention).
    const validIds: string[] = (((input as any).kb_index ?? []) as Array<{ id: string }>)
      .map((a) => a.id);
    const filtered = (result.suggested_kb_article_ids ?? []).filter((id: string) =>
      validIds.includes(id),
    );
    const { error } = await supabase
      .from("tickets")
      .update({
        priority: result.priority,
        category: result.category,
        suggested_kb_article_ids: filtered,
      })
      .eq("id", (input as any).ticket_id);
    if (error) throw new Error(`Failed to update ticket: ${error.message}`);
    return {
      ticket_id: (input as any).ticket_id,
      updated: true,
      kb_articles_set: filtered.length,
    };
  },
  options: { temperature: 0.2, max_tokens: 600 },
};

// ─── content_research ─────────────────────────────────────────────────────
// Generative content research. Previously the `research_content` skill was
// wired to a `db:content_research` CRUD list, so it returned the (empty) table
// → always {items:[],count:0}. It's consumed as a GENERATIVE skill (see
// src/hooks/useContentResearch.ts, which drives FlowPilot to "return the raw
// JSON the tool returned" and types it as ContentResearch), so it must produce
// research, not list rows. The tool schema below matches the ContentResearch type.
const contentResearchInput = z.object({
  topic: z.string(),
  target_audience: z.string().optional(),
  industry: z.string().optional(),
  target_channels: z.array(z.string()).default([]),
});

const strList = { type: "array", items: { type: "string" } };

const contentResearchTask: TaskSpec<z.infer<typeof contentResearchInput>, any> = {
  name: "content_research",
  description:
    "Deep content research for a topic — audience insights, content angles, hooks, competitive landscape, recommended structure, SEO. Returns a structured ContentResearch object.",
  tier: "reasoning",
  inputSchema: contentResearchInput,
  system: () =>
    `You are an expert content strategist. Produce deep, specific, non-generic research for the given brief and return it via the submit_content_research tool. Ground angles and hooks in real audience psychology; avoid filler and platitudes. Tailor angles to the requested channels.`,
  user: (input) =>
    `## Brief\n${JSON.stringify({
      topic: (input as any).topic,
      target_audience: (input as any).target_audience ?? null,
      industry: (input as any).industry ?? null,
      target_channels: (input as any).target_channels ?? [],
    }, null, 2)}`,
  tool: {
    name: "submit_content_research",
    description: "Return structured content research",
    parameters: {
      type: "object",
      properties: {
        topic_analysis: {
          type: "object",
          properties: {
            main_theme: { type: "string" },
            sub_topics: strList,
            key_questions: strList,
          },
          required: ["main_theme", "sub_topics", "key_questions"],
        },
        content_angles: {
          type: "array",
          items: {
            type: "object",
            properties: {
              angle: { type: "string" },
              description: { type: "string" },
              why_it_works: { type: "string" },
              hook_example: { type: "string" },
              best_for_channels: strList,
            },
            required: ["angle", "description", "why_it_works", "hook_example", "best_for_channels"],
          },
        },
        audience_insights: {
          type: "object",
          properties: {
            pain_points: strList,
            desires: strList,
            objections: strList,
            language_patterns: strList,
          },
          required: ["pain_points", "desires", "objections", "language_patterns"],
        },
        competitive_landscape: {
          type: "object",
          properties: {
            common_approaches: strList,
            content_gaps: strList,
            differentiation_opportunities: strList,
          },
          required: ["common_approaches", "content_gaps", "differentiation_opportunities"],
        },
        content_hooks: {
          type: "object",
          properties: {
            curiosity_hooks: strList,
            controversy_hooks: strList,
            story_hooks: strList,
            data_hooks: strList,
          },
          required: ["curiosity_hooks", "controversy_hooks", "story_hooks", "data_hooks"],
        },
        recommended_structure: {
          type: "object",
          properties: {
            opening_strategy: { type: "string" },
            key_points: strList,
            closing_strategy: { type: "string" },
            cta_suggestions: strList,
          },
          required: ["opening_strategy", "key_points", "closing_strategy", "cta_suggestions"],
        },
        seo_insights: {
          type: "object",
          properties: {
            primary_keywords: strList,
            secondary_keywords: strList,
            questions_people_ask: strList,
          },
        },
      },
      required: [
        "topic_analysis",
        "content_angles",
        "audience_insights",
        "competitive_landscape",
        "content_hooks",
        "recommended_structure",
      ],
    },
  },
  options: { temperature: 0.7, max_tokens: 4096 },
};

// ─── Registry ───────────────────────────────────────────────────────────────
export const TASKS: Record<string, TaskSpec<any, any>> = {
  score_candidate: scoreCandidateTask,
  analyze_receipt: analyzeReceiptTask,
  qualify_lead_summary: qualifyLeadSummaryTask,
  generate_blog_from_webinar: generateBlogFromWebinarTask,
  ticket_triage: ticketTriageTask,
  content_research: contentResearchTask,
};

export function listTasks() {
  return Object.values(TASKS).map((t) => ({
    name: t.name,
    description: t.description,
    tier: t.tier,
  }));
}
