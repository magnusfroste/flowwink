import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuditTrail, auditRowsToCsv, type AuditRow } from '@/hooks/useAuditTrail';
import { Download, ShieldCheck, AlertTriangle } from 'lucide-react';

const ACCOUNTING_TABLES = [
  'chart_of_accounts', 'journal_entries', 'journal_entry_lines',
  'accounting_templates', 'opening_balances',
  'accounting_periods', 'analytic_accounts', 'analytic_lines',
  'invoices', 'invoice_lines',
  'vendors', 'purchase_orders', 'purchase_order_lines',
  'goods_receipts', 'goods_receipt_lines', 'vendor_invoices', 'vendor_products',
  'rfqs', 'rfq_lines', 'rfq_bids',
  'expenses',
];

const ACTION_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  create: 'default',
  update: 'secondary',
  delete: 'destructive',
};

export function AuditTrailTab() {
  const [tableName, setTableName] = useState<string>('all');
  const [agentType, setAgentType] = useState<string>('all');
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const filters = useMemo(() => ({
    table_name: tableName === 'all' ? undefined : tableName,
    agent_type: agentType === 'all' ? undefined : agentType,
    from: from ? new Date(from).toISOString() : undefined,
    to: to ? new Date(to + 'T23:59:59').toISOString() : undefined,
    limit: 500,
  }), [tableName, agentType, from, to]);

  const { data: rows = [], isLoading } = useAuditTrail(filters);

  const handleExport = () => {
    const csv = auditRowsToCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Agent Audit Trail
            </CardTitle>
            <CardDescription>
              Immutable record of every autonomous accounting action — payload hashes, before/after snapshots, 7-year retention.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!rows.length}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV ({rows.length})
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Table</Label>
            <Select value={tableName} onValueChange={setTableName}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tables</SelectItem>
                {ACCOUNTING_TABLES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Agent</Label>
            <Select value={agentType} onValueChange={setAgentType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agents</SelectItem>
                <SelectItem value="openclaw">OpenClaw</SelectItem>
                <SelectItem value="flowpilot">FlowPilot</SelectItem>
                <SelectItem value="mcp">MCP</SelectItem>
                <SelectItem value="chat">Chat</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Skill</TableHead>
                <TableHead>Table</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Hash</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No audit entries match these filters.</TableCell></TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setSelected(r)}>
                  <TableCell className="text-xs whitespace-nowrap">{new Date(r.occurred_at).toLocaleString()}</TableCell>
                  <TableCell><Badge variant="outline">{r.agent_type || '—'}</Badge></TableCell>
                  <TableCell className="text-xs">{r.skill_name || '—'}</TableCell>
                  <TableCell className="text-xs font-mono">{r.table_name}</TableCell>
                  <TableCell>
                    <Badge variant={ACTION_VARIANT[r.crud_action] || 'outline'}>{r.crud_action}</Badge>
                  </TableCell>
                  <TableCell className="text-xs font-mono">{r.entity_id?.slice(0, 8) || '—'}</TableCell>
                  <TableCell>
                    {r.success ? <Badge variant="secondary">ok</Badge> : <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />fail</Badge>}
                  </TableCell>
                  <TableCell className="text-[10px] font-mono text-muted-foreground">{r.request_payload_sha256.slice(0, 12)}…</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Audit entry detail</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <Field label="When" value={new Date(selected.occurred_at).toLocaleString()} />
                <Field label="Agent" value={selected.agent_type || '—'} />
                <Field label="Skill" value={selected.skill_name || '—'} />
                <Field label="Table" value={selected.table_name} />
                <Field label="Action" value={selected.crud_action} />
                <Field label="Entity ID" value={selected.entity_id || '—'} />
                <Field label="Trace ID" value={selected.trace_id || '—'} />
                <Field label="API key" value={selected.caller_api_key_id || '—'} />
                <Field label="Retention" value={selected.retention_until || '—'} />
                <Field label="Status" value={selected.success ? 'success' : `failed: ${selected.error_message || ''}`} />
              </div>

              <Section title={`Request payload (sha256: ${selected.request_payload_sha256})`}>
                <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">{JSON.stringify(selected.request_payload, null, 2)}</pre>
              </Section>

              {selected.diff && Object.keys(selected.diff).length > 0 && (
                <Section title="Diff">
                  <div className="border rounded">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Field</TableHead>
                          <TableHead>Before</TableHead>
                          <TableHead>After</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(selected.diff).map(([k, v]) => (
                          <TableRow key={k}>
                            <TableCell className="font-mono text-xs">{k}</TableCell>
                            <TableCell className="text-xs"><code className="text-destructive">{stringify(v.before)}</code></TableCell>
                            <TableCell className="text-xs"><code className="text-green-700 dark:text-green-400">{stringify(v.after)}</code></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </Section>
              )}

              {selected.before_snapshot && (
                <Section title="Before snapshot">
                  <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">{JSON.stringify(selected.before_snapshot, null, 2)}</pre>
                </Section>
              )}
              {selected.after_snapshot && (
                <Section title="After snapshot">
                  <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">{JSON.stringify(selected.after_snapshot, null, 2)}</pre>
                </Section>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground tracking-wide">{label}</div>
      <div className="text-xs font-mono break-all">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}
