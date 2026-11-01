/**
 * Every application comes through ONE door — process-job-application — so
 * consent, screening answers, the CV parse, the candidate's confirmation mail
 * and the recruiter's notification hold for the careers page, the
 * job-listings block, a FormBlock with a CV field and an agent alike
 * (submit_job_application). The careers page used to INSERT straight into
 * applications with .select() and failed every candidate (2026-10-31).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  assessApplication, safeUploadPath, screeningQuestionsOf,
} from '../../../supabase/functions/_shared/recruitment/application-intake';

const read = (p: string) => readFileSync(p, 'utf8');

describe('the intake rule', () => {
  const questions = screeningQuestionsOf({
    screening_questions: [
      { id: 'licence', label: 'B driving licence?', type: 'yes_no', required: true, knockout: 'no' },
      { id: 'start', label: 'When can you start?', type: 'text' },
      { id: 'shift', label: 'Shift', type: 'choice', options: ['day', 'night'] },
      { id: '', label: 'broken', type: 'yes_no' },
      { id: 'x', label: 'unknown type', type: 'video' },
    ],
  });

  it('keeps only well-formed questions', () => {
    expect(questions.map((q) => q.id)).toEqual(['licence', 'start', 'shift']);
  });
  it('refuses without consent', () => {
    expect(assessApplication({ questions, answers: { licence: 'yes' }, consent: false })).toMatchObject({ ok: false, code: 'CONSENT_REQUIRED' });
  });
  it('refuses a missing required answer and names it', () => {
    expect(assessApplication({ questions, answers: {}, consent: true })).toMatchObject({ ok: false, code: 'ANSWER_REQUIRED', missing: ['B driving licence?'] });
  });
  it('a knockout answer flags, it never rejects', () => {
    const r = assessApplication({ questions, answers: { licence: 'nej' }, consent: true });
    expect(r).toMatchObject({ ok: true, knockouts: ['B driving licence?'], answers: { licence: 'no' } });
  });
  it('a choice outside its options is invalid', () => {
    expect(assessApplication({ questions, answers: { licence: 'yes', shift: 'evening' }, consent: true })).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });
  it('the service role reads only the careers upload area', () => {
    expect(safeUploadPath('form-uploads/applications/abc/cv.pdf')).toBe('form-uploads/applications/abc/cv.pdf');
    expect(safeUploadPath('documents/payroll.pdf')).toBeNull();
    expect(safeUploadPath('form-uploads/applications/../secret.pdf')).toBeNull();
  });
});

describe('every surface uses the door', () => {
  it('the careers page renders the shared form and inserts nothing itself', () => {
    const page = read('src/pages/JobDetailPage.tsx');
    expect(page).toContain('<ApplicationForm posting={job} />');
    expect(page).not.toMatch(/from\('applications'\)/);
  });
  it('the shared form sends to process-job-application with consent and screening answers', () => {
    const lib = read('src/lib/careers.ts');
    expect(lib).toContain('/functions/v1/process-job-application');
    const form = read('src/components/public/careers/ApplicationForm.tsx');
    expect(form).toMatch(/screening_answers: check\.answers,\s*consent: true,/);
  });
  it('a FormBlock CV lands in the careers upload area and carries consent', () => {
    const block = read('src/components/public/blocks/FormBlock.tsx');
    expect(block).toMatch(/data\.jobPostingId \? 'applications\/' : ''/);
    expect(block).toMatch(/consent: data\.fields\.some\(\(f\) => f\.type === 'checkbox'/);
  });
  it('the edge function holds the rule, mails the candidate and tells the recruiter', () => {
    const fn = read('supabase/functions/process-job-application/index.ts');
    expect(fn).toContain('assessApplication({');
    expect(fn).toContain("renderMailTemplate(supabase, 'application_received'");
    expect(fn).toMatch(/log_type: 'notify'/);
    expect(fn).toMatch(/status !== 'published'/);
  });
  it('an agent has the same door', () => {
    const mod = read('src/lib/modules/recruitment-module.ts');
    expect(mod).toContain("handler: 'edge:process-job-application'");
  });
});
