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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CommunicationDetailDialog, type Comm } from "@/components/admin/communications/CommunicationDetailDialog";
import { Mail, AlertCircle, CheckCircle2, FlaskConical, Eye, Settings, ArrowDownLeft, ArrowUpRight, Link2, UserX } from "lucide-react";
import { useCommEntityNames } from "@/hooks/useCommEntityNames";
import { LinkCommunicationDialog } from "@/components/admin/communications/LinkCommunicationDialog";
import { formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";

const STATUS_META: Record<string, { label: string; variant: any; icon: any }> = {
  sent:      { label: "Sent",      variant: "default",     icon: CheckCircle2 },
  received:  { label: "Received",  variant: "secondary",   icon: CheckCircle2 },
  simulated: { label: "Simulated", variant: "warning",     icon: FlaskConical },
  failed:    { label: "Failed",    variant: "destructive", icon: AlertCircle },
  skipped:   { label: "Skipped",   variant: "outline",     icon: AlertCircle },
};

export function MessageLogTab() {
  const [channel, setChannel] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [direction, setDirection] = useState<string>("all");
  const [linkage, setLinkage] = useState<string>("all");
  const [selected, setSelected] = useState<Comm | null>(null);
  const [linking, setLinking] = useState<Comm | null>(null);

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

  const allRows = data ?? [];
  const isBound = (r: Comm) => !!r.related_entity_id;
  const rows = allRows.filter((r) =>
    linkage === "all" ? true : linkage === "linked" ? isBound(r) : !isBound(r),
  );

  const entityNames = useCommEntityNames(
    allRows
      .filter((r) => r.related_entity_type && r.related_entity_id)
      .map((r) => ({ type: r.related_entity_type as string, id: r.related_entity_id as string })),
  ).data ?? {};

  const linkedCount = allRows.filter(isBound).length;
  const routingQuality = allRows.length ? Math.round((linkedCount / allRows.length) * 100) : 0;
  const stats = {
    total: allRows.length,
    inbound: allRows.filter((r) => r.direction === "inbound").length,
    outbound: allRows.filter((r) => r.direction === "outbound").length,
    failed: allRows.filter((r) => r.status === "failed").length,
  };
  const simCount = allRows.filter((r) => r.simulated).length;
  const sentCount = allRows.filter((r) => r.status === "sent" && !r.simulated).length;
  const simModeActive = allRows.length > 0 && simCount === allRows.length && sentCount === 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => refetch()}>Refresh log</Button>
      </div>
          {simModeActive && <SimModeBanner />}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total" value={stats.total} />
            <StatCard label="Inbound" value={stats.inbound} tone="success" />
            <StatCard label="Outbound" value={stats.outbound} tone="muted" />
            <StatCard label="Failed" value={stats.failed} tone="danger" />
          </div>

          <RoutingQualityCard
            quality={routingQuality}
            linked={linkedCount}
            total={allRows.length}
            onShowUnlinked={() => setLinkage("unlinked")}
          />

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
              <Select value={linkage} onValueChange={setLinkage}>
                <SelectTrigger className="w-52"><SelectValue placeholder="Customer" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Linked + unlinked</SelectItem>
                  <SelectItem value="linked">Linked to a customer</SelectItem>
                  <SelectItem value="unlinked">Unlinked only</SelectItem>
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
                    <TableHead>Customer</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                  )}
                  {!isLoading && rows.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
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
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <CustomerCell
                            comm={r}
                            entity={r.related_entity_type && r.related_entity_id
                              ? entityNames[`${r.related_entity_type}:${r.related_entity_id}`]
                              : undefined}
                            onLink={() => setLinking(r)}
                          />
                        </TableCell>
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

      <LinkCommunicationDialog comm={linking} onOpenChange={(v) => !v && setLinking(null)} />
      <CommunicationDetailDialog comm={selected} onOpenChange={(v) => !v && setSelected(null)} />
    </div>
  );
}

function CustomerCell({
  comm, entity, onLink,
}: { comm: Comm; entity?: { label: string; href?: string }; onLink: () => void }) {
  if (comm.related_entity_id) {
    const label = entity?.label ?? `${comm.related_entity_type ?? "record"} · linked`;
    return entity?.href ? (
      <Link to={entity.href} className="text-sm font-medium hover:underline truncate block max-w-[14rem]">
        {label}
      </Link>
    ) : (
      <span className="text-sm truncate block max-w-[14rem]">{label}</span>
    );
  }
  return (
    <Button variant="ghost" size="sm" className="h-7 text-muted-foreground gap-1.5" onClick={onLink}>
      <UserX className="h-3.5 w-3.5" />
      Unlinked
    </Button>
  );
}

function RoutingQualityCard({
  quality, linked, total, onShowUnlinked,
}: { quality: number; linked: number; total: number; onShowUnlinked: () => void }) {
  const tone = quality >= 80 ? "text-emerald-600" : quality >= 40 ? "text-amber-600" : "text-destructive";
  return (
    <Card>
      <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link2 className={`h-5 w-5 ${tone}`} />
          <div>
            <div className="text-sm font-medium">
              Routing quality <span className={tone}>{quality}%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {linked} of {total} messages are bound to a customer. Unbound mail is invisible to the CRM and to FlowPilot.
            </p>
          </div>
        </div>
        {total > linked && (
          <Button variant="outline" size="sm" onClick={onShowUnlinked}>
            Show {total - linked} unlinked
          </Button>
        )}
      </CardContent>
    </Card>
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
