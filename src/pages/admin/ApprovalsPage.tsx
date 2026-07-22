import { useState } from 'react';
import { useApprovals, usePendingApprovals, useApprovalRules } from '@/hooks/useApprovals';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle2, XCircle, ShieldCheck, Plus, Loader2, Bot, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useGatedSkills } from '@/hooks/useGatedSkills';
import { InboxSection } from './ApprovalInboxPage';
import { ChainsSection, GroupsSection } from './ApprovalChainsPage';
import { AgentSkillApprovalHeader, AgentSkillApprovalBody } from '@/components/admin/approvals/AgentSkillApprovalCard';
import { useFormatAmount } from '@/lib/format-currency';


export default function ApprovalsPage() {
  const { data: pending, isLoading: pendingLoading } = usePendingApprovals();
  const { data: rules, isLoading: rulesLoading } = useApprovalRules();
  const { decide } = useApprovals();
  const [comment, setComment] = useState<Record<string, string>>({});
  const qc = useQueryClient();
  const formatAmount = useFormatAmount();

  const handleDecide = async (id: string, decision: 'approve' | 'reject') => {
    try {
      await decide.mutateAsync({ request_id: id, decision, comment: comment[id] });
      toast.success(`Request ${decision}d`);
      setComment((c) => ({ ...c, [id]: '' }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  };

  // Create rule form state
  const [ruleOpen, setRuleOpen] = useState(false);
  const [newRule, setNewRule] = useState({
    name: '',
    description: '',
    entity_type: 'expense_report',
    amount_threshold_cents: '',
    currency: 'SEK',
    required_role: 'admin' as 'admin' | 'approver' | 'writer',
    priority: 100,
  });

  const createRule = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from('approval_rules').insert({
        name: newRule.name,
        description: newRule.description || null,
        entity_type: newRule.entity_type,
        amount_threshold_cents: newRule.amount_threshold_cents ? Math.round(parseFloat(newRule.amount_threshold_cents) * 100) : null,
        currency: newRule.currency,
        required_role: newRule.required_role,
        priority: newRule.priority,
        created_by: userData.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approvals', 'rules'] });
      setRuleOpen(false);
      setNewRule({ name: '', description: '', entity_type: 'expense_report', amount_threshold_cents: '', currency: 'SEK', required_role: 'admin', priority: 100 });
      toast.success('Rule created');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const toggleRule = useMutation({
    mutationFn: async (input: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('approval_rules').update({ is_active: input.is_active }).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approvals', 'rules'] }),
  });

  return (
    <AdminLayout>
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Approvals</h1>
          <p className="text-muted-foreground">Generic approval workflow used across modules</p>
        </div>
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending">
            Requests {pending && pending.length > 0 && <Badge variant="secondary" className="ml-2">{pending.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="inbox">Chain Inbox</TabsTrigger>
          <TabsTrigger value="chains">Chains</TabsTrigger>
          <TabsTrigger value="groups">Groups</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="gated-skills">Gated Skills</TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Pending approval requests that follow a multi-step chain. Review and approve/reject items currently waiting on you or other reviewers.
          </p>
          <InboxSection />
        </TabsContent>
        <TabsContent value="chains" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Define multi-step approval workflows. Each chain specifies an entity type, roles/groups, and step order. These templates are used when a request needs sign-off.
          </p>
          <ChainsSection />
        </TabsContent>
        <TabsContent value="groups" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Approval groups are named sets of users. Use them in chains where any member of the group can approve.
          </p>
          <GroupsSection />
        </TabsContent>

        <TabsContent value="pending" className="space-y-4">
          {pendingLoading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
          {!pendingLoading && pending && pending.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                <p>No pending approvals — you're all caught up.</p>
              </CardContent>
            </Card>
          )}
          {pending?.map((req) => {
            const ctx = (req.context ?? {}) as Record<string, unknown>;
            const isAgentSkill = req.entity_type === 'agent_skill';
            const skillName = typeof ctx.skill_name === 'string' ? ctx.skill_name : null;
            const agent = typeof ctx.agent === 'string' ? ctx.agent : null;
            const argsPreview = ctx.args ? JSON.stringify(ctx.args, null, 2) : null;
            return (
            <Card key={req.id}>
              {isAgentSkill ? (
                <AgentSkillApprovalHeader
                  entityId={req.entity_id}
                  reason={req.reason}
                  createdAt={req.created_at}
                  requiredRole={req.required_role}
                  context={ctx}
                />
              ) : (
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Badge variant="default">{req.entity_type}</Badge>
                        <span className="font-mono text-xs text-muted-foreground">{req.entity_id}</span>
                        {agent && <Badge variant="outline" className="text-xs">via {agent}</Badge>}
                      </CardTitle>
                      <CardDescription>
                        {formatAmount(req.amount_cents, req.currency)} · requires <span className="font-medium">{req.required_role}</span> · requested {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              )}
              <CardContent className="space-y-3">
                {!isAgentSkill && req.reason && <p className="text-sm">{req.reason}</p>}
                {isAgentSkill && <AgentSkillApprovalBody context={ctx} />}
                {!isAgentSkill && argsPreview && (
                  <details className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
                    <summary className="cursor-pointer font-medium text-muted-foreground">Arguments</summary>
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono">{argsPreview}</pre>
                  </details>
                )}
                <Textarea
                  placeholder="Optional comment for the audit log…"
                  value={comment[req.id] ?? ''}
                  onChange={(e) => setComment((c) => ({ ...c, [req.id]: e.target.value }))}
                  rows={2}
                />
                <div className="flex gap-2">
                  <Button onClick={() => handleDecide(req.id, 'approve')} disabled={decide.isPending}>
                    <CheckCircle2 className="h-4 w-4 mr-2" /> Approve
                  </Button>
                  <Button variant="outline" onClick={() => handleDecide(req.id, 'reject')} disabled={decide.isPending}>
                    <XCircle className="h-4 w-4 mr-2" /> Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="rules" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={ruleOpen} onOpenChange={setRuleOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" /> New rule</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create approval rule</DialogTitle>
                  <DialogDescription>Define when an entity needs sign-off.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div>
                    <Label>Name</Label>
                    <Input value={newRule.name} onChange={(e) => setNewRule({ ...newRule, name: e.target.value })} />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Input value={newRule.description} onChange={(e) => setNewRule({ ...newRule, description: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Entity type</Label>
                      <Select value={newRule.entity_type} onValueChange={(v) => setNewRule({ ...newRule, entity_type: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="expense_report">Expense report</SelectItem>
                          <SelectItem value="purchase_order">Purchase order</SelectItem>
                          <SelectItem value="invoice">Invoice</SelectItem>
                          <SelectItem value="quote">Quote</SelectItem>
                          <SelectItem value="contract">Contract</SelectItem>
                          <SelectItem value="agent_skill">Agent skill (autonomous action)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Required role</Label>
                      <Select value={newRule.required_role} onValueChange={(v) => setNewRule({ ...newRule, required_role: v as 'admin' | 'approver' | 'writer' })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="approver">Approver</SelectItem>
                          <SelectItem value="writer">Writer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Threshold (in {newRule.currency})</Label>
                      <Input
                        type="number"
                        placeholder="empty = always require"
                        value={newRule.amount_threshold_cents}
                        onChange={(e) => setNewRule({ ...newRule, amount_threshold_cents: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Currency</Label>
                      <Input value={newRule.currency} onChange={(e) => setNewRule({ ...newRule, currency: e.target.value.toUpperCase() })} />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setRuleOpen(false)}>Cancel</Button>
                  <Button onClick={() => createRule.mutate()} disabled={!newRule.name || createRule.isPending}>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {rulesLoading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
          {rules && rules.length > 0 && (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Threshold</TableHead>
                    <TableHead>Required role</TableHead>
                    <TableHead>Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell className="font-medium">
                        {rule.name}
                        {rule.description && <div className="text-xs text-muted-foreground">{rule.description}</div>}
                      </TableCell>
                      <TableCell><Badge variant="outline">{rule.entity_type}</Badge></TableCell>
                      <TableCell>{formatAmount(rule.amount_threshold_cents, rule.currency)}</TableCell>
                      <TableCell><Badge>{rule.required_role}</Badge></TableCell>
                      <TableCell>
                        <Button size="sm" variant={rule.is_active ? 'default' : 'outline'} onClick={() => toggleRule.mutate({ id: rule.id, is_active: !rule.is_active })}>
                          {rule.is_active ? 'Active' : 'Inactive'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="gated-skills" className="space-y-4">
          <GatedSkillsPanel />
        </TabsContent>
      </Tabs>
    </div>
    </AdminLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Gated Skills — transparent catalog of every agent skill that requires
// approval or notify. Built from agent_skills + the unified module registry.
// ─────────────────────────────────────────────────────────────────────────────
function GatedSkillsPanel() {
  const [search, setSearch] = useState('');
  const [trustFilter, setTrustFilter] = useState<'all' | 'approve' | 'notify'>('all');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [mcpFilter, setMcpFilter] = useState<'all' | 'exposed' | 'internal'>('all');

  const qc = useQueryClient();
  const { data: skills, isLoading } = useGatedSkills();

  const updateTrust = useMutation({
    mutationFn: async ({ name, trust_level }: { name: string; trust_level: 'auto' | 'notify' | 'approve' }) => {
      // trust_level and requires_staging are one dial to the user:
      // approve = staged (HIL gate), anything else = direct execution.
      // Keep them in lockstep — the runtime gates on requires_staging
      // (system-sweep finding #A1, 2026-07-07).
      const { error } = await supabase
        .from('agent_skills')
        .update({ trust_level, requires_staging: trust_level === 'approve' } as never)
        .eq('name', name);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(`${vars.name} → ${vars.trust_level}`);
      qc.invalidateQueries({ queryKey: ['approvals', 'gated-skills'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Failed to update trust level'),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading skill catalog…
      </div>
    );
  }

  if (!skills || skills.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Bot className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
          <p>No gated skills — every enabled agent action runs autonomously.</p>
        </CardContent>
      </Card>
    );
  }

  // Available modules for the filter dropdown (built from full unfiltered list)
  const allModules = Array.from(
    new Set(skills.map((s) => s.moduleName ?? '— Core / unowned —'))
  ).sort();

  // Apply filters
  const q = search.trim().toLowerCase();
  const filtered = skills.filter((s) => {
    if (trustFilter !== 'all' && s.trust_level !== trustFilter) return false;
    if (moduleFilter !== 'all' && (s.moduleName ?? '— Core / unowned —') !== moduleFilter) return false;
    if (mcpFilter === 'exposed' && !s.mcp_exposed) return false;
    if (mcpFilter === 'internal' && s.mcp_exposed) return false;
    if (q && !s.name.toLowerCase().includes(q) && !(s.description?.toLowerCase().includes(q))) return false;
    return true;
  });

  // Group filtered list by module
  const groups = new Map<string, GatedSkillRow[]>();
  for (const s of filtered) {
    const key = s.moduleName ?? '— Core / unowned —';
    const arr = groups.get(key) ?? [];
    arr.push(s);
    groups.set(key, arr);
  }

  const approveCount = filtered.filter((s) => s.trust_level === 'approve').length;
  const notifyCount = filtered.filter((s) => s.trust_level === 'notify').length;
  const orphanCount = filtered.filter((s) => !s.moduleId).length;
  const totalCount = skills.length;
  const hasActiveFilter =
    !!q || trustFilter !== 'all' || moduleFilter !== 'all' || mcpFilter !== 'all';

  return (
    <>
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="py-4 flex gap-3 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="space-y-1">
            <p className="font-medium text-amber-700 dark:text-amber-300">Runtime override</p>
            <p className="text-muted-foreground">
              Trust levels changed here are stored in the database and survive a reseed or upgrade. Only skill definition fields (description, instructions, tool_definition, handler) are overwritten from code.
            </p>
            <p className="text-xs text-muted-foreground">
              To make a trust-level change permanent in code, update the skill's <code className="font-mono text-amber-700 dark:text-amber-300">trust_level</code> in the module's <code className="font-mono text-amber-700 dark:text-amber-300">skillSeeds</code> and run <code className="font-mono text-amber-700 dark:text-amber-300">npm run sync:skills -- --apply</code>.
            </p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="py-4 space-y-4">
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <div className="text-2xl font-semibold">{approveCount}</div>
              <div className="text-muted-foreground">require approval</div>
            </div>
            <div>
              <div className="text-2xl font-semibold">{notifyCount}</div>
              <div className="text-muted-foreground">notify on use</div>
            </div>
            <div>
              <div className="text-2xl font-semibold">
                {filtered.length}
                {hasActiveFilter && (
                  <span className="text-base font-normal text-muted-foreground"> / {totalCount}</span>
                )}
              </div>
              <div className="text-muted-foreground">{hasActiveFilter ? 'matching' : 'gated total'}</div>
            </div>

            {orphanCount > 0 && (
              <div className="ml-auto flex items-center gap-2 text-amber-600 dark:text-amber-400 max-w-md">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="text-xs">
                  {orphanCount} gated skill(s) exist in <code className="font-mono">agent_skills</code> but no module declares them via <code className="font-mono">defineModule()</code>. They still work, but won't be enabled/disabled with any module — see "Core / unowned" below.
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-3 border-t pt-4">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs text-muted-foreground">Search</Label>
              <Input
                placeholder="Skill name or description…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="w-40">
              <Label className="text-xs text-muted-foreground">Trust level</Label>
              <Select value={trustFilter} onValueChange={(v) => setTrustFilter(v as typeof trustFilter)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="approve">Approve</SelectItem>
                  <SelectItem value="notify">Notify</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-56">
              <Label className="text-xs text-muted-foreground">Module</Label>
              <Select value={moduleFilter} onValueChange={setModuleFilter}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All modules</SelectItem>
                  {allModules.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <Label className="text-xs text-muted-foreground">MCP</Label>
              <Select value={mcpFilter} onValueChange={(v) => setMcpFilter(v as typeof mcpFilter)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="exposed">Exposed</SelectItem>
                  <SelectItem value="internal">Internal only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {hasActiveFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSearch(''); setTrustFilter('all'); setModuleFilter('all'); setMcpFilter('all'); }}
              >
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            No skills match the current filters.
          </CardContent>
        </Card>
      )}



      {Array.from(groups.entries())
        .sort(([a], [b]) => {
          if (a.startsWith('—')) return -1;
          if (b.startsWith('—')) return 1;
          return a.localeCompare(b);
        })
        .map(([moduleName, items]) => (
        <Card key={moduleName}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {moduleName}
              <Badge variant="outline" className="font-normal">{items.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Skill</TableHead>
                  <TableHead>Trust</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>MCP</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead className="text-right">30d</TableHead>
                  <TableHead>Last requested</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((s) => (
                  <TableRow key={s.name}>
                    <TableCell>
                      <div className="font-mono text-sm">{s.name}</div>
                      {s.description && (
                        <div className="text-xs text-muted-foreground line-clamp-2 max-w-xl">
                          {s.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={s.trust_level}
                        onValueChange={(v) =>
                          updateTrust.mutate({ name: s.name, trust_level: v as 'auto' | 'notify' | 'approve' })
                        }
                        disabled={updateTrust.isPending}
                      >
                        <SelectTrigger className="h-7 w-[110px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">auto</SelectItem>
                          <SelectItem value="notify">notify</SelectItem>
                          <SelectItem value="approve">approve</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {s.category && <Badge variant="outline" className="text-xs">{s.category}</Badge>}
                    </TableCell>
                    <TableCell>
                      {s.mcp_exposed ? (
                        <Badge variant="outline" className="text-xs">exposed</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.pendingCount > 0 ? (
                        <Badge>{s.pendingCount}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm">{s.recentCount}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.lastRequestedAt
                        ? formatDistanceToNow(new Date(s.lastRequestedAt), { addSuffix: true })
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </>
  );
}

type GatedSkillRow = ReturnType<typeof useGatedSkills>['data'] extends (infer U)[] | undefined
  ? U
  : never;

