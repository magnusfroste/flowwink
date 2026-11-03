---
title: "Users, access and invitations"
description: Supabase Auth's built-in mailer means a shared sender, no branding, likely spam placement and a silent couple-per-hour cap. 
category: operators
---

# Users, access and invitations

> How a colleague or a customer gets into a FlowWink instance, what they can
> reach, and what happens when they leave. Reworked 2026-08-07.

## Two paths in, and they are honest about what they need

| Path | Edge function | Needs email? | Use for |
|---|---|---|---|
| **Create user** | `create-user` | No — admin sets a password and hands it over | Air-gapped setup, first admin, no mail rail yet |
| **Invite colleague** | `invite-colleague` | Yes — a working email integration | Normal onboarding of staff |
| **Portal invite** | `_shared/provision-portal-account.ts` | Yes | A customer who signed a contract or bought a service |

### Invitations go through your own email rail

Supabase Auth's built-in mailer means a shared sender, no branding, likely spam
placement and a silent couple-per-hour cap. So invites use
`generateLink({ type: 'invite' })` — which creates the auth user and the token but
sends **nothing** — and the mail then goes out through `email-send` like every
other message: Composio / SMTP / Resend per the operator's configuration, from
their verified domain, in the branded shell.

Same rule as everywhere: modules never talk to a mail provider directly.

When no provider is configured, `email-send` answers `simulated: true`. Treating
that as "invitation sent" leaves a colleague waiting for a mail that never
existed, so the dialog says **"Account created — email not sent"**, explains why,
and hands over the invitation link to pass on manually. Role reconciliation runs
regardless of the mail branch — an account without its role is worse than one
without its email.

### Roles at invite time

The role picker offers `admin` + the eight functional roles, each with its own
description. Both the edge function and the dialog pin the invitable list to
`FUNCTIONAL_ROLES` in `src/types/cms.ts`, with a guardrail comparing them, so a
new functional role cannot leave the invite path behind.

On a **fresh** invite the signup trigger's fail-closed `customer` seed is removed,
so the colleague is born as exactly their function. Granting a role to an
**existing** account never strips its other roles. Staff invites redirect to
`/admin`, not the customer portal.

### Customers land on `/account/activate`, not a login form

The invited account already exists (email bound, `customer` role, service
attached). A signup form would let the customer type any address and orphan it.
The activate page consumes the one-time invite token into a temporary session,
shows the bound email **read-only**, and only asks for a password. No valid
session → an honest "link expired" dead end.

### An employee reaches their own pages in the portal

A colleague invited as an employee (`invite-employee`: roles `employee` +
`writer`, linked to their row in HR) is staff, so the customer portal sends
them to `/admin` — **except to their own pages**: `/account/leave`,
`/payslips`, `/contracts`, `/expenses`, `/attendance`, `/performance`,
`/skills`, `/team` (a manager) and `/agents` (`isStaffSelfService` in
`src/lib/staff-self-service.ts`). They get there from *My employment* in the
person menu; the portal shows them only those pages and *Back to work*. Until
2026-11-01 every one of them was bounced, so the self-service HR had built had
no way in.

## What a role can reach

Two axes, kept separate (Odoo separates them; we should not merge them):

- **Vertical** — which modules/pages a functional role may open
  (`role_module_access`).
- **Horizontal** — which rows. Never restricted; see
  [Ownership & coverage](../architecture/ownership-and-coverage.md).

### Hiding is not gating

The sidebar hid links a role could still reach by typing the URL.
`src/lib/admin-route-access.ts` + `AdminLayout` now resolve the pathname against
the **same** `navigationGroups` the sidebar renders from, so the two surfaces
cannot drift, and guardrails run against the real navigation data.

Known inconsistency, pinned rather than papered over: the Quotes nav item is
gated by module id `invoicing` while the role-matrix vocabulary says `quotes` —
a matrix grant of `quotes` does not open `/admin/quotes`.

FlowChat is admin-only in the nav, matching `agent-operate`, which runs skills
with the service role and already gated on `has_role(admin)`.

### The empty-page failure mode

A salesperson opened Newsletter — granted in the matrix — and saw zero
subscribers. No error, no "access denied", just emptiness: the worst failure
mode, because the system merely looks broken.

Root cause: 64 tables gated reads on `approver OR admin`. `approver` is a legacy
CMS role, is not in `FUNCTIONAL_ROLES`, is never granted by the matrix, and zero
users hold it — so those tables were admin-only in practice while the matrix
granted their pages to eight roles. Verified live as the sales user: 0 of 7
leads, 0 of 5 deals, 0 of 2 companies, `quotes` unreadable.

Fix (migrations `20260808260000`, `…270000`, `…280000`): `is_staff()` **read**
paths across the operational tables, with `admin + hr` for HR-sensitive tables
(assessments, offers, interviews, references) and `admin + accounting` for
finance (bank transactions, budgets, vendor invoices, reconciliation). Writes
untouched. The legacy `approver` policies stay — they cost nothing while nobody
holds the role; retiring it is its own task.

**Method note worth keeping:** policy *text* analysis lied twice (skipped every
qual containing "OR", then flagged healthy tables as broken). Only
`SET LOCAL ROLE authenticated` with JWT claims told the truth. Verify behaviour,
not policy prose. The same sweep also found policies **named** for the service
role but with `roles={public}` and `qual=true` — admitting everyone except the
role they were named after (worst case: `federation_peer_missions`, i.e. prompt
injection by database row). Names lie in both directions; read quals.

### The role the panel showed

An account born without signup metadata gets `customer` (fail-closed, correct).
After an admin grants `sales`, two UI layers used to turn that into a trap:
primary role was "admin else first row" (insertion order → `customer` forever),
and the manage-roles popover omitted `customer`, so it had no checkbox and could
not be removed. Primary is now **admin → any functional role → customer last**,
and `customer` is listed. The trigger is unchanged.

## Deleting a user

`delete-user` (admin-gated, audit-logged; refuses self-deletion and the last
admin) exists because the client cannot hold the service key.

Deletion **detaches, never erases business rows.** Two FK families reference a
person: `profiles` and `auth.users` directly. A hardcoded column list was right
the day it was written and wrong by review time, so `detach_user_references()`
walks `pg_constraint` at execution time — every `NO ACTION` FK to either table,
nulled when nullable, reported by name when `NOT NULL`. Authorship is nulled,
never reassigned: history keeps the row and loses the name. Guarded
service-role-or-admin with no `postgres` escape hatch.

One cascade was defused on the way: `flowtable_bases.owner_id` was
`NOT NULL ON DELETE CASCADE` through tables → fields → records, so deleting an
admin would have silently destroyed the base its data lived in. Now nullable +
`SET NULL`, and the owner-only UPDATE/DELETE policies gained an admin path
(an ownerless base was previously unmanageable by anyone).

## Files

| Purpose | Path |
|---|---|
| Invite / create / delete | `supabase/functions/invite-colleague`, `create-user`, `delete-user` |
| Portal invite helper | `supabase/functions/_shared/provision-portal-account.ts` |
| Route guard | `src/lib/admin-route-access.ts`, `src/components/admin/AdminLayout.tsx` |
| Admin UI | `src/pages/admin/UsersPage.tsx`, `src/components/admin/InviteColleagueDialog.tsx` |
| Customer activation | `src/pages/account/ActivateAccountPage.tsx` |
| Guardrails | `invite-colleague`, `detach-user-references`, `admin-route-access`, `role-manageability`, `account-portal-access` |
