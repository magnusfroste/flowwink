/**
 * Public contract page — anonymous counterparty views and signs via /contract/:token.
 * Mirrors PublicQuotePage but renders a markdown body instead of line items.
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CheckCircle2, XCircle, FileSignature, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SignaturePad } from '@/components/public/SignaturePad';
import { usePublicContract, useSignContract, markContractViewed } from '@/hooks/useContractWorkflow';

export default function PublicContractPage() {
  const { token } = useParams<{ token: string }>();
  const { data: contract, isLoading, refetch } = usePublicContract(token);
  const sign = useSignContract();

  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [comment, setComment] = useState('');
  const [mode, setMode] = useState<'view' | 'accept' | 'reject'>('view');
  const [signatureImage, setSignatureImage] = useState<string | null>(null);

  useEffect(() => {
    if (contract?.id) markContractViewed(contract.id).catch(() => {});
  }, [contract?.id]);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Loading…</p></div>;
  }
  if (!contract) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader><CardTitle>Contract not found</CardTitle></CardHeader>
          <CardContent><p className="text-muted-foreground">This contract link is invalid or has expired.</p></CardContent>
        </Card>
      </div>
    );
  }

  const c = contract as {
    id: string;
    title: string;
    counterparty_name: string;
    status: string;
    body_markdown: string | null;
    signed_at: string | null;
  };
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
              <Badge variant={isFinal ? 'secondary' : 'default'}>{c.status.replace('_', ' ')}</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <article className="prose prose-sm dark:prose-invert max-w-none">
              {c.body_markdown ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{c.body_markdown}</ReactMarkdown>
              ) : (
                <p className="text-muted-foreground italic">No contract content provided.</p>
              )}
            </article>

            {!isFinal && mode === 'view' && (
              <div className="border-t pt-4 flex flex-wrap gap-2">
                <Button onClick={() => setMode('accept')} className="gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Accept & Sign
                </Button>
                <Button onClick={() => setMode('reject')} variant="outline" className="gap-2">
                  <XCircle className="h-4 w-4" /> Decline
                </Button>
              </div>
            )}

            {!isFinal && mode !== 'view' && (
              <div className="border-t pt-4 space-y-3">
                <h3 className="font-medium">{mode === 'accept' ? 'Confirm acceptance' : 'Decline this contract'}</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Your name</Label>
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
                    <Label>Signature</Label>
                    <Tabs defaultValue="type" onValueChange={(v) => { if (v === 'type') setSignatureImage(null); }}>
                      <TabsList>
                        <TabsTrigger value="type">Type name</TabsTrigger>
                        <TabsTrigger value="draw">Draw</TabsTrigger>
                      </TabsList>
                      <TabsContent value="type">
                        <p className="font-serif italic text-2xl border rounded-md px-4 py-3 min-h-[3.5rem] text-foreground/80">
                          {signerName || <span className="text-sm not-italic font-sans text-muted-foreground">Your typed name is used as your signature</span>}
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
                  <Button variant="ghost" onClick={() => setMode('view')}>Cancel</Button>
                </div>
              </div>
            )}

            {isFinal && (
              <div className="border-t pt-4 space-y-3">
                {isDeclined ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <XCircle className="h-5 w-5" />
                    <span>This contract has been declined and is no longer open for signing.</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-primary">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="font-medium">This contract is signed and active. Thank you!</span>
                  </div>
                )}
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/contract/${token}/certificate`}>
                    <ShieldCheck className="h-4 w-4 mr-1" /> View signature certificate
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
