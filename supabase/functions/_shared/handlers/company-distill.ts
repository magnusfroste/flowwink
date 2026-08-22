// Shared company distillation — one reader, two doors.
//
// Both roads into "tell me about this company" — Sales Intelligence research
// (prospect_research) and the company page's Enrich button (enrich_company) —
// distill the scraped website through THIS function, so they fill the same
// fields the same way. The seam it closes: research stamped enriched_at, the
// Enrich button then skipped as "already enriched", and neither path had
// filled industry/size — the operator pressed a button and got silence.
//
// Soft-fail by design (Law 4): no AI provider or a bad response returns null
// and the caller persists the raw scrape excerpt instead.

import { resolveAiConfig } from '../ai-config.ts';
import { callAiCompletion } from '../ai-usage-logger.ts';
import { loadBusinessIdentityBlock } from '../domains/business-identity-block.ts';

export interface CompanyDistillation {
  industry: string | null;
  size_estimate: string | null;
  main_offerings: string[];
  potential_pain_points: string[];
  summary: string | null;
}

export async function distillCompany(
  supabase: any,
  companyName: string,
  websiteContent: string,
  searchSnippets: string,
): Promise<CompanyDistillation | null> {
  try {
    // OUR side, in the reading step. The fit analysis has grounded in Business
    // Identity since the our_context fix, but distillation — which decides what
    // is even worth extracting from their site — read the prospect blind. With
    // the ICP present the same page yields sharper pain points: what matters is
    // what OUR offering could act on, not a neutral summary (#89).
    // 'core': the distiller needs our ICP, offering and target industries to
    // decide what is worth extracting from THEIR site. Our own story and
    // testimonials would only invite importing our claims into their profile —
    // the exact failure the instruction below guards against — and this runs
    // once per prospect in bulk enrichment.
    const identity = await loadBusinessIdentityBlock(supabase, 'core');
    const ai = await resolveAiConfig(supabase, 'fast');
    const result = await callAiCompletion({
      supabase,
      source: 'company-distill',
      provider: ai.provider, model: ai.model, apiUrl: ai.apiUrl, apiKey: ai.apiKey,
      metadata: { company: companyName },
      body: {
        messages: [
          {
            role: 'system',
            content:
              'You distill raw website text about a company into firmographics for a CRM. ' +
              'Ground every field in the provided text only — never guess or embellish. ' +
              'Use null/empty when the text does not say.' +
              (identity
                ? identity +
                  '\n\nUse the identity above ONLY to choose what is worth noting about the ' +
                  'prospect — especially which of their operational problems our offering ' +
                  'could plausibly act on. Never import our claims into their profile: every ' +
                  'field must still be true of THEM, grounded in their own text.'
                : ''),
          },
          {
            role: 'user',
            content:
              `Company: ${companyName}\n\nWebsite content:\n${websiteContent.slice(0, 6000)}` +
              (searchSnippets ? `\n\nSearch snippets:\n${searchSnippets.slice(0, 1500)}` : ''),
          },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'save_company_profile',
            description: 'Save the distilled company profile',
            parameters: {
              type: 'object',
              properties: {
                industry: { type: ['string', 'null'], description: 'Primary industry, short (e.g. "Legal services / tax law")' },
                size_estimate: { type: ['string', 'null'], description: 'Size if stated or clearly inferable (e.g. "50-100 employees"), else null' },
                main_offerings: { type: 'array', items: { type: 'string' }, description: 'What they sell, max 6 short items' },
                potential_pain_points: { type: 'array', items: { type: 'string' }, description: 'Operational problems their kind of business plausibly has, max 5, grounded in what the site describes' },
                summary: { type: ['string', 'null'], description: '2-3 sentences: what this company does and for whom' },
              },
              required: ['industry', 'size_estimate', 'main_offerings', 'potential_pain_points', 'summary'],
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'save_company_profile' } },
        temperature: 0.1,
      },
    });
    const toolCall = result?.choices?.[0]?.message?.tool_calls?.[0];
    const parsed = JSON.parse(toolCall?.function?.arguments ?? 'null');
    if (!parsed) return null;
    return {
      industry: parsed.industry ?? null,
      size_estimate: parsed.size_estimate ?? null,
      main_offerings: Array.isArray(parsed.main_offerings) ? parsed.main_offerings : [],
      potential_pain_points: Array.isArray(parsed.potential_pain_points) ? parsed.potential_pain_points : [],
      summary: parsed.summary ?? null,
    };
  } catch (e) {
    console.warn('[company-distill] skipped:', e instanceof Error ? e.message : e);
    return null;
  }
}
