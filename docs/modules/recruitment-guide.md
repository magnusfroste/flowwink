---
title: "Recruitment — careers page, applications and video interviews"
description: How a role reaches candidates (the /jobs page and the Job Listings block), the one door every application comes through (CV, screening questions, consent, confirmation mail), the candidate card, and interviews on video that the candidate books themselves — for a person in the admin and for an agent over MCP.
category: modules
---

# Recruitment — careers page, applications and video interviews

> Companion to the generated [Recruitment module page](./recruitment.md). Hand-maintained. Written 2026-10-31.

Recruitment (`/admin/recruitment`) runs the whole way from a published role to
a hire: the careers page candidates apply on, the pipeline the team works,
interviews on video that the candidate books themselves, and the hand-off to HR
(`hire_application`). It is stitched from modules that already exist — WebMeet
for the interview room, the calendar, the mail templates, `comms-send` — so a
candidate, a recruiter and an agent all move through the same records.

The end-to-end process, its agent coverage and the **test book** a person walks
are in [Hire-to-Retire](../processes/hire-to-retire.md).

## The promise: AI assists, a person selects

Every application is handled on the business's **own instance**: the
candidate's CV, answers and the team's notes live in its own database and
storage, never in a recruiting SaaS. AI assists — it reads the CV, scores the
fit against the role with its reasons, drafts outreach — and **a person makes
the selection**:

- A flagged screening answer never rejects anyone; it is marked for a person.
- The AI score and its reasoning are advice on the card, not a decision.
- An **agent** — FlowPilot or one over MCP — that moves a candidate (rejecting
  included) or hires them **waits for a person's approval** under
  **Approvals**: `move_application_stage`, `hire_application` and
  `hire_candidate` are `approve`, and a FlowPilot policy keeps them there in
  every autonomy posture (migration `20261031130000`).
- A person in the admin moves, rejects and hires directly — they are the decision.

**Private AI.** The AI that parses and scores is the instance's **System AI**.
Set it to a local model (System AI → Local) and the CV's text is parsed and
scored without leaving the instance. Two honest caveats:

- A CV sent as **Word or text** is read on the instance itself, no AI involved.
  A **PDF** is read by a model that can see documents: when System AI is a
  local text-only model, `extract-pdf-text` falls back to a cloud vision
  provider if one has a key (Gemini, OpenAI, Anthropic). For a fully private
  setup, remove those keys — the application is then still created, the PDF is
  on the card, but its text is not parsed.
- With a cloud provider as System AI, the CV text is sent to that provider for
  parsing and scoring.

---

## 1. A role reaches candidates

Write the role under **Recruitment → Jobs → (role)**: title, department,
location, employment type, description, *What you will do*, requirements,
*What we offer* (one per line) and **screening questions**. Set the status to
**Published** and it is live everywhere at once:

| Where | What the candidate sees |
|---|---|
| `/jobs` | Every published role, filters for department and location when there is more than one |
| **Job Listings** block | The same list on any page you build — the landing page included. Options: heading, intro, one department only, at most N roles, filters on/off |
| `/jobs/<slug>` | The role and its application form |

The public pages follow the visitor's language (the `careers.*` keys under
**Site Settings → Language & text**); the role's own text is what you wrote.

### Screening questions

Each question is *Yes / no*, *Choice* or *Free text*, optionally required. A
yes/no question can **flag** an answer ("No" to "Do you hold a B driving
licence?"). A flagged answer **never rejects anyone** — it is marked on the
candidate's card and in the pipeline, and a person decides. They are stored on
the role as `meta.screening_questions`; an agent writes the same shape through
`manage_job_posting` `screening_questions`.

---

## 2. The one door

Every application — the `/jobs/<slug>` form, the Job Listings block (which
links there), a Form block with a CV field and a Job posting set, and an agent
(`submit_job_application`) — comes through **one** edge function,
`process-job-application`, so the same rules hold for all of them:

1. **The role must be published.** A draft or closed role takes no applications.
2. **Consent.** The candidate ticks that the business may keep the application
   and CV for this role; the text names the company and how long it is kept.
   Without it nothing is stored.
3. **Required screening answers** are given; a flagged answer is recorded.
4. **The CV**: a PDF, Word or text file (at most 10 MB), uploaded to the careers
   area of the private `form-uploads` bucket, or pasted as text. It is read
   (`extract-pdf-text`) and parsed into a profile (`parse_resume`). If parsing
   fails the application is still created — no candidate is lost.
5. **One application per person and role.** Applying again with the same
   e-mail answers with the existing application.
6. **The candidate hears back at once** — template `application_received`, in
   their language, from the company's name.
7. **The recruiter is told** — a notification in the bell and the cockpit's
   *Acted on its own* card, until acknowledged.

### How long an application is kept

`site_settings.recruitment.retentionMonths` (default **12**). The consent text
shows it, and every application is stamped with `meta.consent.retain_until`.
Set it with `manage_site_settings` (key `recruitment`, `{ "retentionMonths": 6 }`).

> **Known gap:** the date is stamped and shown on the card, but nothing deletes
> applications on that date yet. Deleting expired applications is a person's
> (or an agent's) task until a sweep exists.

---

## 3. The pipeline and the candidate card

**Recruitment → Pipeline** is a kanban by stage — *Applied, Screened, Interview
scheduled, Interviewed, Offer sent, Hired* — filtered by role, with *Show
rejected and withdrawn*. Each card shows the AI score, a marker when screening
answers were flagged, and how many days it has sat in its stage. Drag a card to
move it.

A stage move — a drag, the stage menu or *Reject* — goes through
`move_application_stage`, the same function an agent calls, and is logged on
the candidate's timeline.

The **candidate card** (click a candidate):

| Section | What it holds |
|---|---|
| Header | Contact, the role, the AI score and recommendation, *Hire candidate* once interviewed |
| AI Evaluation | Summary and reasoning (`score_candidate`), the match breakdown |
| **Application** | *Open CV* (a 10-minute link, only for someone who may read the application), the screening answers with flagged ones marked, *Why this role*, consent and the delete-by date |
| **Interviews** | Booked interviews, the open invitation, *Book* and *Let them pick* (below) |
| **Notes** | The team's notes with a 1–5 rating; interview feedback lands here too |
| **Timeline** | Every stage move, by a person or an agent, with its comment |

*Reject* asks for a reason (kept on the application) and an optional comment.
The candidate is not mailed from there.

---

## 4. Interviews on video

An interview gets its own **WebMeet room with a waiting room**: the
interviewer is the host and lets the candidate in, so back-to-back interviews
never overlap. It is the same `/meet/<slug>` room a video booking makes — see
[Video meetings](../operators/video-meetings.md). Give a location instead and
it is an on-site interview, no room.

Two ways to set one up, both on the candidate card under **Interviews**:

| | What happens |
|---|---|
| **Book** | Pick the time, length, kind and interviewer. The interview, the room and the calendar event are created; tick *Mail the candidate* and they get the time and the link (template `interview_confirmed`). |
| **Let them pick** | Propose up to ten times. The candidate gets a mail (template `interview_invitation`) with a link to `/interview/<token>` — no account — where they see the times still free, in their language and on their own clock, and book one. They then see *Join the interview* and *Add to calendar* (.ics), and get the confirmation mail. |

Either way the interviewer's other interviews are checked (a time they are
booked is refused or left out), the candidate moves to **Interview scheduled**,
and the event `interview.booked` is emitted for automations. One open
invitation per candidate — a new one replaces the old.

After the interview: **Done — feedback** with a rating moves the candidate to
**Interviewed** and writes the feedback into the notes. **No-show** and
**Cancel** (which ends the room) are next to it.

---

## 5. Who may do what

Everything in the admin answers to the **recruitment** module in **Users →
Role Permissions** — not only the admin role. A person with it reads and
moves candidates, adds notes, opens CVs, books and cancels interviews and
sends invitations. The candidate's links (`/jobs/<slug>`, `/interview/<token>`)
need no account: the published role and the token are the gate, and the
candidate never reads anyone else's data.

---

## 6. An agent does the same

FlowPilot and any external agent over MCP (`mcp-server`, see
[Connect your agent](../operators/connect-your-agent.md)) use the same paths:

| Step | Skill |
|---|---|
| Write and publish a role, with screening questions | `manage_job_posting` |
| Register a candidate who applied by e-mail, phone or at a fair | `submit_job_application` (asks for consent; never assumes it) |
| Score against the role | `score_candidate` |
| Move through the pipeline (waits for a person's approval) | `move_application_stage` |
| Add or read notes | `manage_candidate_note` |
| Let the candidate pick the interview time | `invite_candidate_to_interview` |
| Book a time directly, complete with feedback, cancel | `schedule_interview` |
| Mail the candidate a booked time | `send_interview_confirmation` |
| Offer, references, assessments | `manage_job_offer`, `manage_reference_check`, `manage_candidate_assessment` |
| Hire into HR — employee, contract, onboarding (waits for a person's approval) | `hire_application` |
| How is recruiting going? | `summarize_candidate_pipeline`, `recruitment_analytics` |

Answers carry what the next step needs: `review_url` for a new application,
`invite_url` for an invitation (give it to the recruiter when no mail provider
is configured), `meeting_url` for an interview.

---

## 7. When something does not go out

- **Mails say *simulated*.** No mail provider is configured — see
  [Email](./email-guide.md). The invitation is still created; copy its link from
  the candidate card (*Link*) and send it yourself.
- **Links in mails point to the wrong address.** They are built from the site's
  address (`PUBLIC_SITE_URL`, or `general.siteUrl` under Site Settings).
- **No applications arrive.** Check the role is *Published*; then apply once
  yourself in a private window — the form says exactly what is missing.

---

## Files

| Purpose | Path |
|---|---|
| The one door | `supabase/functions/process-job-application/index.ts` |
| The rule (consent, screening) — shared by the form | `supabase/functions/_shared/recruitment/application-intake.ts` |
| Public pages and form | `src/pages/JobsPage.tsx`, `src/pages/JobDetailPage.tsx`, `src/components/public/careers/` |
| Job Listings block | `src/components/public/blocks/JobListingsBlock.tsx` |
| Interview booking page | `src/pages/InterviewBookingPage.tsx` |
| Interview mails | `supabase/functions/comms-send/interview_mail.ts` |
| Interviews, invitations, booking (SQL) | `supabase/migrations/20261031120000_interviews-meet-on-video.sql` |
| Admin | `src/pages/admin/RecruitmentPage.tsx`, `src/pages/admin/CandidatePage.tsx`, `src/components/admin/recruitment/` |

## See also

- [Hire-to-Retire](../processes/hire-to-retire.md) — the process, agent coverage and the test book
- [Video meetings (WebMeet)](../operators/video-meetings.md) — rooms, the waiting room, TURN
- [HR](./hr.md) — what happens after the hire
