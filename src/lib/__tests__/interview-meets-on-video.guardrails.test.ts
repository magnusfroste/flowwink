/**
 * An interview is booked one way — _schedule_interview_core — whether the
 * recruiter books it, an agent does (schedule_interview), or the candidate
 * picks one of the proposed times (book_interview_slot). That one way makes
 * the WebMeet room (waiting room on, the interviewer as host), the calendar
 * event and the interview, and moves the candidate on. Verified on sandbox in
 * a rolled-back transaction (2026-10-31): invite → anon view (past slot
 * dropped) → anon book → idempotent re-book → second time refused → room with
 * waiting room, stage interview_scheduled, one calendar event.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');
const sql = read('supabase/migrations/20261031120000_interviews-meet-on-video.sql');

describe('one way to book an interview', () => {
  it('schedule and the candidate\'s pick both call the core', () => {
    expect(sql).toMatch(/RETURN public\._schedule_interview_core\(p_application_id, p_kind, p_start, p_end, p_interviewer_id,/);
    expect(sql).toMatch(/v_res := public\._schedule_interview_core\(v_inv\.application_id/);
  });
  it('the core makes a WebMeet room with a waiting room unless a place is given', () => {
    expect(sql).toMatch(/INSERT INTO public\.webmeet_rooms \(slug, name, host_user_id, max_participants, expires_at, waiting_room\)/);
    expect(sql).toMatch(/v_url := '\/meet\/' \|\| v_slug;/);
  });
  it('the core is not callable from outside; the gates are the module, the token', () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\._schedule_interview_core\([^)]*\) FROM PUBLIC, anon, authenticated;/);
    expect(sql).toMatch(/can_access_module\(auth\.uid\(\), 'recruitment'\)\) THEN\s+RAISE EXCEPTION 'Requires the recruitment module/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.book_interview_slot\(uuid, timestamptz\) TO anon/);
  });
  it('booking checks the time was proposed and is idempotent', () => {
    expect(sql).toMatch(/NOT \(p_start = ANY \(v_inv\.slots\)\)/);
    expect(sql).toMatch(/'already_booked', true/);
  });
});

describe('the mail, the page and the agent', () => {
  it('comms-send carries the three kinds; the public one reads the recipient from the record', () => {
    const index = read('supabase/functions/comms-send/index.ts');
    expect(index).toMatch(/interview_invitation: 'recruitment',/);
    expect(index).toMatch(/interview_booked: interviewBooked,/);
    const mail = read('supabase/functions/comms-send/interview_mail.ts');
    expect(mail).toMatch(/select\('id, status, interview_id, confirmation_sent_at'\)\.eq\('token', token\)/);
    expect(mail).toContain("renderMailTemplate(db, 'interview_confirmed'");
  });
  it('the candidate\'s page books through the RPC and asks for the confirmation', () => {
    const page = read('src/pages/InterviewBookingPage.tsx');
    expect(page).toContain("supabase.rpc('book_interview_slot'");
    expect(page).toContain('comms-send?kind=interview_booked');
    expect(read('src/App.tsx')).toContain('{ path: "/interview/:token", element: <InterviewBookingPage /> }');
  });
  it('an agent has invite and confirm', () => {
    const mod = read('src/lib/modules/recruitment-module.ts');
    expect(mod).toMatch(/name: 'invite_candidate_to_interview',[\s\S]*?handler: 'edge:comms-send'/);
    expect(mod).toMatch(/name: 'send_interview_confirmation',[\s\S]*?handler: 'edge:comms-send'/);
    expect(read('supabase/functions/comms-send/index.ts')).toMatch(/invite_candidate_to_interview: 'interview_invitation'/);
  });
});
