import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase as supabaseTyped } from '@/integrations/supabase/client';
// New tables/RPCs not in generated types yet — bypass strict typing.
const supabase = supabaseTyped;
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

interface ChainStep {
  sort_order: number;
  required_role?: string | null;
  group_id?: string | null;
  min_approvals?: number;
}

interface Chain {
  id: string;
  name: string;
  entity_type: string;
  is_active: boolean;
  steps: ChainStep[];
}

interface Group { id: string; name: string }

const ROLES = ['admin', 'approver', 'writer', 'accounting', 'hr', 'sales', 'support'];
const ENTITY_TYPES = ['expense_report', 'vendor_invoice', 'purchase_order', 'leave_request', 'agent_action'];

export default function ApprovalChainsPage() {
  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader title="Approval chains" description="Multi-step approval rules and groups." />
        <Tabs defaultValue="chains">
          <TabsList>
            <TabsTrigger value="chains">Chains</TabsTrigger>
            <TabsTrigger value="groups">Groups</TabsTrigger>
          </TabsList>
          <TabsContent value="chains" className="mt-4"><ChainsSection /></TabsContent>
          <TabsContent value="groups" className="mt-4"><GroupsSection /></TabsContent>
        </Tabs>
      </AdminPageContainer>
    </AdminLayout>
  );
}

export function ChainsSection() {
  const qc = useQueryClient();

  const { data: chains, isLoading } = useQuery({
    queryKey: ['approval-chains'],
    queryFn: async () => {
      const { data: c, error } = await supabase
        .from('approval_chains')
        .select('id,name,entity_type,is_active')
        .order('name');
      if (error) throw error;
      const { data: s } = await supabase
        .from('approval_steps')
        .select('chain_id,sort_order,required_role,group_id,min_approvals')
        .order('sort_order');
      return (c ?? []).map(ch => ({
        ...ch,
        steps: (s ?? []).filter((x: any) => x.chain_id === ch.id),
      })) as Chain[];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('manage_approval_chain', {
        p_action: 'delete_chain',
        p_chain_id: id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approval-chains'] });
      toast.success('Chain deleted');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <CreateChainForm />
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="space-y-2">
          {chains?.map(c => (
            <Card key={c.id}>
              <CardContent className="p-3 flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-[200px]">
                  <p className="font-medium text-sm">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.entity_type}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {c.steps.map(s => (
                    <Badge key={s.sort_order} variant="secondary" className="text-xs">
                      {s.sort_order}. {s.required_role ?? 'group'} × {s.min_approvals ?? 1}
                    </Badge>
                  ))}
                </div>
                <Button size="icon" variant="ghost" onClick={() => remove.mutate(c.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateChainForm() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [entityType, setEntityType] = useState('expense_report');
  const [steps, setSteps] = useState<ChainStep[]>([{ sort_order: 1, required_role: 'approver', min_approvals: 1 }]);

  const { data: groups } = useQuery({
    queryKey: ['approval-groups'],
    queryFn: async () => {
      const { data, error } = await supabase.from('approval_groups').select('id,name').order('name');
      if (error) throw error;
      return data as Group[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('manage_approval_chain', {
        p_action: 'create_chain',
        p_name: name,
        p_entity_type: entityType,
        p_steps: steps as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setName('');
      setSteps([{ sort_order: 1, required_role: 'approver', min_approvals: 1 }]);
      qc.invalidateQueries({ queryKey: ['approval-chains'] });
      toast.success('Chain created');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStep = (i: number, patch: Partial<ChainStep>) =>
    setSteps(s => s.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">New chain</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Entity type</Label>
            <Select value={entityType} onValueChange={setEntityType}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ENTITY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Steps</Label>
          {steps.map((s, i) => {
            const kind = s.group_id ? 'group' : 'role';
            return (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                <span className="text-xs font-mono w-6">{s.sort_order}</span>
                <Select value={kind} onValueChange={v => updateStep(i, v === 'role' ? { group_id: null, required_role: 'approver' } : { required_role: null, group_id: groups?.[0]?.id ?? null })}>
                  <SelectTrigger className="h-7 w-20 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="role">Role</SelectItem><SelectItem value="group">Group</SelectItem></SelectContent>
                </Select>
                {kind === 'role' ? (
                  <Select value={s.required_role ?? 'approver'} onValueChange={v => updateStep(i, { required_role: v, group_id: null })}>
                    <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <Select value={s.group_id ?? ''} onValueChange={v => updateStep(i, { group_id: v, required_role: null })}>
                    <SelectTrigger className="h-7 w-40 text-xs"><SelectValue placeholder="Pick group" /></SelectTrigger>
                    <SelectContent>{groups?.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                <Input
                  type="number"
                  min={1}
                  value={s.min_approvals ?? 1}
                  onChange={e => updateStep(i, { min_approvals: Number(e.target.value) || 1 })}
                  className="h-7 w-16 text-xs"
                />
                <Button size="icon" variant="ghost" onClick={() => setSteps(steps.filter((_, idx) => idx !== i))}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSteps([...steps, { sort_order: steps.length + 1, required_role: 'approver', min_approvals: 1 }])}
          >
            <Plus className="h-3.5 w-3.5" /> Step
          </Button>
        </div>

        <Button size="sm" disabled={!name || !steps.length || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Create chain
        </Button>
      </CardContent>
    </Card>
  );
}

export function GroupsSection() {
  const qc = useQueryClient();
  const [name, setName] = useState('');

  const { data: groups } = useQuery({
    queryKey: ['approval-groups-with-members'],
    queryFn: async () => {
      const { data: g, error } = await supabase.from('approval_groups').select('id,name').order('name');
      if (error) throw error;
      const { data: m } = await supabase.from('approval_group_members').select('group_id,user_id');
      return (g ?? []).map(grp => ({
        ...grp,
        members: (m ?? []).filter((x: any) => x.group_id === grp.id).map((x: any) => x.user_id as string),
      }));
    },
  });

  const { data: users } = useQuery({
    queryKey: ['profiles-min'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id,full_name,email').limit(200);
      if (error) throw error;
      return data as Array<{ id: string; full_name: string | null; email: string | null }>;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('manage_approval_chain', {
        p_action: 'create_group',
        p_name: name,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setName('');
      qc.invalidateQueries({ queryKey: ['approval-groups-with-members'] });
      qc.invalidateQueries({ queryKey: ['approval-groups'] });
      toast.success('Group created');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setMembers = useMutation({
    mutationFn: async (input: { group_id: string; user_ids: string[] }) => {
      const { error } = await supabase.rpc('manage_approval_chain', {
        p_action: 'set_group_members',
        p_group_id: input.group_id,
        p_user_ids: input.user_ids,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approval-groups-with-members'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 flex items-end gap-2">
          <div className="space-y-1 flex-1 max-w-xs">
            <Label className="text-xs">New group</Label>
            <Input value={name} onChange={e => setName(e.target.value)} className="h-8 text-sm" />
          </div>
          <Button size="sm" disabled={!name || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add group
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {groups?.map(g => (
          <Card key={g.id}>
            <CardContent className="p-3 space-y-2">
              <p className="font-medium text-sm">{g.name}</p>
              <MemberPicker
                allUsers={users ?? []}
                memberIds={g.members}
                onChange={ids => setMembers.mutate({ group_id: g.id, user_ids: ids })}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function MemberPicker({
  allUsers,
  memberIds,
  onChange,
}: {
  allUsers: Array<{ id: string; full_name: string | null; email: string | null }>;
  memberIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const userById = new Map(allUsers.map(u => [u.id, u]));
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {memberIds.map(id => {
          const u = userById.get(id);
          return (
            <Badge key={id} variant="secondary" className="gap-1 text-xs">
              {u?.full_name ?? u?.email ?? id.slice(0, 8)}
              <button onClick={() => onChange(memberIds.filter(x => x !== id))} className="ml-0.5 opacity-60 hover:opacity-100">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          );
        })}
      </div>
      <Select value="" onValueChange={v => v && !memberIds.includes(v) && onChange([...memberIds, v])}>
        <SelectTrigger className="h-8 w-60 text-xs"><SelectValue placeholder="Add member…" /></SelectTrigger>
        <SelectContent>
          {allUsers.filter(u => !memberIds.includes(u.id)).map(u => (
            <SelectItem key={u.id} value={u.id}>{u.full_name ?? u.email ?? u.id.slice(0, 8)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
