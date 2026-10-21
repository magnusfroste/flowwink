import { CheckCircle2, AlertTriangle, Info, Loader2 } from 'lucide-react';
import { useCompanyMailboxes } from '@/hooks/useCompanyMailbox';
import {
  resolveSenderIdentity,
  isEmailAddress,
} from '../../../../supabase/functions/_shared/email/sender-identity';

interface Props {
  fromAddress: string;
  fromName: string;
  replyTo: string;
  fullName: string;
}

/**
 * What the seller's From line will actually be — read from the same resolver
 * `email-send` runs, fed with the registry the browser can see. A personal
 * address that does not deliver to the company mailbox is not an error to
 * block on; it is degraded to a display name, and this says so before the
 * first mail goes out rather than after a reply went missing.
 */
export function SenderIdentityHint({ fromAddress, fromName, replyTo, fullName }: Props) {
  const mailboxes = useCompanyMailboxes();
  const wanted = fromAddress.trim();

  if (!wanted) {
    return (
      <p className="text-xs text-muted-foreground">
        Used only when it delivers to the company mailbox: the mailbox address itself, or a domain the
        admin registered on it (Email → Inbound mailboxes). Otherwise your name goes on the company address.
      </p>
    );
  }
  if (!isEmailAddress(wanted)) {
    return <p className="text-xs text-destructive">Not an email address.</p>;
  }
  if (mailboxes.isLoading) {
    return (
      <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking the company mailbox…
      </p>
    );
  }

  const identity = resolveSenderIdentity({
    profile: { email_from_address: wanted, email_from_name: fromName, email_reply_to: replyTo, full_name: fullName },
    mailboxes: mailboxes.data ?? [],
    transport: { fromEmail: 'the workspace sender', fromName: '' },
  });

  if (identity.mode === 'alias') {
    return (
      <p className="text-xs text-foreground inline-flex items-start gap-1">
        <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
        <span>
          Delivers to the company mailbox — used as your From line
          {identity.rejected?.reply_to ? (
            <>. Your Reply-To <span className="font-mono">{identity.rejected.reply_to}</span> does not deliver there and is ignored.</>
          ) : '.'}
        </span>
      </p>
    );
  }
  if (identity.mode === 'display_name') {
    return (
      <p className="text-xs text-muted-foreground inline-flex items-start gap-1">
        <AlertTriangle className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
        <span>
          Not on a registered company domain. Your mail goes out as{' '}
          <span className="font-medium text-foreground">{identity.fromName || 'you'} &lt;{identity.fromEmail}&gt;</span>{' '}
          so replies reach the CRM. To send as this address, an admin registers its domain on the
          company mailbox (Email → Inbound mailboxes → Alias domains).
        </span>
      </p>
    );
  }
  return (
    <p className="text-xs text-muted-foreground inline-flex items-start gap-1">
      <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <span>
        No company mailbox is registered yet, so this address is not used; the workspace sender goes out
        with your name. Register the company inbox under Email → Inbound mailboxes.
      </span>
    </p>
  );
}
