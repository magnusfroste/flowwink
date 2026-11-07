# Security policy

FlowWink is a self-hosted platform: every deployment is one customer's own
Supabase project and frontend. A vulnerability in this repository reaches every
instance that deploys from it, so reports are welcome and taken seriously.

## Reporting a vulnerability

Please report privately — never in a public issue or pull request.

- **GitHub private vulnerability reporting** on this repository
  (Security → Report a vulnerability), when enabled, is the preferred channel:
  it keeps the report private and carries a CVE request when one is warranted.
- Otherwise, email the maintainer at the address on the GitHub profile of
  `magnusfroste`.

Say what you found (the function, route or table), how to reproduce it against
your own throwaway instance, and your assessment of the impact. Please test only
against instances you run yourself — never against flowwink.com, sandbox or any
customer's site.

## What to expect

- An acknowledgement within 3 working days.
- A fix in `main` as fast as the finding allows; a security fix is a small PR
  with its own guardrail test, so the class of bug cannot return silently
  (`src/lib/__tests__/*.guardrails.test.ts`).
- Coordinated disclosure: we aim to release before 90 days and will agree the
  timing of any publication and CVE with you. Credit in the CHANGELOG unless you
  prefer otherwise.

## Scope notes for researchers

- Edge functions deploy with `verify_jwt = false` and verify their caller
  in-body; `docs/guides/security.md` explains why, and the guard
  `public-functions-verify-their-caller` lists which functions are public by
  design and why.
- A fetch of a caller-supplied URL goes through `_shared/net/outbound-url.ts`
  (scheme, private and internal addresses, redirects); a raw `fetch` of a
  caller URL anywhere in `supabase/functions` fails the guard
  `outbound-urls-are-public`.
- The service-role key never reaches a browser; tables carry row-level security.

## Deployments you run

A fix in `main` reaches your instance through your own deploy
(`docs/operators/provisioning-and-updates.md`). Security fixes are listed under
**Security** in `CHANGELOG.md`.
