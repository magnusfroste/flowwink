import { useRef, useState } from 'react';
import { format } from 'date-fns';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  History, Share2, PenTool, Upload, RotateCcw, Copy, Ban, X, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { getDocumentSignedUrl, type Document } from '@/hooks/useDocuments';
import {
  useDocumentVersions, useReplaceDocumentFile, useRestoreDocumentVersion,
  useDocumentShareLinks, useCreateDocumentShareLink, useRevokeDocumentShareLink, publicShareUrl,
  useDocumentSignatureRequests, useCreateDocumentSignatureRequest, useCancelDocumentSignatureRequest, publicSignUrl,
} from '@/hooks/useDocumentAdvanced';

interface Props {
  doc: Document | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const fmtBytes = (n: number | null | undefined) => {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

export function DocumentDetailSheet({ doc, open, onOpenChange }: Props) {
  if (!doc) return null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 flex-wrap">
            <span className="truncate">{doc.title}</span>
            {(doc as any).signed_at && (
              <Badge variant="outline" className="gap-1">
                <CheckCircle2 className="h-3 w-3" /> Signed
              </Badge>
            )}
          </SheetTitle>
          <p className="text-xs text-muted-foreground">{doc.file_name} · {fmtBytes(doc.file_size_bytes)}</p>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <VersionsCard doc={doc} />
          <SharesCard doc={doc} />
          <SignaturesCard doc={doc} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------- Versions ----------

function VersionsCard({ doc }: { doc: Document }) {
  const { data: versions = [], isLoading } = useDocumentVersions(doc.id);
  const replace = useReplaceDocumentFile();
  const restore = useRestoreDocumentVersion();
  const inputRef = useRef<HTMLInputElement>(null);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    replace.mutate({ documentId: doc.id, file });
    e.target.value = '';
  };

  const open = async (path: string) => {
    if (/^https?:\/\//i.test(path)) {
      window.open(path, '_blank', 'noopener');
      return;
    }
    const url = await getDocumentSignedUrl(path, 120);
    if (url) window.open(url, '_blank', 'noopener');
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4" /> Version history
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={replace.isPending}>
          <Upload className="h-4 w-4 mr-1" /> Upload new version
        </Button>
        <input ref={inputRef} type="file" className="hidden" onChange={onPick} />
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="rounded-md border p-2 text-sm flex items-center gap-2 bg-muted/40">
          <Badge>v{(doc as any).current_version_no ?? 1}</Badge>
          <div className="flex-1 truncate">{doc.file_name} <span className="text-muted-foreground">(current)</span></div>
          <Button size="sm" variant="ghost" onClick={() => open(doc.file_url)}>Open</Button>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : versions.length === 0 ? (
          <p className="text-xs text-muted-foreground">No prior versions. Uploading a new file will snapshot the current one here.</p>
        ) : versions.map((v) => (
          <div key={v.id} className="rounded-md border p-2 text-sm flex items-center gap-2">
            <Badge variant="outline">v{v.version_no}</Badge>
            <div className="flex-1 min-w-0">
              <div className="truncate">{v.file_name ?? '—'}</div>
              <div className="text-xs text-muted-foreground">
                {fmtBytes(v.file_size_bytes)} · {format(new Date(v.created_at), 'yyyy-MM-dd HH:mm')}
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => open(v.file_url)}>Open</Button>
            <Button
              size="sm" variant="ghost"
              onClick={() => restore.mutate({ documentId: doc.id, version: v })}
              title="Restore this version"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------- Share links ----------

function SharesCard({ doc }: { doc: Document }) {
  const { data: links = [] } = useDocumentShareLinks(doc.id);
  const create = useCreateDocumentShareLink();
  const revoke = useRevokeDocumentShareLink();
  const [openDialog, setOpenDialog] = useState(false);
  const [perms, setPerms] = useState<'view' | 'download'>('download');
  const [days, setDays] = useState<string>('7');

  const submit = async () => {
    const expiresInDays = days === 'never' ? null : Number(days);
    await create.mutateAsync({ documentId: doc.id, permissions: perms, expiresInDays });
    setOpenDialog(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Share2 className="h-4 w-4" /> Share links
        </CardTitle>
        <Dialog open={openDialog} onOpenChange={setOpenDialog}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">Create link</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create share link</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Permissions</Label>
                <Select value={perms} onValueChange={(v) => setPerms(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="download">Download</SelectItem>
                    <SelectItem value="view">View only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Expires</Label>
                <Select value={days} onValueChange={setDays}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">In 1 day</SelectItem>
                    <SelectItem value="7">In 7 days</SelectItem>
                    <SelectItem value="30">In 30 days</SelectItem>
                    <SelectItem value="90">In 90 days</SelectItem>
                    <SelectItem value="never">Never</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenDialog(false)}>Cancel</Button>
              <Button onClick={submit} disabled={create.isPending}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-2">
        {links.length === 0 ? (
          <p className="text-xs text-muted-foreground">No share links yet.</p>
        ) : links.map((l) => {
          const url = publicShareUrl(l.token);
          const expired = l.expires_at && new Date(l.expires_at) < new Date();
          const state = l.revoked_at ? 'revoked' : expired ? 'expired' : 'active';
          return (
            <div key={l.id} className="rounded-md border p-2 space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant={state === 'active' ? 'default' : 'outline'} className="capitalize">{state}</Badge>
                <Badge variant="outline" className="capitalize">{l.permissions}</Badge>
                <span className="text-xs text-muted-foreground ml-auto tabular-nums">{l.access_count} view(s)</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate text-xs bg-muted/50 rounded px-2 py-1">{url}</code>
                <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard.writeText(url); toast.success('Copied'); }}>
                  <Copy className="h-4 w-4" />
                </Button>
                {state === 'active' && (
                  <Button size="icon" variant="ghost" onClick={() => revoke.mutate({ id: l.id, documentId: doc.id })} title="Revoke">
                    <Ban className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                Expires: {l.expires_at ? format(new Date(l.expires_at), 'yyyy-MM-dd HH:mm') : 'never'}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ---------- Signature requests ----------

function SignaturesCard({ doc }: { doc: Document }) {
  const { data: requests = [] } = useDocumentSignatureRequests(doc.id);
  const create = useCreateDocumentSignatureRequest();
  const cancel = useCancelDocumentSignatureRequest();
  const [openDialog, setOpenDialog] = useState(false);
  const [form, setForm] = useState({ signer_email: '', signer_name: '', message: '', expiresInDays: '14' });

  const submit = async () => {
    if (!form.signer_email.trim()) return;
    await create.mutateAsync({
      documentId: doc.id,
      signer_email: form.signer_email.trim(),
      signer_name: form.signer_name.trim() || undefined,
      message: form.message.trim() || undefined,
      expiresInDays: form.expiresInDays === 'never' ? null : Number(form.expiresInDays),
    });
    setForm({ signer_email: '', signer_name: '', message: '', expiresInDays: '14' });
    setOpenDialog(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <PenTool className="h-4 w-4" /> Signature requests
        </CardTitle>
        <Dialog open={openDialog} onOpenChange={setOpenDialog}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">Request signature</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Request signature</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Signer email</Label>
                <Input type="email" value={form.signer_email} onChange={(e) => setForm({ ...form, signer_email: e.target.value })} />
              </div>
              <div>
                <Label>Signer name (optional)</Label>
                <Input value={form.signer_name} onChange={(e) => setForm({ ...form, signer_name: e.target.value })} />
              </div>
              <div>
                <Label>Message (optional)</Label>
                <Textarea rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
              </div>
              <div>
                <Label>Expires</Label>
                <Select value={form.expiresInDays} onValueChange={(v) => setForm({ ...form, expiresInDays: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">In 3 days</SelectItem>
                    <SelectItem value="7">In 7 days</SelectItem>
                    <SelectItem value="14">In 14 days</SelectItem>
                    <SelectItem value="30">In 30 days</SelectItem>
                    <SelectItem value="never">Never</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenDialog(false)}>Cancel</Button>
              <Button onClick={submit} disabled={!form.signer_email.trim() || create.isPending}>Send request</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-2">
        {requests.length === 0 ? (
          <p className="text-xs text-muted-foreground">No signature requests yet.</p>
        ) : requests.map((r) => {
          const url = publicSignUrl(r.token);
          const badgeVariant = r.status === 'signed' ? 'default' : r.status === 'sent' ? 'secondary' : 'outline';
          return (
            <div key={r.id} className="rounded-md border p-2 space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant={badgeVariant} className="capitalize">{r.status}</Badge>
                <div className="text-sm truncate flex-1">
                  {r.signer_name ? `${r.signer_name} · ` : ''}{r.signer_email}
                </div>
                {r.signed_at && (
                  <span className="text-xs text-muted-foreground">
                    Signed {format(new Date(r.signed_at), 'yyyy-MM-dd HH:mm')}
                  </span>
                )}
              </div>
              {r.status !== 'signed' && (
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate text-xs bg-muted/50 rounded px-2 py-1">{url}</code>
                  <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard.writeText(url); toast.success('Copied'); }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => cancel.mutate({ id: r.id, documentId: doc.id })} title="Cancel">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              {r.message && <div className="text-xs text-muted-foreground">{r.message}</div>}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
