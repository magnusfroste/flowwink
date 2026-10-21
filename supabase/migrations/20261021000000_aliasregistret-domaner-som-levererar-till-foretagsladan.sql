-- The alias registry: which domains deliver to the company mailbox.
--
-- A salesperson is a From line, never a separate destination. The rule
-- (docs/architecture/email-routing-and-mailboxes.md) is that reply-to must be
-- an address that DELIVERS to the company mailbox. `profiles.email_from_address`
-- is free text and was used unchecked, so `kalle@gmail.com` in a profile sent
-- every customer reply out of the building.
--
-- The registry is a column on the mailbox itself: the domains whose addresses
-- all land in it (an owned domain with catch-all or aliases). A personal From
-- address is honoured only when it is the mailbox's own address or on one of
-- these domains; otherwise the seller's name rides on the company address.
-- Empty is the honest default — a plain Gmail carries no aliases, and whether a
-- Workspace domain forwards every alias is a fact the admin knows, not one the
-- code may assume. See _shared/email/sender-identity.ts for the one resolver.

ALTER TABLE public.inbound_email_accounts
  ADD COLUMN IF NOT EXISTS alias_domains text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.inbound_email_accounts.alias_domains IS
  'Domains whose addresses all deliver to this mailbox (catch-all / aliases). A profile From address is used as the sender only when it is this mailbox''s address or on one of these domains; otherwise the person''s name goes on the mailbox address. Public mail domains (gmail.com …) never count.';
