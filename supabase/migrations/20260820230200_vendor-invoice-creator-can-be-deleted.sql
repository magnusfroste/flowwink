-- Matrisens ANDRA SVEP, P2: en FK utan ON DELETE-regel som blockerar
-- användarradering.
--
-- vendor_invoices.created_by → auth.users(id) saknade ON DELETE-klausul och
-- fick därmed NO ACTION: den som en gång skapat en leverantörsfaktura kan
-- ALDRIG raderas ur auth.users. Radering failar med ett
-- foreign-key-constraint-fel på en tabell operatören inte tittade på — och
-- felet nämner vendor_invoices, inte "den här användaren har historik".
--
-- Grannkolumnerna visar att regeln redan är etablerad här:
-- purchase_order_id bär ON DELETE SET NULL, vendor_id bär RESTRICT (avsiktligt
-- — en leverantör med fakturor får inte försvinna). created_by är PROVENIENS,
-- inte en affärsrelation: vem som skapade raden är värdefullt medan personen
-- finns och ska bli NULL när hen inte gör det. Fakturan överlever, spåret
-- tunnas ut. Samma val som approved_by borde ha (adresseras inte här — den
-- kolumnen har inte ett bevisat symptom, och svepet ändrar bara det QA fann).
--
-- Idempotent enligt husregeln: DROP CONSTRAINT IF EXISTS + ADD, allt bakom en
-- existenskoll så en instans utan tabellen inte failar migreringen.
--
-- LACKMUS:
--   NEKANDE (före): DELETE FROM auth.users WHERE id = <skaparen> →
--     "update or delete on table users violates foreign key constraint
--      vendor_invoices_created_by_fkey".
--   POSITIVT (efter): samma DELETE går igenom, och
--     SELECT created_by FROM vendor_invoices WHERE id = <fakturan> → NULL,
--     medan raden i övrigt är oförändrad (belopp, vendor_id, status).
--   NEKANDE (kvar): DELETE FROM vendors på en leverantör med fakturor nekas
--     fortfarande — RESTRICT på vendor_id är inte rörd. Om även den släpper
--     har fel constraint ändrats.

DO $$
BEGIN
  IF to_regclass('public.vendor_invoices') IS NULL THEN
    RAISE NOTICE 'vendor_invoices missing here — skipping';
    RETURN;
  END IF;

  ALTER TABLE public.vendor_invoices
    DROP CONSTRAINT IF EXISTS vendor_invoices_created_by_fkey;

  ALTER TABLE public.vendor_invoices
    ADD CONSTRAINT vendor_invoices_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
END $$;
