---
title: "Two-factor authentication for staff"
description: An authenticator app beside the password for the people who run the business — enrolled per person, required per instance, enforced in the database.
category: operators
---

# Two-factor authentication for staff

FlowWink keeps a business's data in its own instance. The human sign-in is then
the door that is left, and a password alone is too little for payroll, the
ledger and the customer register. From 2026-10-29 every staff account can
enroll an **authenticator app** (TOTP — Google Authenticator, Microsoft
Authenticator, 1Password, Bitwarden, Apple Passwords, any of them), and an
instance can **require** it of all staff.

## For a person

Profile → **Two-factor authentication** → *Set up authenticator app*. Scan the
QR code (or type the key), enter the six-digit code once. From then on signing
in asks for the code after the password. Remove it there too, to re-enroll on a
new phone.

## For the admin

Users → **Two-factor authentication**:

- **N of M staff accounts enrolled** — who has done it.
- **Require two-factor authentication for all staff** — the dial. Off on a new
  instance. On: a staff member without an authenticator is asked to enroll at the
  next sign-in and can do nothing else until then; one who enrolled must enter
  the code. The switch is disabled until *you* have enrolled, so it cannot lock
  out the person who flips it.
- **Reset authenticator** (the shield icon on a row) — for a person who lost the
  phone. Their factor is removed; the next sign-in takes the password alone and,
  with the dial on, asks them to enroll again before anything else. Supabase has
  no recovery codes: an admin *is* the recovery. Confirm it is really them: this
  is the path an attacker would ask for.

Customers in the portal are not gated. MFA is for the people who run the business.

## How it is enforced

Supabase Auth issues the session a level: `aal1` after the password, `aal2`
after the code. What Supabase does not do is enforce it, so the enforcement
lives in the role gate every staff read already passes:
`has_role()` and `can_access_module()` ask `session_mfa_ok()` first
(`supabase/migrations/20261029090000_mfa-for-staff.sql`). A staff session that
enrolled a factor, or that the dial requires one of, reads as **nobody** until
it is at `aal2` — however the browser was coaxed past the screen. The screen in
the admin shell (`src/lib/mfa-gate.ts`, the same rule) is the courtesy; the
database is the lock. A person's own profile and own roles stay readable at
`aal1`, which is what lets the shell load and show the challenge.

The service role is never gated, and a check on behalf of another user is not
either: agents through the MCP gateway, cron jobs and definer functions are
untouched. Agent access has its own dials (API keys, the read-only key, trust).

## When the only admin is locked out

The dial is on, the admin reset their phone, nobody else is admin. With the
project's database credentials:

```sql
delete from auth.mfa_factors where user_id = '<the admin''s auth user id>';
```

Then sign in with the password and enroll again. Or turn the dial off:

```sql
update site_settings set value = value || '{"mfaRequiredForStaff": false}'::jsonb where key = 'security';
```
