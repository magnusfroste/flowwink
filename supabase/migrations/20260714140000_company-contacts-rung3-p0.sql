-- Identity ladder rung 3 (B2B) — P0 keystone. Plumbing only; nothing customer-facing.
-- Design + decisions: docs/architecture/identity-ladder-rung3-b2b.md.
--
-- The one primitive rung 3 is built on: a contact ↔ company ↔ role membership. It IS the
-- security boundary — provisioned deliberately (staff first), widened only explicitly
-- (visibility_scope), and the thing every company-scoped skill filters on. Membership is
-- NEVER inferred from a matching email domain (that would be assertion, not membership).
--
-- Idempotent + forward-dated (managed instances apply from their ledger HEAD).

-- ── 1. The membership table ───────────────────────────────────────────────────
create table if not exists public.company_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete cascade,
  contact_email text,                                    -- resolve pre-signup / email-keyed
  company_role text not null default 'viewer'
    check (company_role in ('viewer','buyer','approver','admin')),
  visibility_scope text not null default 'company'
    check (visibility_scope in ('company','company_plus_subsidiaries')),
  status text not null default 'active'
    check (status in ('active','invited','revoked')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_contacts_identity_ck check (auth_user_id is not null or contact_email is not null)
);
create unique index if not exists company_contacts_user_uk
  on public.company_contacts(company_id, auth_user_id) where auth_user_id is not null;
create unique index if not exists company_contacts_email_uk
  on public.company_contacts(company_id, lower(contact_email)) where contact_email is not null;
create index if not exists company_contacts_user_idx on public.company_contacts(auth_user_id) where auth_user_id is not null;

comment on table public.company_contacts is
  'Identity-ladder rung 3 membership: which authenticated user (or email) belongs to which company, with what role and visibility scope. The B2B security boundary. Membership is explicit (staff/admin-provisioned), never inferred from email domain.';

-- ── 2. Resolver helper (SECURITY DEFINER — avoids RLS recursion) ───────────────
-- The active-membership set for the calling user. Used by the edge resolver AND by RLS
-- below. SECURITY DEFINER so it reads company_contacts without tripping the table's own
-- policies; search_path pinned (privilege-escalation-safe).
create or replace function public.current_user_company_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select company_id from public.company_contacts
   where auth_user_id = auth.uid() and status = 'active'
$$;

-- ── 3. RLS ────────────────────────────────────────────────────────────────────
alter table public.company_contacts enable row level security;

-- Read: a contact sees their OWN membership rows; staff see all. (Company-admin
-- self-management of colleagues is P2 — deliberately not opened at P0.)
drop policy if exists company_contacts_read_own on public.company_contacts;
create policy company_contacts_read_own on public.company_contacts
  for select using (
    auth_user_id = auth.uid()
    or public.has_role(auth.uid(), 'admin')
  );

-- Write: staff/service only at P0 (Decision 1 — first membership is human-provisioned).
drop policy if exists company_contacts_staff_manage on public.company_contacts;
create policy company_contacts_staff_manage on public.company_contacts
  for all
  using (auth.role() = 'service_role' or public.has_role(auth.uid(), 'admin'))
  with check (auth.role() = 'service_role' or public.has_role(auth.uid(), 'admin'));

-- ── 4. The two missing security-boundary columns (Decision 3) ──────────────────
-- Direct company link on documents so the rung-3 scope filter is one auditable predicate
-- (as Odoo denormalizes commercial_partner_id; cf. Odoo #61702 cross-company portal leak).
-- Nullable; populated via memberships / set-on-create going forward — NOT backfilled from
-- email domain (would violate membership-not-assertion). No data change to existing rows.
alter table public.invoices  add column if not exists company_id uuid references public.companies(id);
alter table public.contracts add column if not exists company_id uuid references public.companies(id);
create index if not exists invoices_company_id_idx  on public.invoices(company_id)  where company_id is not null;
create index if not exists contracts_company_id_idx on public.contracts(company_id) where company_id is not null;
