/**
 * Signature certificate — durable, printable evidence of a quote/contract signing.
 * Public route: /quote/:token/certificate and /contract/:token/certificate
 * (token-gated via the get_quote_certificate / get_contract_certificate RPCs;
 * anonymous access works because the RPCs are SECURITY DEFINER and granted to anon).
 *
 * No PDF generation by design — browser print-to-PDF covers the SMB need.
 */
import { useLocation, useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ShieldCheck, Printer, ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { useQuoteProcessSettings } from '@/hooks/useSiteSettings';
// The signing endpoint stamps this in front of every digest it writes. Imported
// from the writer rather than retyped here, so the reader can never disagree
// with what was actually stored (same pattern as src/lib/email-preview.ts).
import { QUOTE_CONTENT_HASH_ALG } from '../../supabase/functions/_shared/quote-lines';

interface CertificateSignature {
  action: 'accept' | 'reject';
  signer_name: string | null;
  signer_email: string | null;
  signature_data: string | null;
  signature_image: string | null;
  content_hash: string | null;
  ip_address: string | null;
  user_agent: string | null;
  signed_at: string;
}

interface CertificatePayment {
  invoice_number: string;
  invoice_status: string;
  total_cents: number;
  paid_amount_cents: number;
  prepayment_pct: number | null;
  quote_paid_at: string | null;
}

interface CertificateData {
  kind: 'quote' | 'contract';
  reference: string;
  title: string | null;
  counterparty_name?: string | null;
  status: string;
  version: number;
  total_cents?: number;
  value_cents?: number;
  currency: string;
  valid_until?: string | null;
  decided_at: string | null;
  signature: CertificateSignature | null;
  /** Quote sign-and-pay: payment state of the auto-created invoice (null for contracts / no invoice). */
  payment?: CertificatePayment | null;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 py-2 border-b last:border-b-0 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

export default function SignatureCertificatePage() {
  const { token } = useParams<{ token: string }>();
  const location = useLocation();
  const { formatCurrency } = usePlatformFormat();
  const kind: 'quote' | 'contract' = location.pathname.startsWith('/contract/') ? 'contract' : 'quote';
  const { data: quoteProcess } = useQuoteProcessSettings();
  const contractMode = quoteProcess?.accept_behavior === 'contract';

  const { data: cert, isLoading } = useQuery({
    queryKey: ['signature-certificate', kind, token],
    queryFn: async () => {
      if (!token) return null;
      const fn = kind === 'contract' ? 'get_contract_certificate' : 'get_quote_certificate';
      const { data, error } = await supabase.rpc(fn as never, { p_token: token } as never);
      if (error) throw error;
      return (data as CertificateData | null) ?? null;
    },
    enabled: !!token,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!cert) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <p className="font-medium">Certificate not available</p>
            <p className="text-sm text-muted-foreground mt-1">
              This link is invalid, or the {kind} has not been signed or declined yet.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sig = cert.signature;
  const accepted = sig?.action === 'accept';
  const amountCents = cert.kind === 'quote' ? cert.total_cents : cert.value_cents;
  const fmtAmount = (cents: number) => formatCurrency(cents, cert.currency);
  const docLabel = cert.kind === 'quote' ? 'Quote' : 'Contract';
  const payment = cert.payment ?? null;

  // What the stored digest actually covers.
  //
  // Quote signatures carry their algorithm inside the value as `<alg>:<hex>`.
  // A BARE hex is a pre-2026-08-23 signature, whose hash was computed over
  // `quote.line_items` — empty for every quote whose lines live in the
  // `quote_items` table, i.e. the digest of a document with no prices in it.
  // Those hashes are never recomputed (that would forge history), so the
  // certificate has to say plainly what they do and do not evidence.
  // Contract signatures have covered body AND appendices since they existed
  // and were never prefixed; a bare hex there is complete, not legacy.
  const rawHash = sig?.content_hash ?? null;
  const hashSeparator = rawHash?.indexOf(':') ?? -1;
  const hashAlg = rawHash && hashSeparator > 0 ? rawHash.slice(0, hashSeparator) : null;
  const hashDigest = rawHash && hashSeparator > 0 ? rawHash.slice(hashSeparator + 1) : rawHash;
  const hashCoversLines = cert.kind === 'contract' ? true : hashAlg === QUOTE_CONTENT_HASH_ALG;
  const paidCents = payment?.paid_amount_cents ?? 0;
  const fullyPaid = !!payment && paidCents >= payment.total_cents && payment.total_cents > 0;
  const partiallyPaid = !!payment && paidCents > 0 && !fullyPaid;

  return (
    <div className="min-h-screen bg-muted/20 print:bg-background py-8 px-4">
      <Helmet>
        <title>{`${kind === 'quote' && contractMode ? 'Acceptance record' : 'Signature certificate'} — ${cert.reference}`}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between print:hidden">
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/${cert.kind}/${token}`}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to {docLabel.toLowerCase()}
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1" /> Print / Save as PDF
          </Button>
        </div>

        <Card className="print:shadow-none print:border-0">
          <CardContent className="pt-8 pb-8 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-8 w-8 text-primary" />
                <div>
                  {/* In contract mode a QUOTE accept is an approval, not a
                      signature — the signature certificate belongs to the
                      agreement. Contract certificates keep the signature
                      framing in both modes. */}
                  <h1 className="text-xl font-semibold">
                    {kind === 'quote' && contractMode ? 'Acceptance Record' : 'Signature Certificate'}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {kind === 'quote' && contractMode
                      ? `Record of approval — ${docLabel.toLowerCase()} ${cert.reference}`
                      : `Electronic signature evidence — ${docLabel.toLowerCase()} ${cert.reference}`}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 mt-1">
                <Badge variant={accepted ? 'default' : 'secondary'}>
                  {accepted ? 'Accepted' : 'Declined'}
                </Badge>
                {fullyPaid && <Badge variant="outline">Paid</Badge>}
                {partiallyPaid && <Badge variant="outline">Deposit paid</Badge>}
              </div>
            </div>

            <dl>
              <Row label="Document">
                {docLabel} <span className="font-mono">{cert.reference}</span>
                {cert.title && cert.title !== cert.reference ? ` — ${cert.title}` : ''}
              </Row>
              <Row label="Version">v{cert.version}</Row>
              <Row label="Status">{cert.status.replace('_', ' ')}</Row>
              {cert.counterparty_name && <Row label="Counterparty">{cert.counterparty_name}</Row>}
              {typeof amountCents === 'number' && amountCents > 0 && (
                <Row label="Amount">{fmtAmount(amountCents)}</Row>
              )}
              {cert.valid_until && <Row label="Valid until">{cert.valid_until}</Row>}
              {payment && paidCents > 0 && (
                <Row label="Payment">
                  {fmtAmount(paidCents)} of {fmtAmount(payment.total_cents)} paid
                  {partiallyPaid && payment.prepayment_pct ? ` (${payment.prepayment_pct}% prepayment)` : ''} on
                  invoice <span className="font-mono">{payment.invoice_number}</span>
                  {payment.quote_paid_at
                    ? ` — first payment ${format(new Date(payment.quote_paid_at), 'yyyy-MM-dd HH:mm')}`
                    : ''}
                </Row>
              )}
            </dl>

            {sig ? (
              <div className="space-y-4">
                <div className="rounded-md border p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {accepted ? (
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                    {accepted ? (kind === 'quote' && contractMode ? 'Approved' : 'Signed') : 'Declined'} by {sig.signer_name || 'Unknown'}
                    {sig.signer_email && (
                      <span className="text-muted-foreground font-normal">&lt;{sig.signer_email}&gt;</span>
                    )}
                  </div>

                  {sig.signature_image ? (
                    <img
                      src={sig.signature_image}
                      alt={`Drawn signature of ${sig.signer_name || 'signer'}`}
                      className="max-h-32 border rounded-md bg-background p-2"
                    />
                  ) : (
                    <p className="font-serif italic text-2xl border rounded-md bg-background px-4 py-3 inline-block">
                      {sig.signature_data || sig.signer_name}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {sig.signature_image ? 'Drawn signature' : 'Typed signature'}
                  </p>
                </div>

                <dl>
                  <Row label="Timestamp">
                    {format(new Date(sig.signed_at), 'yyyy-MM-dd HH:mm:ss')} (local) ·{' '}
                    <span className="font-mono text-xs">{sig.signed_at}</span>
                  </Row>
                  {sig.ip_address && (
                    <Row label="IP address">
                      <span className="font-mono">{sig.ip_address}</span>
                    </Row>
                  )}
                  {sig.user_agent && (
                    <Row label="Device">
                      <span className="text-xs text-muted-foreground break-all">{sig.user_agent}</span>
                    </Row>
                  )}
                  {rawHash && (
                    <Row label="Content hash">
                      <span className="font-mono text-xs break-all">sha256:{hashDigest}</span>
                    </Row>
                  )}
                  {rawHash && (
                    <Row label="Hash covers">
                      {cert.kind === 'contract' ? (
                        'The agreement text, its value, and every appendix attached at signing.'
                      ) : hashCoversLines ? (
                        'The quote number, title, every line item with its quantity and price, the totals, the terms and the validity date.'
                      ) : (
                        <span className="text-amber-700 dark:text-amber-500">
                          The quote number, title, totals, terms and validity date — but{' '}
                          <strong>not the individual line items</strong>. This signature was
                          recorded before line items were included in the digest, so the hash cannot
                          evidence them. The line items themselves are unchanged by this; they are
                          simply outside what this hash can prove.
                        </span>
                      )}
                    </Row>
                  )}
                </dl>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No signature record found for this {cert.kind} — the status may have been set manually by staff.
              </p>
            )}

            <p className="text-xs text-muted-foreground border-t pt-4">
              This certificate documents a simple electronic signature.{' '}
              {rawHash ? (
                <>
                  The content hash is a SHA-256 digest, computed at the moment of signing, of the
                  content listed under “Hash covers” above — recomputing that same content today and
                  getting the same hash proves those parts of the document have not been altered
                  since.
                </>
              ) : (
                <>
                  No content hash was recorded for this signature, so this certificate evidences the
                  decision, the signer and the moment — not the document’s contents.
                </>
              )}
              {rawHash && !hashCoversLines && (
                <>
                  {' '}
                  <strong>
                    A matching hash therefore does not, on this signature, say anything about the line
                    items.
                  </strong>{' '}
                  The hash is reported exactly as it was recorded; it has not been recalculated.
                </>
              )}{' '}
              Timestamp, IP address, and device information were recorded when the signer submitted
              their decision via the private signing link.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
