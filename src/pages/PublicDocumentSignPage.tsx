/**
 * Public document signing page — anonymous signer completes a signature request.
 * Route: /sign/document/:token
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SignaturePad } from '@/components/public/SignaturePad';
import { toast } from 'sonner';
import { CheckCircle2, FileText, ExternalLink } from 'lucide-react';

interface ResolvedRequest {
  request_id: string;
  document_id: string;
  title: string;
  file_url: string;
  file_name: string | null;
  file_type: string | null;
  signer_email: string;
  signer_name: string | null;
  status: string;
  message: string | null;
  signed_at: string | null;
  expires_at: string | null;
}

export default function PublicDocumentSignPage() {
  const { token } = useParams<{ token: string }>();
  const [req, setReq] = useState<ResolvedRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [drawn, setDrawn] = useState<string | null>(null);
  const [tab, setTab] = useState<'typed' | 'drawn'>('typed');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data, error } = await supabase.rpc('resolve_document_signature_request' as any, { _token: token });
      const row = Array.isArray(data) ? data[0] : data;
      if (error) setError(error.message);
      else if (!row) setError('Invalid or expired signing link.');
      else setReq(row as any);
      setLoading(false);
    })();
  }, [token]);

  const expired = req?.expires_at && new Date(req.expires_at) < new Date();
  const alreadySigned = req?.status === 'signed' || !!req?.signed_at;

  const submit = async () => {
    if (!token) return;
    const isTyped = tab === 'typed';
    const data = isTyped ? typed.trim() : drawn;
    if (!data) return toast.error(isTyped ? 'Type your name' : 'Draw your signature');
    setSubmitting(true);
    const { error } = await supabase.rpc('complete_document_signature' as any, {
      _token: token,
      _signature_data: data,
      _signature_type: isTyped ? 'typed' : 'drawn',
      _ip: null,
      _ua: navigator.userAgent.slice(0, 300),
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    setDone(true);
    toast.success('Signed');
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  if (error || !req) {
    return (
      <div className="max-w-lg mx-auto p-8">
        <Card><CardContent className="pt-6 text-center space-y-2">
          <p className="font-medium">Link unavailable</p>
          <p className="text-sm text-muted-foreground">{error ?? 'This signing link is no longer valid.'}</p>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> {req.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Signer: <span className="text-foreground">{req.signer_name ? `${req.signer_name} · ` : ''}{req.signer_email}</span>
          </div>
          {req.message && (
            <div className="text-sm border-l-2 pl-3 text-muted-foreground">{req.message}</div>
          )}
          <Button variant="outline" asChild>
            <a href={req.file_url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4 mr-1" /> View document
            </a>
          </Button>
        </CardContent>
      </Card>

      {done || alreadySigned ? (
        <Card><CardContent className="pt-6 flex items-center gap-3">
          <CheckCircle2 className="h-6 w-6 text-green-600" />
          <div>
            <p className="font-medium">Document signed</p>
            <p className="text-sm text-muted-foreground">Thank you — the sender has been notified.</p>
          </div>
        </CardContent></Card>
      ) : expired ? (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">
          This signing link has expired. Please contact the sender for a new one.
        </CardContent></Card>
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-base">Sign</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
              <TabsList>
                <TabsTrigger value="typed">Type</TabsTrigger>
                <TabsTrigger value="drawn">Draw</TabsTrigger>
              </TabsList>
              <TabsContent value="typed" className="pt-3">
                <Label>Type your full name</Label>
                <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Jane Doe" />
              </TabsContent>
              <TabsContent value="drawn" className="pt-3">
                <SignaturePad onChange={setDrawn} />
              </TabsContent>
            </Tabs>
            <div className="flex justify-end">
              <Button onClick={submit} disabled={submitting}>Sign document</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              By signing, you agree that your electronic signature is the legal equivalent of a handwritten one for
              this document.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
