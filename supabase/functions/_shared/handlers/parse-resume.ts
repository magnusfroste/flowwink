// parse_resume — internal skill handler.
//
// Extracts structured profile data from resume/CV text via the configured AI
// provider (Anthropic native or OpenAI-compatible). NOT the consultants
// module — this is the CV-artifact parser used by recruitment.
//
// Moved from the standalone `parse-resume` edge function (edge-surface
// refactor B1a, wave 2). Response objects unchanged.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveAiConfig, isAnthropicProvider } from '../ai-config.ts';
import { isOpenAiReasoningModel } from '../ai-providers.ts';

/**
 * The CV text: as given, else fetched from resume_url (the argument, else the
 * application's). A PDF goes through extract-pdf-text; anything else is read
 * as text. Returns null when there is nothing to read.
 */
async function loadResumeText(
  args: { resume_text?: string; resume_url?: string; application_id?: string },
  supabase: SupabaseClient,
): Promise<{ text: string | null; source: string }> {
  if (args.resume_text && args.resume_text.length >= 20) return { text: args.resume_text, source: 'resume_text' };
  let url = args.resume_url ?? null;
  if (!url && args.application_id) {
    const { data, error } = await supabase.from('applications').select('resume_url').eq('id', args.application_id).maybeSingle();
    if (error) throw new Error(`Could not read application ${args.application_id}: ${error.message}`);
    url = data?.resume_url ?? null;
  }
  if (!url) return { text: null, source: 'none' };
  const isPdf = /\.pdf(\?|$)/i.test(url);
  if (isPdf) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const resp = await fetch(`${supabaseUrl}/functions/v1/extract-pdf-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ file_url: url }),
    });
    const out = await resp.json().catch(() => ({}));
    const text = typeof out?.text === 'string' ? out.text : null;
    return { text: text && text.length >= 20 ? text : null, source: 'resume_url:pdf' };
  }
  const resp = await fetch(url);
  if (!resp.ok) return { text: null, source: 'resume_url' };
  const text = (await resp.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return { text: text.length >= 20 ? text : null, source: 'resume_url' };
}

export async function executeParseResume(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  try {
    const { application_id } = args as { application_id?: string };
    const { text: resume_text, source } = await loadResumeText(args as { resume_text?: string; resume_url?: string; application_id?: string }, supabase);

    if (!resume_text) {
      return {
        success: false,
        error: application_id || (args as { resume_url?: string }).resume_url
          ? 'Nothing to parse: pass resume_text (min 20 chars) or a reachable resume_url — on the call or on the application'
          : 'Resume text is required (min 20 chars)',
      };
    }

    let ai;
    try {
      ai = await resolveAiConfig(supabase, 'fast');
    } catch (err: any) {
      return { success: false, error: err.message || 'AI service not configured' };
    }

    const systemPrompt = `You are an expert resume parser. Extract structured profile data from the resume text provided.

Return ONLY valid JSON with this exact structure (use null for fields you cannot determine):
{
  "name": "Full Name",
  "title": "Job Title / Professional Title",
  "email": "email@example.com",
  "phone": "+46...",
  "skills": ["Skill1", "Skill2", "Skill3"],
  "experience_years": 5,
  "summary": "A 2-3 sentence professional summary based on the resume",
  "bio": "A longer paragraph about the person's background",
  "languages": ["English", "Swedish"],
  "certifications": ["AWS Certified", "PMP"],
  "linkedin_url": "https://linkedin.com/in/...",
  "portfolio_url": "https://...",
  "experience_json": [
    {
      "company": "Company Name",
      "role": "Job Title",
      "period": "2020-2023",
      "description": "Brief description of role"
    }
  ],
  "education": [
    {
      "institution": "University Name",
      "degree": "BSc Computer Science",
      "year": "2018"
    }
  ]
}

Rules:
- Extract ALL skills mentioned (technologies, tools, methodologies, soft skills)
- Calculate experience_years from the earliest work experience to now
- Write the summary yourself based on the resume content - do NOT copy verbatim
- If a field is not found in the resume, use null (for strings) or empty array (for arrays)
- For experience_json, include the most recent 5-10 positions
- Return ONLY the JSON, no markdown or explanation`;

    const userMessage = `${systemPrompt}\n\n## Resume Text\n${resume_text.slice(0, 30000)}`;

    let rawText = '';

    if (isAnthropicProvider(ai.apiUrl)) {
      const response = await fetch(ai.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ai.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: ai.model,
          max_tokens: 4096,
          temperature: 0.2,
          messages: [{ role: 'user', content: userMessage }],
        }),
      });
      if (!response.ok) {
        console.error('parse-resume Anthropic error:', await response.text());
        return { success: false, error: 'AI parsing failed' };
      }
      const result = await response.json();
      rawText = result.content?.[0]?.text || '';
    } else {
      // OpenAI-compatible (OpenAI, Gemini OpenAI-compat, Local LLM)
      const response = await fetch(ai.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ai.apiKey}`,
        },
        body: JSON.stringify({
          model: ai.model,
          messages: [{ role: 'user', content: userMessage }],
          // This branch also serves Gemini-compat and Local, so gate on the
          // resolved provider: only OpenAI's reasoning class rejects
          // max_tokens/temperature.
          ...(ai.provider === 'openai' && isOpenAiReasoningModel(ai.model)
            ? { max_completion_tokens: 4096 }
            : { temperature: 0.2, max_tokens: 4096 }),
          response_format: { type: 'json_object' },
        }),
      });
      if (!response.ok) {
        console.error('parse-resume AI error:', await response.text());
        return { success: false, error: 'AI parsing failed' };
      }
      const result = await response.json();
      rawText = result.choices?.[0]?.message?.content || '';
    }

    if (!rawText) {
      return { success: false, error: 'No response from AI' };
    }

    const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    // The result lives on the application — score_candidate reads parsed_resume,
    // match_internal_candidates reads detected_skills. Until 2026-09-17 nothing
    // was written and every scored candidate "had an empty resume".
    let written = false;
    if (application_id) {
      const skills = Array.isArray(parsed?.skills) ? parsed.skills.filter((x: unknown) => typeof x === 'string') : [];
      const { error: upErr } = await supabase
        .from('applications')
        .update({ parsed_resume: parsed, detected_skills: skills })
        .eq('id', application_id);
      if (upErr) return { success: false, error: `Parsed, but could not save to application ${application_id}: ${upErr.message}`, profile: parsed };
      written = true;
    }

    // Text-only callers keep the original shape; the application fields only exist when there is one.
    if (!application_id) return { success: true, profile: parsed, provider_used: ai.provider };
    return { success: true, profile: parsed, provider_used: ai.provider, source, application_id, saved_to_application: written };
  } catch (error) {
    console.error('parse-resume error:', error);
    return { success: false, error: (error as Error).message || 'Unknown error' };
  }
}
