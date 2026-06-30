import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPageContainer } from "@/components/admin/AdminPageContainer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailRouterSettings } from "@/components/admin/EmailRouterSettings";
import { Mail, AlertCircle, CheckCircle2, FlaskConical, Eye, Settings, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";

type Comm = {
  id: string;
  channel: string;
  status: string;
  direction: "inbound" | "outbound";
  provider: string | null;
  simulated: boolean;
  recipient: string;
  sender: string | null;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  source: string | null;
  thread_id: string | null;
  error_message: string | null;
  metadata: any;
  created_at: string;
  sent_at: string | null;
};

const STATUS_META: Record<string, { label: string; variant: any; icon: any }> = {
  sent:      { label: "Sent",      variant: "default",     icon: CheckCircle2 },
  received:  { label: "Received",  variant: "secondary",   icon: CheckCircle2 },
  simulated: { label: "Simulated", variant: "warning",     icon: FlaskConical },
  failed:    { label: "Failed",    variant: "destructive", icon: AlertCircle },
  skipped:   { label: "Skipped",   variant: "outline",     icon: AlertCircle },
};

export default function CommunicationsPage() {
  const [channel, setChannel] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [direction, setDirection] = useState<string>("all");
  const [selected, setSelected] = useState<Comm | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["outbound-communications", channel, status, direction],
    queryFn: async () => {
      let q = supabase
        .from("outbound_communications" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (channel !== "all") q = q.eq("channel", channel);
      if (status !== "all") q = q.eq("status", status);
      if (direction !== "all") q = q.eq("direction", direction);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Comm[];
    },
  });

  const rows = data ?? [];
  const stats = {
    total: rows.length,
    inbound: rows.filter((r) => r.direction === "inbound").length,
    outbound: rows.filter((r) => r.direction === "outbound").length,
    failed: rows.filter((r) => r.status === "failed").length,
  };
  const simCount = rows.filter((r) => r.simulated).length;
  const sentCount = rows.filter((r) => r.status === "sent" && !r.simulated).length;
  const simModeActive = rows.length > 0 && simCount === rows.length && sentCount === 0;

  return (
    <AdminLayout>
      <AdminPageHeader
        title="Email Router"
        description="Control plane for outbound + inbound mail. Route by intent: transactional via Resend, reply-expected via Composio/Gmail."
      >
        <Button variant="outline" onClick={() => refetch()}>Refresh log</Button>
      </AdminPageHeader>
      <AdminPageContainer>
        <Tabs defaultValue="log" className="space-y-6">
          <TabsList>
            <TabsTrigger value="log">Log</TabsTrigger>
            <TabsTrigger value="router">Router settings</TabsTrigger>
          </TabsList>

          <TabsContent value="router" className="space-y-0">
            <EmailRouterSettings />
          </TabsContent>

          <TabsContent value="log" className="space-y-6">
          {simModeActive && <SimModeBanner />}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total" value={stats.total} />
            <StatCard label="Inbound" value={stats.inbound} tone="success" />
            <StatCard label="Outbound" value={stats.outbound} tone="muted" />
            <StatCard label="Failed" value={stats.failed} tone="danger" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Filters</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Select value={direction} onValueChange={setDirection}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Direction" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">In + Out</SelectItem>
                  <SelectItem value="inbound">Inbound only</SelectItem>
                  <SelectItem value="outbound">Outbound only</SelectItem>
                </SelectContent>
              </Select>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Channel" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All channels</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="slack">Slack</SelectItem>
                  <SelectItem value="signing">E-signing</SelectItem>
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="simulated">Simulated</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="skipped">Skipped</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>When</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>From / To</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                  )}
                  {!isLoading && rows.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No communications yet. Send or receive an email to see it logged here.
                    </TableCell></TableRow>
                  )}
                  {rows.map((r) => {
                    const meta = STATUS_META[r.status] ?? STATUS_META.skipped;
                    const Icon = meta.icon;
                    const isInbound = r.direction === "inbound";
                    const party = isInbound ? (r.sender ?? r.recipient) : r.recipient;
                    return (
                      <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelected(r)}>
                        <TableCell>
                          {isInbound
                            ? <ArrowDownLeft className="h-4 w-4 text-emerald-600" aria-label="Inbound" />
                            : <ArrowUpRight className="h-4 w-4 text-blue-600" aria-label="Outbound" />}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                        </TableCell>
                        <TableCell><Badge variant="outline">{r.channel}</Badge></TableCell>
                        <TableCell>
                          <Badge variant={meta.variant} className="gap-1">
                            <Icon className="h-3 w-3" />{meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{party}</TableCell>
                        <TableCell className="max-w-xs truncate">{r.subject ?? "—"}</TableCell>
                        <TableCell>
                          <ProviderBadge provider={r.provider} simulated={r.simulated} />
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setSelected(r); }}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          </TabsContent>
        </Tabs>
      </AdminPageContainer>


      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected?.subject ?? "Message"}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Direction" value={selected.direction} />
                <Field label="Channel" value={selected.channel} />
                <Field label="From" value={selected.sender ?? (selected.direction === "outbound" ? "(this mailbox)" : "—")} />
                <Field label="To" value={selected.recipient} />
                <Field label="Status" value={selected.status} />
                <Field label="Provider" value={selected.simulated ? "simulated" : (selected.provider ?? "—")} />
                <Field label="Source" value={selected.source ?? "—"} />
                <Field label="When" value={new Date(selected.created_at).toLocaleString()} />
              </div>
              {selected.error_message && (
                <div className="rounded-md bg-destructive/10 text-destructive p-3 text-sm">
                  {selected.error_message}
                </div>
              )}
              {selected.body_html && (
                <div>
                  <div className="text-xs uppercase text-muted-foreground mb-1">Preview</div>
                  <div className="border rounded-md p-4 bg-card max-h-96 overflow-y-auto"
                       dangerouslySetInnerHTML={{ __html: selected.body_html }} />
                </div>
              )}
              {!selected.body_html && selected.body_text && (
                <pre className="border rounded-md p-4 bg-muted text-sm whitespace-pre-wrap">{selected.body_text}</pre>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "success" | "danger" | "muted" | "warning" }) {
  const color =
    tone === "success" ? "text-emerald-600" :
    tone === "danger"  ? "text-destructive" :
    tone === "warning" ? "text-amber-600" :
    tone === "muted"   ? "text-muted-foreground" :
    "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase text-muted-foreground">{label}</div>
        <div className={`text-2xl font-semibold mt-1 ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function SimModeBanner() {
  return (
    <Alert className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
      <FlaskConical className="h-4 w-4 text-amber-600" />
      <AlertTitle className="text-amber-800 dark:text-amber-200">Simulation mode active</AlertTitle>
      <AlertDescription className="text-amber-700 dark:text-amber-300">
        No email provider is configured — all sends are simulated and never leave the platform.
        Go to{" "}
        <Link to="/admin/settings" className="underline font-medium">
          Settings → Integrations
        </Link>{" "}
        to connect Resend, SMTP, or Composio.
      </AlertDescription>
    </Alert>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function ProviderBadge({ provider, simulated }: { provider: string | null; simulated: boolean }) {
  if (simulated) return <Badge variant="outline" className="text-amber-700 border-amber-300">simulated</Badge>;
  if (!provider) return <span className="text-muted-foreground text-sm">—</span>;
  const p = provider.toLowerCase();
  const styles: Record<string, string> = {
    resend:   "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300",
    composio: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300",
    gmail:    "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300",
    smtp:     "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800/60 dark:text-slate-200",
  };
  const cls = styles[p] ?? "bg-muted text-foreground border-border";
  return <Badge variant="outline" className={cls}>{provider}</Badge>;
}
