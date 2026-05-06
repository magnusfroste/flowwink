
ALTER TABLE public.bank_import_batches DROP CONSTRAINT IF EXISTS bank_import_batches_source_check;
ALTER TABLE public.bank_import_batches ADD CONSTRAINT bank_import_batches_source_check
  CHECK (source = ANY (ARRAY['stripe','csv','camt053','sie','manual','image','ocr','pdf']));
