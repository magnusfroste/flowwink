// process-job-application — turns a website form submission with a CV upload into
// a recruitment application. Chains the existing pieces:
//   extract-pdf-text (CV in Storage → text) → parse-resume (text → profile)
//   → INSERT applications (the AFTER-INSERT trigger then drives the recruitment pipeline).
//
// Best-effort enrichment: if extraction or parsing fails, the application is STILL
// created from the form-provided name/email + resume_url, so no candidate is lost.
// This is the self-hosted CV path — documents stay on the customer's own instance.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getServiceClient } from '../_shared/supabase-clients.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      job_posting_id,
      storage_path,
      candidate_name,
      candidate_email,
      candidate_phone,
      cover_letter,
    } = await req.json();

    if (!job_posting_id) throw new Error('job_posting_id is required');
    if (!storage_path) throw new Error('storage_path (uploaded CV) is required');

    const supabase = getServiceClient();

    // 1. Extract text from the uploaded CV (best-effort).
    let resumeText = '';
    try {
      const { data: ext, error } = await supabase.functions.invoke('extract-pdf-text', {
        body: { storage_path },
      });
      if (error) console.error('extract-pdf-text error:', error.message ?? error);
      else if (ext?.success) resumeText = ext.text || '';
    } catch (e) {
      console.error('extract-pdf-text threw:', e);
    }

    // 2. Parse the resume into a structured profile (best-effort).
    let profile: Record<string, unknown> = {};
    if (resumeText && resumeText.length >= 20) {
      try {
        const { data: parsed, error } = await supabase.functions.invoke('parse-resume', {
          body: { resume_text: resumeText },
        });
        if (error) console.error('parse-resume error:', error.message ?? error);
        else if (parsed?.success) profile = parsed.profile || {};
      } catch (e) {
        console.error('parse-resume threw:', e);
      }
    }

    // 3. Create the application — the candidate applied regardless of parse success.
    const name = candidate_name || (profile.name as string) || 'Unknown applicant';
    const email = candidate_email || (profile.email as string) || '';
    if (!email) throw new Error('candidate_email is required (from the form or the parsed CV)');
    const skills = Array.isArray(profile.skills) ? (profile.skills as string[]) : [];

    const { data: app, error: insErr } = await supabase
      .from('applications')
      .insert({
        job_posting_id,
        candidate_name: name,
        candidate_email: email,
        candidate_phone: candidate_phone || (profile.phone as string) || null,
        resume_url: storage_path,
        cover_letter: cover_letter || null,
        parsed_resume: profile,
        detected_skills: skills,
        ai_summary: (profile.summary as string) || null,
        source: 'website_form',
        stage: 'applied',
      })
      .select('id')
      .single();
    if (insErr) throw new Error(`Create application failed: ${insErr.message}`);

    return new Response(
      JSON.stringify({
        success: true,
        application_id: app.id,
        parsed: Object.keys(profile).length > 0,
        skills_detected: skills.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('process-job-application error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
