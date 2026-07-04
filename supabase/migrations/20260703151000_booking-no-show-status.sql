-- Feature: No-show tracking (docs/parity/capabilities/booking.json#no_show).
-- Adds 'no_show' to the bookings status lifecycle so a past confirmed booking
-- the customer never attended can be marked distinctly from 'cancelled'
-- (cancelled = withdrawn ahead of time; no_show = customer didn't attend).
-- Pattern matches 20260629142430 (outbound_communications_direction_check):
-- drop + recreate the CHECK, idempotent on rerun.

ALTER TABLE "public"."bookings"
  DROP CONSTRAINT IF EXISTS "bookings_status_check";
ALTER TABLE "public"."bookings"
  ADD CONSTRAINT "bookings_status_check"
  CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'cancelled'::"text", 'completed'::"text", 'no_show'::"text"])));
