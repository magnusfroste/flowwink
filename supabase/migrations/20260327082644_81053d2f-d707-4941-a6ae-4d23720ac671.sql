
-- Ticket status enum
CREATE TYPE public.ticket_status AS ENUM ('new', 'open', 'in_progress', 'waiting', 'resolved', 'closed');

-- Ticket priority enum
CREATE TYPE public.ticket_priority AS ENUM ('low', 'medium', 'high', 'urgent');

-- Ticket category enum
CREATE TYPE public.ticket_category AS ENUM ('bug', 'feature', 'question', 'billing', 'other');

-- Tickets table
CREATE TABLE public.tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subject TEXT NOT NULL,
  description TEXT,
  status public.ticket_status NOT NULL DEFAULT 'new',
  priority public.ticket_priority NOT NULL DEFAULT 'medium',
  category public.ticket_category NOT NULL DEFAULT 'other',
  assigned_to UUID,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  contact_email TEXT,
  contact_name TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  source_id TEXT,
  sla_deadline TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  closed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Ticket comments/messages
CREATE TABLE public.ticket_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  author_type TEXT NOT NULL DEFAULT 'agent',
  author_id UUID,
  author_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_tickets_status ON public.tickets(status);
CREATE INDEX idx_tickets_priority ON public.tickets(priority);
CREATE INDEX idx_tickets_lead_id ON public.tickets(lead_id);
CREATE INDEX idx_tickets_company_id ON public.tickets(company_id);
CREATE INDEX idx_tickets_assigned_to ON public.tickets(assigned_to);
CREATE INDEX idx_tickets_created_at ON public.tickets(created_at DESC);
CREATE INDEX idx_ticket_comments_ticket_id ON public.ticket_comments(ticket_id);

-- RLS
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;

-- Tickets policies
CREATE POLICY "Admins can manage tickets" ON public.tickets
  FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Approvers can view tickets" ON public.tickets
  FOR SELECT TO public
  USING (has_role(auth.uid(), 'approver'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Approvers can update tickets" ON public.tickets
  FOR UPDATE TO public
  USING (has_role(auth.uid(), 'approver'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert tickets" ON public.tickets
  FOR INSERT TO public
  WITH CHECK (true);

-- Ticket comments policies
CREATE POLICY "Admins can manage ticket comments" ON public.ticket_comments
  FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Approvers can view ticket comments" ON public.ticket_comments
  FOR SELECT TO public
  USING (has_role(auth.uid(), 'approver'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert ticket comments" ON public.ticket_comments
  FOR INSERT TO public
  WITH CHECK (true);
