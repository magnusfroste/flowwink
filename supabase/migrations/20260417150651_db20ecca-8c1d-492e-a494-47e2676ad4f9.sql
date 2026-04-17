ALTER TYPE public.deal_stage ADD VALUE IF NOT EXISTS 'prospecting' BEFORE 'proposal';
ALTER TYPE public.deal_stage ADD VALUE IF NOT EXISTS 'qualified' BEFORE 'proposal';
ALTER TYPE public.deal_stage ADD VALUE IF NOT EXISTS 'lead' BEFORE 'prospecting';