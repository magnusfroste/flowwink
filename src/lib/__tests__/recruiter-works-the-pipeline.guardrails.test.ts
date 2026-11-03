/**
 * A recruiter works the pipeline in the admin with the same paths an agent
 * uses: a stage move goes through move_application_stage (validated stage,
 * reason, the comment on the history row) — the kanban used to UPDATE the
 * row directly while the RPC refused anyone but an admin. Notes are written
 * by the person (RLS: author = themselves) or by an agent
 * (manage_candidate_note). A CV opens as a short-lived link signed for a
 * caller whose own session may read the application — the bucket stays shut.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');

describe('the recruiter and the agent share the pipeline', () => {
  it('a stage move is the RPC, for the recruitment module', () => {
    expect(read('src/hooks/useRecruitment.ts')).toMatch(/supabase\.rpc\('move_application_stage', \{/);
    const mig = read('supabase/migrations/20261031110000_recruiters-work-the-pipeline.sql');
    expect(mig).toMatch(/can_access_module\(auth\.uid\(\), 'recruitment'\)\) then/);
    expect(mig).toMatch(/CREATE POLICY "Recruiters add candidate notes"[\s\S]*author_id = auth\.uid\(\)/);
  });
  it('notes have an agent skill on the same table', () => {
    const mod = read('src/lib/modules/recruitment-module.ts');
    expect(mod).toContain("handler: 'db:candidate_notes'");
  });
  it('the CV link is signed only for a caller who may read the application', () => {
    const fn = read('supabase/functions/process-job-application/index.ts');
    expect(fn).toMatch(/getUserClient\(req\.headers\.get\('Authorization'\)\)/);
    expect(fn).toMatch(/userClient\.from\('applications'\)\.select\('resume_url'\)/);
    expect(fn).toMatch(/createSignedUrl\(path\.slice\('form-uploads\/'\.length\), 600\)/);
  });
  it('the candidate card shows what the candidate sent, notes and the timeline', () => {
    const page = read('src/pages/admin/CandidatePage.tsx');
    for (const c of ['CandidateApplicationCard', 'CandidateNotesCard', 'CandidateTimelineCard', 'RejectCandidateDialog']) expect(page).toContain(`<${c}`);
  });
});
