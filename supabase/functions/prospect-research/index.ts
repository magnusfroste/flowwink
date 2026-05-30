import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient } from '../_shared/supabase-clients.ts';

/**
 * Prospect Research — Data Collector + CRM Persister
 *
 * Chains: web-search → web-scrape → contact-finder
 * Persists the company + each Hunter contact (as a lead) so the rest of
 * the Sales Intelligence flow (Fit Analysis, AI Compose, …) has DB IDs
 * to operate on. Without this the UI shows contacts but every follow-up
 * action ("Run Fit Analysis", "Compose email") silently fails.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function callSkill(functionName: string, body: Record<string, unknown>): Promise<any> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const res = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`${functionName} failed:`, text);
    return null;
  }
  return res.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { company_name, company_url } = await req.json();

    if (!company_name) {
      return new Response(
        JSON.stringify({ error: 'company_name is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Researching: ${company_name} (${company_url || 'no URL'})`);

    // Step 1: Web search
    const searchResult = await callSkill('web-search', {
      query: `${company_name} company about`,
      limit: 3,
    });

    // Step 2: Scrape company website
    let scrapeResult = null;
    const scrapeUrl = company_url || searchResult?.results?.[0]?.url;
    if (scrapeUrl) {
      scrapeResult = await callSkill('web-scrape', { url: scrapeUrl, max_length: 5000 });
    }

    // Step 3: Find contacts via Hunter.io
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
      let maxContacts = 2;
      try {
        const supa = getServiceClient();
        const { data: cfg } = await supa
          .from('site_settings')
          .select('value')
          .eq('key', 'integrations')
          .maybeSingle();
        const n = (cfg?.value as any)?.hunter?.config?.maxContacts;
        if (typeof n === 'number' && n > 0) maxContacts = Math.min(n, 25);
      } catch (_) { /* fall through with default */ }

      const contactsRes = await callSkill('contact-finder', {
        action: 'domain_search',
        domain,
        limit: maxContacts,
      });
      contactsRaw = contactsRes?.contacts || [];
    }

    // Step 4: Persist company (upsert by name+domain)
    const supabase = getServiceClient();
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
      };

      if (existing?.id) {
        await supabase.from('companies').update(companyPayload).eq('id', existing.id);
        companyId = existing.id;
      } else {
        const { data: inserted, error } = await supabase
          .from('companies')
          .insert(companyPayload)
          .select('id')
          .single();
        if (error) console.error('company insert failed:', error.message);
        companyId = inserted?.id ?? null;
      }
    }

    // Step 5: Persist contacts as leads (upsert by email)
    const savedContacts: Array<{ id: string; email: string; name?: string }> = [];
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
        status: 'lead',
      };

      if (existingLead?.id) {
        await supabase.from('leads').update({ company_id: companyId, name }).eq('id', existingLead.id);
        savedContacts.push({ id: existingLead.id, email, name });
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
        if (inserted?.id) savedContacts.push({ id: inserted.id, email, name });
      }
    }

    // Step 6: Build UI-friendly payload (matches ResearchResult)
    const result = {
      success: true,
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
        industry: undefined,
        size_estimate: undefined,
        main_offerings: [],
        potential_pain_points: [],
      },
      // raw collected data preserved for FlowPilot
      _raw: {
        search_results: searchResult?.results || [],
        website_content: scrapeResult?.content?.substring(0, 3000) || null,
        website_metadata: scrapeResult?.metadata || null,
      },
      data_sources: {
        search: !!searchResult?.results?.length,
        scrape: !!scrapeResult?.content,
        contacts: savedContacts.length > 0,
      },
    };

    console.log(
      `Research complete for ${company_name}: company=${!!companyId}, contacts_saved=${savedContacts.length}`,
    );

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Prospect research error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
