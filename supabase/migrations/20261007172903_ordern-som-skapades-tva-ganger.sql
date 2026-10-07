-- Ordern som skapades två gånger.
--
-- Processbatteriet (2026-10-07, andra passet procure-to-pay) räknade fyra
-- inköpsorder på en leverantör som fått tre. Den fjärde var en exakt dubblett
-- av den första: create_purchase_order hade skrivit huvud och rader, svaret
-- försvann i edge-runtimens lastskydd, och anroparens återförsök skapade
-- ordern en gång till. Ingenting i skapandet kunde se att det redan skett.
--
-- Samma sak händer en autonom operatör vars anrop får timeout: "beställ 10 kg
-- kaffe" blir två beställningar. Lösningen är Stripes: anroparen skickar en
-- idempotensnyckel, ordern bär den, och en upprepning med samma nyckel får
-- samma order tillbaka i stället för en ny.
--
--   purchase_orders.idempotency_key — unik när satt. create_purchase_order
--   läser idempotency_key (deklarerad) eller _idempotency_key (transport, det
--   batteriet och harnessen sätter per anrop) och svarar med den befintliga
--   ordern vid träff.

ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_idempotency_key_idx
  ON public.purchase_orders (idempotency_key) WHERE idempotency_key IS NOT NULL;
COMMENT ON COLUMN public.purchase_orders.idempotency_key IS
  'Anroparens nyckel för skapandet: samma nyckel igen ger samma order tillbaka (create_purchase_order), aldrig en dubblett efter ett återförsök.';
