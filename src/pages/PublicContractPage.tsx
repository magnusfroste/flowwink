/**
 * Public contract page — anonymous counterparty views and signs via /contract/:token.
 * Mirrors PublicQuotePage but renders a markdown body instead of line items.
 */
import { useEffect, useState } from 'react';
import { useUiText } from '@/lib/ui-text';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CheckCircle2, XCircle, FileSignature, ShieldCheck, Download, Paperclip, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SignaturePad } from '@/components/public/SignaturePad';
import { usePublicContract, useSignContract, markContractViewed } from '@/hooks/useContractWorkflow';

/** An appendix as the signing customer receives it. */
interface Appendix {
  id: string;
  label: string | null;
  title: string | null;
  kind: 'file' | 'document';
  body_markdown: string | null;
  file_name: string | null;
  file_url: string | null;
}

export default function PublicContractPage() {
  const t = useUiText();
  const { token } = useParams<{ token: string }>();
  const { data: contract, isLoading, refetch } = usePublicContract(token);
  const sign = useSignContract();

  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [comment, setComment] = useState('');
  const [mode, setMode] = useState<'view' | 'accept' | 'reject'>('view');
  const [signatureImage, setSignatureImage] = useState<string | null>(null);

  const contractId = (contract as { id?: string } | null)?.id;
  useEffect(() => {
    if (contractId) markContractViewed(contractId).catch(() => {});
  }, [contractId]);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Loading…</p></div>;
  }
  if (!contract) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader><CardTitle>{t('contract.notFound', 'Contract not found')}</CardTitle></CardHeader>
          <CardContent><p className="text-muted-foreground">{t('contract.linkInvalid', 'This contract link is invalid or has expired.')}</p></CardContent>
        </Card>
      </div>
    );
  }

  const c = contract as {
    id: string;
    title: string;
    counterparty_name: string;
    status: string;
    version?: number | null;
    body_markdown: string | null;
    signed_at: string | null;
    appendices?: Appendix[] | null;
  };
  // The agreement's own body references these ("enligt Bilaga 1"), so they are
  // part of what is being reviewed — not attachments beside it.
  const appendices: Appendix[] = Array.isArray(c.appendices) ? c.appendices : [];
  const isDeclined = c.status === 'terminated';
  const isFinal = c.status === 'active' || c.signed_at != null || isDeclined;

  const handleSubmit = async () => {
    if (!signerName.trim() || !signerEmail.trim() || !token) return;
    await sign.mutateAsync({
      accept_token: token,
      action: mode === 'accept' ? 'accept' : 'reject',
      signer_name: signerName,
      signer_email: signerEmail,
      signature_data: signerName, // typed signature (always recorded)
      signature_image: signatureImage ?? undefined, // drawn signature (optional)
      comment,
    });
    setMode('view');
    refetch();
  };

  return (
    <div className="min-h-screen bg-muted/20 py-8 px-4">
      <Helmet>
        <title>{c.title}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="max-w-3xl mx-auto space-y-6">
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <FileSignature className="h-6 w-6 text-primary" />
                <div>
                  <CardTitle className="text-2xl">{c.title}</CardTitle>
                  <p className="text-muted-foreground mt-1">Between you and {c.counterparty_name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 print:hidden">
                <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5">
                  <Download className="h-4 w-4" />{t('sign.savePdf', 'Save as PDF')}</Button>
                <Badge variant={isFinal ? 'secondary' : 'default'}>{c.status.replace('_', ' ')}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <article className="prose prose-sm dark:prose-invert max-w-none">
              {c.body_markdown ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{c.body_markdown}</ReactMarkdown>
              ) : (
                <p className="text-muted-foreground italic">{t('contract.noContent', 'No contract content provided.')}</p>
              )}
            </article>

            {/* Appendices — the customer must see WHAT they are signing, in
                full, before signing it. Documents render inline (so the
                "Save as PDF" copy is complete); files are linked. Both appear
                in one numbered list, because the customer should not have to
                know which kind is which. */}
            {appendices.length > 0 && (
              <section className="border-t pt-6 space-y-6">
                <div>
                  <h2 className="text-base font-semibold">{t('contract.appendices', 'Appendices')}</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Följande bilagor ingår i avtalet och omfattas av din signering.
                  </p>
                  <ul className="mt-3 space-y-1.5">
                    {appendices.map((a) => (
                      <li key={a.id} className="flex items-start gap-2 text-sm">
                        {a.kind === 'file'
                          ? <Paperclip className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                          : <FileText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />}
                        <span>
                          <span className="font-medium">{a.label}</span>
                          {a.title ? ` — ${a.title}` : ''}
                          {a.kind === 'file' && a.file_url && (
                            <a
                              href={a.file_url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="ml-2 underline text-primary print:hidden"
                            >
                              Öppna{a.file_name ? ` (${a.file_name})` : ''}
                            </a>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {appendices
                  .filter((a) => a.kind === 'document' && a.body_markdown)
                  .map((a) => (
                    <div key={a.id} className="border-t pt-5 break-before-page">
                      <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                        {a.label}{a.title ? ` — ${a.title}` : ''}
                      </h3>
                      <article className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{a.body_markdown as string}</ReactMarkdown>
                      </article>
                    </div>
                  ))}
              </section>
            )}

            <div className="hidden print:block border-t pt-4 text-xs text-muted-foreground">
              <p>
                {c.title} — version {c.version ?? 1} — status: {c.status.replace('_', ' ')}
                {c.signed_at ? ` — signed ${new Date(c.signed_at).toLocaleString('sv-SE')}` : ''}
              </p>
              <p>
                Rendered from the live agreement on {new Date().toLocaleString('sv-SE')}. The web
                page is the authoritative copy; this PDF is a snapshot of it.
              </p>
            </div>

            {!isFinal && mode === 'view' && (
              <div className="print:hidden border-t pt-4 flex flex-wrap gap-2">
                <Button onClick={() => setMode('accept')} className="gap-2">
                  <CheckCircle2 className="h-4 w-4" />{t('contract.acceptSign', 'Accept & Sign')}</Button>
                <Button onClick={() => setMode('reject')} variant="outline" className="gap-2">
                  <XCircle className="h-4 w-4" />{t('contract.decline', 'Decline')}</Button>
              </div>
            )}

            {!isFinal && mode !== 'view' && (
              <div className="print:hidden border-t pt-4 space-y-3">
                <h3 className="font-medium">{mode === 'accept' ? 'Confirm acceptance' : 'Decline this contract'}</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>{t('sign.yourName', 'Your name')}</Label>
                    <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Email</Label>
                    <Input type="email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Comment (optional)</Label>
                  <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
                </div>
                {mode === 'accept' && (
                  <div className="space-y-1">
                    <Label>{t('sign.signature', 'Signature')}</Label>
                    <Tabs defaultValue="type" onValueChange={(v) => { if (v === 'type') setSignatureImage(null); }}>
                      <TabsList>
                        <TabsTrigger value="type">{t('sign.typeName', 'Type name')}</TabsTrigger>
                        <TabsTrigger value="draw">Draw</TabsTrigger>
                      </TabsList>
                      <TabsContent value="type">
                        <p className="font-serif italic text-2xl border rounded-md px-4 py-3 min-h-[3.5rem] text-foreground/80">
                          {signerName || <span className="text-sm not-italic font-sans text-muted-foreground">{t('sign.typedIsSignature', 'Your typed name is used as your signature')}</span>}
                        </p>
                      </TabsContent>
                      <TabsContent value="draw">
                        <SignaturePad onChange={setSignatureImage} />
                      </TabsContent>
                    </Tabs>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  By {mode === 'accept' ? 'signing' : 'typing your name'} and clicking {mode === 'accept' ? 'Accept' : 'Decline'} you create a binding electronic signature.
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={handleSubmit}
                    disabled={!signerName.trim() || !signerEmail.trim() || sign.isPending}
                    variant={mode === 'accept' ? 'default' : 'destructive'}
                  >
                    {mode === 'accept' ? 'Accept & Sign' : 'Decline'}
                  </Button>
                  <Button variant="ghost" onClick={() => setMode('view')}>{t('sign.cancel', 'Cancel')}</Button>
                </div>
              </div>
            )}

            {isFinal && (
              <div className="border-t pt-4 space-y-3">
                {isDeclined ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <XCircle className="h-5 w-5" />
                    <span>{t('contract.declined', 'This contract has been declined and is no longer open for signing.')}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-primary">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="font-medium">{t('contract.signed', 'This contract is signed and active. Thank you!')}</span>
                  </div>
                )}
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/contract/${token}/certificate`}>
                    <ShieldCheck className="h-4 w-4 mr-1" />{t('contract.viewCertificate', 'View signature certificate')}</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
