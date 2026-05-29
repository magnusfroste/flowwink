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
import { Mail, AlertCircle, CheckCircle2, FlaskConical, Eye } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Comm = {
  id: string;
  channel: string;
  status: string;
  provider: string | null;
  simulated: boolean;
  recipient: string;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  source: string | null;
  error_message: string | null;
  metadata: any;
  created_at: string;
  sent_at: string | null;
};

const STATUS_META: Record<string, { label: string; variant: any; icon: any }> = {
  sent:      { label: "Sent",      variant: "default",     icon: CheckCircle2 },
  simulated: { label: "Simulated", variant: "secondary",   icon: FlaskConical },
  failed:    { label: "Failed",    variant: "destructive", icon: AlertCircle },
  skipped:   { label: "Skipped",   variant: "outline",     icon: AlertCircle },
};

export default function CommunicationsPage() {
  const [channel, setChannel] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [selected, setSelected] = useState<Comm | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["outbound-communications", channel, status],
    queryFn: async () => {
      let q = supabase
        .from("outbound_communications" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (channel !== "all") q = q.eq("channel", channel);
      if (status !== "all") q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Comm[];
    },
  });

  const rows = data ?? [];
  const stats = {
    total: rows.length,
    sent: rows.filter((r) => r.status === "sent").length,
    simulated: rows.filter((r) => r.simulated).length,
    failed: rows.filter((r) => r.status === "failed").length,
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Mail className="h-7 w-7 text-primary" />
            Communications
          </h1>
          <p className="text-muted-foreground mt-1">
            Central log of every outbound message — sent, simulated, or failed.
            Routed through the platform-level email router.
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>Refresh</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Sent" value={stats.sent} tone="success" />
        <StatCard label="Simulated" value={stats.simulated} tone="muted" />
        <StatCard label="Failed" value={stats.failed} tone="danger" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
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
                <TableHead>When</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No outbound communications yet. Trigger an email-sending workflow to see it logged here.
                </TableCell></TableRow>
              )}
              {rows.map((r) => {
                const meta = STATUS_META[r.status] ?? STATUS_META.skipped;
                const Icon = meta.icon;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell><Badge variant="outline">{r.channel}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={meta.variant} className="gap-1">
                        <Icon className="h-3 w-3" />{meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.recipient}</TableCell>
                    <TableCell className="max-w-xs truncate">{r.subject ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.simulated ? "—" : r.provider ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => setSelected(r)}>
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

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected?.subject ?? "Message"}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="To" value={selected.recipient} />
                <Field label="Channel" value={selected.channel} />
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
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "success" | "danger" | "muted" }) {
  const color =
    tone === "success" ? "text-emerald-600" :
    tone === "danger"  ? "text-destructive" :
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
