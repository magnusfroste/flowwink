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

create or replace function public.link_invited_company_contacts()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  if exists (
    select 1 from auth.users u
     where u.id = new.id and u.email_confirmed_at is not null
  ) then
    perform public.activate_confirmed_company_contact(new.id, new.email);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_link_invited_company_contacts on public.profiles;
create trigger trg_link_invited_company_contacts
  after insert on public.profiles
  for each row execute function public.link_invited_company_contacts();

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

update public.company_contacts cc
   set auth_user_id = null, status = 'invited', updated_at = now()
  from auth.users u
 where cc.auth_user_id = u.id
   and cc.status = 'active'
   and u.email_confirmed_at is null;