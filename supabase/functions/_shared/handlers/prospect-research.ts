// prospect_research — internal skill handler.
//
// Data Collector + CRM Persister. Chains: web-search → web-scrape →
// contact-finder. Persists the company + each Hunter contact (as a lead) so
// the rest of the Sales Intelligence flow (Fit Analysis, AI Compose, …) has
// DB IDs to operate on.
//
// Moved from the standalone `prospect-research` edge function (edge-surface
// refactor B1a, wave 1). One deliberate change: the contact-finder step is now
// a DIRECT LIBRARY CALL (executeContactFinder) instead of an internal HTTP hop
// — the first mesh-edge removed by the refactor. web-search/web-scrape keep
// their HTTP hops until the shared-utility tranche. Response objects unchanged.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { executeContactFinder } from './contact-finder.ts';
import type { HandlerCtx } from './qualify-lead.ts';
import { distillCompany } from './company-distill.ts';

/**
 * Country from the domain's TLD — the cheap, honest signal. The outreach
 * country policy (#89) needs companies.country to tell the seller which
 * regime applies, and a blank field means "check yourself" for every
 * prospect. A ccTLD is strong evidence of where a business operates; a
 * generic TLD (.com/.io/.ai) says nothing, so it stays null rather than
 * guessing. Written only when the column is empty — never over an
 * operator's own entry, same discipline as industry/size.
 */
const TLD_COUNTRY: Record<string, string> = {
  se: 'SE', dk: 'DK', fi: 'FI', no: 'NO', nl: 'NL', fr: 'FR', ie: 'IE',
  be: 'BE', de: 'DE', at: 'AT', it: 'IT', es: 'ES', ch: 'CH', pt: 'PT',
  pl: 'PL', cz: 'CZ', uk: 'GB', us: 'US', ca: 'CA', au: 'AU', nz: 'NZ',
};

function countryFromDomain(domain: string | null): string | null {
  if (!domain) return null;
  const tld = domain.split('.').pop()?.toLowerCase() ?? '';
  return TLD_COUNTRY[tld] ?? null;
}

async function callEdge(ctx: HandlerCtx, functionName: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${ctx.supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ctx.serviceKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`${functionName} failed:`, text);
    return null;
  }
  return res.json();
}

export async function executeProspectResearch(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  ctx: HandlerCtx,
): Promise<Record<string, unknown>> {
  try {
    const { company_name, company_url } = args as { company_name?: string; company_url?: string };

    if (!company_name) {
      return { error: 'company_name is required' };
    }

    console.log(`Researching: ${company_name} (${company_url || 'no URL'})`);

    // Step 1: Web search
    const searchResult = await callEdge(ctx, 'web-search', {
      query: `${company_name} company about`,
      limit: 3,
    });

    // Step 2: Scrape company website
    let scrapeResult = null;
    const scrapeUrl = company_url || searchResult?.results?.[0]?.url;
    if (scrapeUrl) {
      scrapeResult = await callEdge(ctx, 'web-scrape', { url: scrapeUrl, max_length: 5000 });
    }

    // Step 3: Find contacts via Hunter.io (direct library call — no HTTP hop)
    let contactsRaw: any[] = [];
    let domain: string | null = null;
    if (scrapeUrl) {
      try {
        domain = new URL(scrapeUrl.startsWith('http') ? scrapeUrl : `https://${scrapeUrl}`).hostname.replace(/^www\./, '');
      } catch {
        domain = null;
      }
    }
    if (domain) {
      // Read admin-configured contact cap (defaults to 2 to save Hunter credits)
      // One domain search = ONE Hunter credit no matter how many contacts come
      // back — a low cap here throws away contacts already paid for. 10 is what
      // the search returns by default; the Email Finder (per person) is the
      // credit-expensive endpoint and is not used on this path.
      let maxContacts = 10;
      try {
        const { data: cfg } = await supabase
          .from('site_settings')
          .select('value')
          .eq('key', 'integrations')
          .maybeSingle();
        const n = (cfg?.value as any)?.hunter?.config?.maxContacts;
        if (typeof n === 'number' && n > 0) maxContacts = Math.min(n, 25);
      } catch (_) { /* fall through with default */ }

      const contactsRes = await executeContactFinder({
        action: 'domain_search',
        domain,
        limit: maxContacts,
      });
      contactsRaw = (contactsRes as any)?.contacts || [];
    }

    // Step 3.5: Distill what the website says into firmographics (soft-fail).
    // This is what fills industry/size — the exact fields every fit analysis
    // used to flag as missing while the answer sat unread in the scrape.
    const websiteContent: string = scrapeResult?.content || '';
    const searchSnippets = (searchResult?.results || [])
      .map((r: any) => r?.snippet || r?.description || '')
      .filter(Boolean)
      .join('\n');
    const distilled = websiteContent || searchSnippets
      ? await distillCompany(supabase, company_name, websiteContent, searchSnippets)
      : null;

    // Step 4: Persist company (upsert by name+domain)
    let companyId: string | null = null;
    {
      const { data: existing } = await supabase
        .from('companies')
        .select('id')
        .ilike('name', company_name)
        .maybeSingle();

      const companyPayload: Record<string, unknown> = {
        name: company_name,
        domain: domain ?? undefined,
        website: scrapeUrl ?? undefined,
        enriched_at: new Date().toISOString(),
        // Research keeps what it read: distillation first, raw excerpt as
        // fallback. The fit aggregator selects the row wholesale, so this is
        // how "what THEY do" reaches the scoring prompt.
        web_summary: distilled?.summary
          ? `${distilled.summary}\n\nOfferings: ${distilled.main_offerings.join('; ')}`
          : (websiteContent ? websiteContent.slice(0, 4000) : undefined),
        // The raw material is an asset: re-distillable for free, minable for
        // personalization detail, searchable later. Provenance (url +
        // fetched_at) is mandatory — content without its read-date lies.
        ...(websiteContent || searchSnippets ? {
          web_raw: {
            url: scrapeUrl ?? null,
            fetched_at: new Date().toISOString(),
            provider: scrapeResult?.provider ?? null,
            content: websiteContent.slice(0, 20000),
            search_snippets: (searchResult?.results || [])
              .map((r: any) => ({ title: r?.title ?? null, snippet: r?.snippet || r?.description || null, url: r?.url ?? null }))
              .filter((s: any) => s.snippet),
          },
        } : {}),
        ...(distilled?.industry ? { industry: distilled.industry } : {}),
        ...(distilled?.size_estimate ? { size: distilled.size_estimate } : {}),
      };
      const derivedCountry = countryFromDomain(domain);

      if (existing?.id) {
        await supabase.from('companies').update(companyPayload).eq('id', existing.id);
        companyId = existing.id;
        // Master-data discipline: fill the blank, never overwrite a decision.
        if (derivedCountry) {
          await supabase.from('companies')
            .update({ country: derivedCountry })
            .eq('id', existing.id)
            .is('country', null);
        }
      } else {
        const { data: inserted, error } = await supabase
          .from('companies')
          .insert({ ...companyPayload, ...(derivedCountry ? { country: derivedCountry } : {}) })
          .select('id')
          .single();
        if (error) console.error('company insert failed:', error.message);
        companyId = inserted?.id ?? null;
      }

      // The card carries the LATEST STATE (web_summary etc); the research
      // itself is an OBSERVATION and lands on the timeline, so "vad kom
      // researchen fram till?" has a durable, readable answer on the company
      // — not just a snapshot that the next run overwrites (Magnus-fynd,
      // Redeye 2026-08-21). Await + log: a lost observation must be visible.
      if (companyId) {
        const { error: actError } = await supabase.from('activities').insert({
          entity_type: 'company',
          entity_id: companyId,
          activity_type: 'research',
          subject: `Research: ${distilled?.summary ? String(distilled.summary).slice(0, 80) : company_name}`,
          body: distilled?.summary ?? 'Se metadata för hela underlaget.',
          metadata: {
            company_url: company_url ?? null,
            main_offerings: distilled?.main_offerings ?? [],
            potential_pain_points: distilled?.potential_pain_points ?? [],
            sources: (searchResult?.results ?? []).slice(0, 8).map((r: any) => ({ url: r.url, title: r.title })),
            contacts_found: contactsRaw.length,
          },
          created_by: (args as any)._caller_user_id ?? null,
          done_at: new Date().toISOString(),
        });
        if (actError) console.error('research activity insert failed:', actError.message);
      }
    }

    // Step 5: Persist contacts as leads (upsert by email)
    const savedContacts: Array<{
      id: string; email: string; name?: string;
      position?: string | null; seniority?: string | null;
      confidence?: number | null; type?: string | null;
    }> = [];
    for (const c of contactsRaw) {
      const email: string | undefined = c?.email || c?.value;
      if (!email) continue;
      const name = [c?.first_name, c?.last_name].filter(Boolean).join(' ').trim() || c?.name || undefined;

      const { data: existingLead } = await supabase
        .from('leads')
        .select('id')
        .ilike('email', email)
        .maybeSingle();

      const leadPayload: Record<string, unknown> = {
        email,
        name,
        company_id: companyId,
        source: 'prospect-research',
        // A prospecting find is NOT a lead yet — the whole Hunter batch used
        // to land as status 'lead' and drown the Contacts view. 'prospect' is
        // the pre-lead: it sits in the Prospects triage tab until a human
        // promotes it (or deletes it). Existing leads matched by email keep
        // their status — an already-working contact is never demoted.
        status: 'prospect',
        // Trust fields: what Hunter's domain search already told us, kept
        // instead of dropped. Status stays 'unverified' until an explicit
        // verify_email (that one costs a credit). Provenance doubles as the
        // GDPR Art. 14 answer to "where did you get my address".
        email_confidence: typeof c?.confidence === 'number' ? c.confidence : null,
        email_status: 'unverified',
        email_provenance: {
          provider: 'hunter',
          method: 'domain_search',
          type: c?.type ?? null,
          seniority: c?.seniority ?? null,
          // position/department: Hunter gives them, the seller needs them —
          // "Unknown role" next to a decision maker is a self-inflicted blank.
          position: c?.position ?? null,
          department: c?.department ?? null,
          sources_count: c?.sources_count ?? 0,
          found_at: new Date().toISOString(),
        },
      };

      const contactMeta = {
        position: c?.position ?? null,
        seniority: c?.seniority ?? null,
        confidence: typeof c?.confidence === 'number' ? c.confidence : null,
        type: c?.type ?? null,
      };

      if (existingLead?.id) {
        await supabase.from('leads').update({
          company_id: companyId,
          name,
          email_confidence: typeof c?.confidence === 'number' ? c.confidence : undefined,
          email_provenance: leadPayload.email_provenance,
        }).eq('id', existingLead.id);
        savedContacts.push({ id: existingLead.id, email, name, ...contactMeta });
      } else {
        const { data: inserted, error } = await supabase
          .from('leads')
          .insert(leadPayload)
          .select('id')
          .single();
        if (error) {
          console.error('lead insert failed:', error.message);
          continue;
        }
        if (inserted?.id) savedContacts.push({ id: inserted.id, email, name, ...contactMeta });
      }
    }

    // Step 6: Build UI-friendly payload (matches ResearchResult)
    const sources = {
      search: !!searchResult?.results?.length,
      scrape: !!scrapeResult?.content,
      contacts: savedContacts.length > 0,
    };
    // Every source silent means we researched nothing — the CRM row got created
    // either way, so an unqualified success:true reads as "researched, found
    // nothing about them" when the truth is "could not look". Say which.
    const researched = sources.search || sources.scrape || sources.contacts;

    const result = {
      success: true,
      researched,
      // Provenance for the UI (#97 A3): which page grounded the summary, read
      // when. "Distilled by AI" is only honest if we say from what.
      read_from: scrapeResult?.content
        ? { url: scrapeUrl ?? null, fetched_at: new Date().toISOString() }
        : null,
      ...(researched ? {} : {
        warning:
          'No data source responded — this is not a finding about the company. ' +
          'Search, scrape and contact lookup all returned nothing, so nothing was ' +
          'enriched. Check that a search provider (SearXNG/Firecrawl) and ' +
          'HUNTER_API_KEY are configured before treating this as a dead prospect.',
      }),
      company: {
        id: companyId ?? undefined,
        name: company_name,
        domain: domain ?? undefined,
      },
      contacts: savedContacts,
      hunter_contacts_found: savedContacts.length,
      questions_and_answers: [],
      company_summary: {
        name: company_name,
        industry: distilled?.industry ?? undefined,
        size_estimate: distilled?.size_estimate ?? undefined,
        main_offerings: distilled?.main_offerings ?? [],
        potential_pain_points: distilled?.potential_pain_points ?? [],
      },
      // raw collected data preserved for FlowPilot
      _raw: {
        search_results: searchResult?.results || [],
        website_content: scrapeResult?.content?.substring(0, 3000) || null,
        website_metadata: scrapeResult?.metadata || null,
      },
      data_sources: sources,
    };

    console.log(
      `Research complete for ${company_name}: company=${!!companyId}, contacts_saved=${savedContacts.length}`,
    );

    return result;
  } catch (error) {
    console.error('Prospect research error:', error);
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
