-- Block cancelling a picking order that has already shipped.
--
-- Abort-mid-flow QA 2026-07-10 (third of the family): cancel_picking cancelled
-- unconditionally — including a SHIPPED picking (carrier has the parcel, tracking number
-- issued). The dispatch then reads "cancelled" while the goods are physically en route to
-- the customer; the correct flow for shipped goods is a customer return (create_return),
-- never cancel. Cancelling an un-shipped picking (allocated/ready/picked) stays legitimate —
-- items simply go back on the shelf and reservations are released.
--
-- Path-independent BEFORE UPDATE trigger, same family as the paid-invoice and received-PO
-- cancel guards. Idempotent.
create or replace function public.guard_picking_cancel_after_ship()
returns trigger language plpgsql as $$
begin
  if new.status = 'cancelled' and old.status = 'shipped' then
    raise exception 'Cannot cancel picking %: it has shipped (tracking %). Handle it as a customer return (create_return) instead.',
      old.picking_number, coalesce(old.tracking_number, 'n/a');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_picking_cancel_after_ship on public.picking_orders;
create trigger trg_guard_picking_cancel_after_ship
  before update of status on public.picking_orders
  for each row execute function public.guard_picking_cancel_after_ship();
