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

export async function executeParseResume(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  try {
    const { resume_text } = args as { resume_text?: string };

    if (!resume_text || resume_text.length < 20) {
      return { success: false, error: 'Resume text is required (min 20 chars)' };
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
          temperature: 0.2,
          max_tokens: 4096,
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

    return { success: true, profile: parsed, provider_used: ai.provider };
  } catch (error) {
    console.error('parse-resume error:', error);
    return { success: false, error: (error as Error).message || 'Unknown error' };
  }
}
