// process-job-application — the ONE way an application enters the pipeline:
// the careers page, the job-listings block, a FormBlock with a CV field, and
// (through submit_job_application) FlowPilot or an MCP agent all land here.
//
//   validate (published posting, consent, screening answers — application-intake.ts)
//   → CV text (extract-pdf-text on the uploaded file, or pasted text)
//   → parse_resume (text → profile)
//   → INSERT applications (the AFTER-INSERT trigger emits application.received)
//   → the candidate's confirmation mail (template application_received, their language)
//   → the recruiter is told (notify row: the cockpit card and the bell)
//
// Best-effort enrichment: if extraction or parsing fails, the application is
// STILL created from what the candidate typed, so no candidate is lost. The CV
// stays on the customer's own instance.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getServiceClient } from '../_shared/supabase-clients.ts';
import { executeParseResume } from '../_shared/handlers/parse-resume.ts';
import { assessApplication, plausibleEmail, safeUploadPath, screeningQuestionsOf } from '../_shared/recruitment/application-intake.ts';
import { cleanLanguageTag, renderMailTemplate } from '../_shared/email/mail-template.ts';
import { loadOrgName } from '../_shared/org-name.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const clip = (v: unknown, n: number): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s.slice(0, n) : null;
};

/** Months a rejected or idle application is kept (Recruitment settings), default 12. */
async function retentionMonths(supabase: ReturnType<typeof getServiceClient>): Promise<number> {
  const { data, error } = await supabase.from('site_settings').select('value').eq('key', 'recruitment').maybeSingle();
  if (error) console.warn('[process-job-application] recruitment settings unreadable:', error.message);
  const n = Number((data?.value as { retentionMonths?: unknown } | null)?.retentionMonths);
  return Number.isFinite(n) && n >= 1 && n <= 60 ? Math.round(n) : 12;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // GET: what the application form shows before anyone submits — how long the
  // application is kept, read from the same setting the INSERT stamps, so the
  // consent text and the stored retain_until can never disagree.
  if (req.method === 'GET') {
    try {
      return json({ retention_months: await retentionMonths(getServiceClient()) });
    } catch (e) {
      return json({ retention_months: 12, error: (e as Error).message });
    }
  }

  try {
    const body = await req.json();
    const jobPostingId = clip(body.job_posting_id, 64);
    if (!jobPostingId) return json({ success: false, code: 'MISSING_REQUIRED_PARAMETER', error: 'job_posting_id is required' }, 400);

    const supabase = getServiceClient();

    // The role must be open: a visitor cannot apply to a draft or a closed role.
    const { data: posting, error: postErr } = await supabase
      .from('job_postings').select('id, title, status, meta, hiring_manager_id').eq('id', jobPostingId).maybeSingle();
    if (postErr) throw new Error(`Job posting lookup failed: ${postErr.message}`);
    if (!posting || posting.status !== 'published') {
      return json({ success: false, code: 'NOT_FOUND', error: 'This role is not open for applications.' }, 404);
    }

    const intake = assessApplication({
      questions: screeningQuestionsOf(posting.meta),
      answers: body.screening_answers,
      consent: body.consent,
    });
    if (!intake.ok) return json({ success: false, code: intake.code, error: intake.message, missing: intake.missing }, 400);

    const storagePath = body.storage_path ? safeUploadPath(body.storage_path) : null;
    if (body.storage_path && !storagePath) {
      return json({ success: false, code: 'INVALID_INPUT', error: 'storage_path must be a file uploaded to the careers upload area.' }, 400);
    }

    // 1. The CV's text: the uploaded file (best-effort), else what was pasted.
    let resumeText = clip(body.resume_text, 30000) ?? '';
    if (storagePath) {
      try {
        const { data: ext, error } = await supabase.functions.invoke('extract-pdf-text', { body: { storage_path: storagePath } });
        if (error) console.error('extract-pdf-text error:', error.message ?? error);
        else if (ext?.success && ext.text) resumeText = String(ext.text);
      } catch (e) {
        console.error('extract-pdf-text threw:', e);
      }
    }

    // 2. The CV as a profile (best-effort).
    let profile: Record<string, unknown> = {};
    if (resumeText.length >= 20) {
      try {
        const parsed = await executeParseResume(supabase, { resume_text: resumeText });
        if (parsed?.success) profile = (parsed.profile as Record<string, unknown>) || {};
        else console.error('parse_resume error:', parsed?.error);
      } catch (e) {
        console.error('parse-resume threw:', e);
      }
    }

    const name = clip(body.candidate_name, 200) || clip(profile.name, 200) || 'Unknown applicant';
    const email = (clip(body.candidate_email, 254) || clip(profile.email, 254) || '').toLowerCase();
    if (!plausibleEmail(email)) {
      return json({ success: false, code: 'INVALID_INPUT', error: 'A valid e-mail address is required.' }, 400);
    }

    // One application per person and role: a second submit is the same candidate.
    const { data: existing, error: dupErr } = await supabase
      .from('applications').select('id').eq('job_posting_id', jobPostingId).ilike('candidate_email', email).limit(1);
    if (dupErr) throw new Error(`Duplicate check failed: ${dupErr.message}`);
    if (existing?.length) {
      return json({ success: true, duplicate: true, application_id: existing[0].id });
    }

    const lang = cleanLanguageTag(body.lang);
    const months = await retentionMonths(supabase);
    const now = new Date();
    const retainUntil = new Date(now);
    retainUntil.setMonth(retainUntil.getMonth() + months);
    const skills = Array.isArray(profile.skills) ? (profile.skills as string[]) : [];

    // 3. The application. Client-side the id is unknown (a visitor may not read
    // the row back), so the server answers with it.
    const { data: app, error: insErr } = await supabase
      .from('applications')
      .insert({
        job_posting_id: jobPostingId,
        candidate_name: name,
        candidate_email: email,
        candidate_phone: clip(body.candidate_phone, 40) || clip(profile.phone, 40),
        linkedin_url: clip(body.linkedin_url, 400),
        resume_url: storagePath,
        cover_letter: clip(body.cover_letter, 10000),
        parsed_resume: Object.keys(profile).length ? profile : (resumeText ? { raw_text: resumeText.slice(0, 20000) } : {}),
        detected_skills: skills,
        ai_summary: clip(profile.summary, 4000),
        source: clip(body.source, 40) || 'careers_page',
        stage: 'applied',
        meta: {
          screening_answers: intake.answers,
          knockouts: intake.knockouts,
          consent: { given_at: now.toISOString(), retain_until: retainUntil.toISOString().slice(0, 10) },
          ...(lang ? { lang } : {}),
        },
      })
      .select('id')
      .single();
    if (insErr) throw new Error(`Create application failed: ${insErr.message}`);

    const orgName = await loadOrgName(supabase, '');

    // 4. The candidate hears back at once, in their language.
    try {
      const firstName = name.split(/\s+/)[0] ?? '';
      const mail = await renderMailTemplate(supabase, 'application_received', lang, () => ({
        candidate_name: firstName,
        job_title: posting.title ?? '',
        site_name: orgName,
      }), 'process-job-application');
      const { error: mailErr } = await supabase.functions.invoke('email-send', {
        body: {
          to: email,
          subject: mail?.subject ?? `We received your application — ${posting.title}`,
          html: mail?.html ?? `<p>Hi ${firstName},</p><p>Thank you for applying for <strong>${posting.title}</strong>. We have received your application and will be in touch.</p><p>${orgName}</p>`,
          source: 'process-job-application',
          related_entity_type: 'application',
          related_entity_id: app.id,
        },
      });
      if (mailErr) console.warn('[process-job-application] confirmation mail not sent:', mailErr.message ?? mailErr);
    } catch (e) {
      console.warn('[process-job-application] confirmation mail failed:', (e as Error).message);
    }

    // 5. A person is told: the notify queue (cockpit card + bell) until acknowledged.
    const { error: noteErr } = await supabase.from('agent_activity').insert({
      agent: 'system',
      skill_name: 'process-job-application',
      input: { application_id: app.id, job_posting_id: jobPostingId },
      output: { application_id: app.id, candidate_name: name, job_title: posting.title, knockouts: intake.knockouts },
      status: 'success',
      log_type: 'notify',
      log_message: `New application: ${name} — ${posting.title}${intake.knockouts.length ? ` (flagged: ${intake.knockouts.join(', ')})` : ''}`,
    });
    if (noteErr) console.warn('[process-job-application] recruiter not notified:', noteErr.message);

    return json({
      success: true,
      application_id: app.id,
      parsed: Object.keys(profile).length > 0,
      skills_detected: skills.length,
      knockouts: intake.knockouts,
      review_url: `/admin/recruitment?application=${app.id}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('process-job-application error:', message);
    return json({ success: false, error: message }, 500);
  }
});
