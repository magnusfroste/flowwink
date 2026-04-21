/**
 * Contract editor page — markdown body, metadata, send-for-signature, version history.
 * The markdown is the source of truth — exposed verbatim to ClawWink via MCP.
 */
import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Send, ExternalLink, Copy, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ContractMarkdownEditor } from '@/components/admin/contracts/ContractMarkdownEditor';
import { DocumentsPanel } from '@/components/admin/documents/DocumentsPanel';
import {
  useContract, useSendContract, useContractSignatures, useContractVersions,
  publicContractUrl,
} from '@/hooks/useContractWorkflow';
import { useUpdateContract } from '@/hooks/useContracts';
import { toast } from 'sonner';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  pending_signature: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  expired: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  terminated: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
};

export default function ContractEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { data: contract, isLoading } = useContract(id);
  const update = useUpdateContract();
  const send = useSendContract();
  const { data: signatures = [] } = useContractSignatures(id);
  const { data: versions = [] } = useContractVersions(id);

  const [titleDraft, setTitleDraft] = useState<string | null>(null);

  if (isLoading || !contract) {
    return (
      <AdminLayout>
        <div className="h-64 animate-pulse bg-muted/40 rounded-md" />
      </AdminLayout>
    );
  }

  const publicUrl = contract.accept_token ? publicContractUrl(contract.accept_token) : null;
  const isLocked = contract.status === 'active' || contract.status === 'terminated';

  const handleSend = async () => {
    await send.mutateAsync(contract);
  };

  const handleTitleBlur = async () => {
    if (titleDraft != null && titleDraft.trim() && titleDraft !== contract.title) {
      await update.mutateAsync({ id: contract.id, title: titleDraft.trim() });
    }
    setTitleDraft(null);
  };

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin/contracts"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
          </Button>
        </div>

        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <Input
                value={titleDraft ?? contract.title}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={handleTitleBlur}
                disabled={isLocked}
                className="text-2xl font-semibold border-transparent hover:border-input focus-visible:border-input bg-transparent shadow-none px-2 -ml-2 max-w-xl h-auto py-1"
              />
              <Badge variant="outline" className={STATUS_COLORS[contract.status]}>
                {contract.status.replace('_', ' ')}
              </Badge>
              <span className="text-xs text-muted-foreground">v{contract.version}</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1 ml-2">
              With {contract.counterparty_name}{contract.counterparty_email ? ` · ${contract.counterparty_email}` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            {publicUrl && (
              <>
                <Button variant="outline" size="sm" onClick={() => {
                  navigator.clipboard.writeText(publicUrl);
                  toast.success('Public link copied');
                }}>
                  <Copy className="h-4 w-4 mr-1" /> Copy link
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={publicUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1" /> Open
                  </a>
                </Button>
              </>
            )}
            {!isLocked && (
              <Button size="sm" onClick={handleSend} disabled={send.isPending}>
                <Send className="h-4 w-4 mr-1" /> {contract.status === 'pending_signature' ? 'Resend link' : 'Send for signature'}
              </Button>
            )}
          </div>
        </div>

        <Tabs defaultValue="editor">
          <TabsList>
            <TabsTrigger value="editor">Agreement</TabsTrigger>
            <TabsTrigger value="activity">Activity ({signatures.length})</TabsTrigger>
            <TabsTrigger value="versions">Versions ({versions.length})</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
          </TabsList>

          <TabsContent value="editor" className="space-y-4">
            {isLocked && (
              <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-3 text-sm">
                This contract is {contract.status} — the agreement text is locked. Create a new contract to amend.
              </div>
            )}
            <ContractMarkdownEditor
              contractId={contract.id}
              initialMarkdown={contract.body_markdown ?? ''}
              readOnly={isLocked}
            />
            <p className="text-xs text-muted-foreground">
              Markdown is the source of truth. ClawWink (via MCP) and the counterparty signing page render from this exact text.
            </p>
          </TabsContent>

          <TabsContent value="activity">
            <Card>
              <CardHeader><CardTitle className="text-base">Signing activity</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {signatures.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No activity yet. Send the contract to capture views and signatures.</p>
                ) : signatures.map((s) => {
                  const sig = s as { id: string; action: string; signer_name: string | null; signer_email: string | null; created_at: string; comment: string | null };
                  return (
                    <div key={sig.id} className="border rounded-md p-3 text-sm flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium capitalize">{sig.action}</div>
                        {sig.signer_name && <div className="text-muted-foreground">{sig.signer_name} {sig.signer_email && `· ${sig.signer_email}`}</div>}
                        {sig.comment && <div className="mt-1 text-xs italic">"{sig.comment}"</div>}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1 whitespace-nowrap">
                        <Clock className="h-3 w-3" />
                        {format(new Date(sig.created_at), 'yyyy-MM-dd HH:mm')}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="versions">
            <Card>
              <CardHeader><CardTitle className="text-base">Version history</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {versions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No versions yet — a snapshot is created each time the contract is sent or signed.</p>
                ) : versions.map((v) => {
                  const ver = v as { id: string; version_number: number; reason: string | null; created_at: string };
                  return (
                    <div key={ver.id} className="border rounded-md p-3 text-sm flex items-center justify-between">
                      <div><span className="font-medium">v{ver.version_number}</span> · {ver.reason ?? 'snapshot'}</div>
                      <span className="text-xs text-muted-foreground">{format(new Date(ver.created_at), 'yyyy-MM-dd HH:mm')}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="documents">
            <DocumentsPanel
              entityType="contract"
              entityId={contract.id}
              defaultCategory="contract"
              title="Linked documents (PDFs, attachments)"
            />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
