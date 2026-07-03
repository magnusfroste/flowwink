-- Feature: Staff assignment (docs/parity/capabilities/booking.json#staff_assignment).
-- Lets a booking be assigned to a staff member. Nullable — not every business
-- assigns staff to individual appointments. employees is the general HR/staff
-- table (verified against consultant_profiles, which backs the unrelated
-- niche-consultant marketplace feature and carries marketplace-only fields
-- like hourly_rate_cents/portfolio_url/embedding — not a fit here).

ALTER TABLE "public"."bookings"
  ADD COLUMN IF NOT EXISTS "assigned_employee_id" "uuid";

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name = 'bookings_assigned_employee_id_fkey'
                   AND table_name = 'bookings') THEN
    ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_assigned_employee_id_fkey"
      FOREIGN KEY ("assigned_employee_id") REFERENCES "public"."employees"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "bookings_assigned_employee_idx"
  ON "public"."bookings" ("assigned_employee_id")
  WHERE "assigned_employee_id" IS NOT NULL;
