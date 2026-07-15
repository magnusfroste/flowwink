-- Identity ladder rung 3 (B2B) — P2: invite activation + safe document backfill.
-- (identity-ladder-rung3-b2b.md §7 P2, Decision 1 "invite → they sign up → active".)
-- Idempotent + forward-dated so it reaches managed/forked instances (a migration
-- timestamped below a managed ledger HEAD is silently skipped).

-- 1) Auto-link an INVITED company contact the moment that person's profile
--    appears (i.e. they sign up). handle_new_user() already inserts the profile
--    row on auth signup; this AFTER INSERT trigger on public.profiles flips a
--    matching invited membership to active and stamps its auth_user_id.
--    Membership stays EXPLICIT — the email was deliberately invited by a company
--    admin; this never grants access on a "matching email domain" basis.
--    We touch public.profiles (fully in our control), NOT the auth.users trigger.
create or replace function public.link_invited_company_contacts()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.company_contacts cc
     set auth_user_id = new.id,
         status       = 'active',
         updated_at   = now()
   where cc.auth_user_id is null
     and cc.status = 'invited'
     and lower(cc.contact_email) = lower(new.email);
  return new;
end;
$$;

drop trigger if exists trg_link_invited_company_contacts on public.profiles;
create trigger trg_link_invited_company_contacts
  after insert on public.profiles
  for each row execute function public.link_invited_company_contacts();

-- 2) Safe, FK-based document backfill: an invoice inherits the company of the
--    quote it was converted from. This walks an EXPLICIT foreign key
--    (quotes.invoice_id → invoices.id) — NOT a fuzzy email→company guess, which
--    would mislabel a contact's personal B2C invoice as company-visible (the Odoo
--    #61702 cross-company portal-leak class). Invoices with no source quote and
--    contracts have no safe automatic source → left to staff / set-on-create.
update public.invoices i
   set company_id = q.company_id
  from public.quotes q
 where q.invoice_id = i.id
   and i.company_id is null
   and q.company_id is not null;
