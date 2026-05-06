ALTER TABLE public.bank_transactions DROP CONSTRAINT IF EXISTS bank_transactions_source_check;
ALTER TABLE public.bank_transactions ADD CONSTRAINT bank_transactions_source_check
  CHECK (source = ANY (ARRAY['stripe','csv','camt053','sie','manual','image','ocr','pdf']));