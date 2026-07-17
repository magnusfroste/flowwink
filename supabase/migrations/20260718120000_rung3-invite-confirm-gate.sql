-- Identity ladder rung 3 (B2B) — SECURITY FIX: activate an invited company
-- membership only for a CONFIRMED (proven-owned) email.
--
-- Vulnerability (found in review of P2, migration 20260716100000): its
-- link_invited_company_contacts() trigger fires AFTER INSERT ON public.profiles,
-- and handle_new_user() creates that profile row at SIGNUP — before email
-- confirmation and without checking email_confirmed_at. So an attacker who does
-- NOT control cfo@bigcorp.com could sign up with that address and have a matching
-- invited membership (potentially 'admin') bound to their own auth_user_id before
-- ever proving ownership. On an instance with email confirmation ON this is
-- griefing/DoS (the invite is consumed, the real contact can't claim it, a dead
-- membership lingers); on an instance with confirmation OFF it is full company
-- account takeover. Either way membership was ASSERTED, not proven — the exact
-- "membership must be real, never a claim" rule rung 3 is built on.
--
-- Fix: activation happens only when the email is confirmed. Two safe entry points
-- call one shared, idempotent activator:
--   1) profiles AFTER INSERT — but only if that user is ALREADY confirmed
--      (admin-created / auto-confirmed instances). Unconfirmed signup links nothing.
--   2) auth.users AFTER UPDATE OF email_confirmed_at (null → set) — the moment
--      ownership is proven. Covers the normal invite → sign up → confirm flow for
--      EVERY surface (not just chat). Consistent with the baseline's existing
--      on_auth_user_created auth.users trigger, so it is portable across the fleet.
--
-- Idempotent + forward-dated (managed/forked instances apply from their ledger HEAD).

-- ── 1. Shared activator — the ONLY place an invited row becomes active ─────────
create or replace function public.activate_confirmed_company_contact(p_user_id uuid, p_email text)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if p_email is null or p_user_id is null then return; end if;
  update public.company_contacts cc
     set auth_user_id = p_user_id,
         status       = 'active',
         updated_at   = now()
   where cc.auth_user_id is null
     and cc.status = 'invited'
     and lower(cc.contact_email) = lower(p_email);
end;
$$;

-- ── 2. profiles trigger — activate only if the user is ALREADY confirmed ───────
create or replace function public.link_invited_company_contacts()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  -- The profile row exists at signup, before the email is confirmed. Activating
  -- an invited membership on a mere email match here would let anyone claim an
  -- invited address by signing up with it. Only proceed when ownership is proven
  -- (email already confirmed — e.g. admin-created or auto-confirm instances). The
  -- normal signup→confirm path is handled by the auth.users trigger below.
  if exists (
    select 1 from auth.users u
     where u.id = new.id and u.email_confirmed_at is not null
  ) then
    perform public.activate_confirmed_company_contact(new.id, new.email);
  end if;
  return new;
end;
$$;

-- (trigger definition itself unchanged from P2 — re-assert idempotently)
drop trigger if exists trg_link_invited_company_contacts on public.profiles;
create trigger trg_link_invited_company_contacts
  after insert on public.profiles
  for each row execute function public.link_invited_company_contacts();

-- ── 3. auth.users confirmation trigger — activate at the moment of proof ───────
create or replace function public.link_company_contact_on_confirm()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    perform public.activate_confirmed_company_contact(new.id, new.email);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_link_company_contact_on_confirm on auth.users;
create trigger trg_link_company_contact_on_confirm
  after update of email_confirmed_at on auth.users
  for each row execute function public.link_company_contact_on_confirm();

-- ── 4. Heal any membership activated BEFORE this fix for a still-unconfirmed
--       user (a pre-fix premature link). Revert it to 'invited' so it re-activates
--       only when the real owner confirms. No-op on a clean instance. ───────────
update public.company_contacts cc
   set auth_user_id = null, status = 'invited', updated_at = now()
  from auth.users u
 where cc.auth_user_id = u.id
   and cc.status = 'active'
   and u.email_confirmed_at is null;
