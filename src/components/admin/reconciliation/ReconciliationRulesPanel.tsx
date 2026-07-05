import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Play, Pencil, Trash2 } from 'lucide-react';
import {
  useReconciliationRules,
  useSaveReconciliationRule,
  useDeleteReconciliationRule,
  useApplyReconciliationRules,
  type ReconciliationRule,
  type MatchField,
  type MatchType,
} from '@/hooks/useReconciliationRules';

interface Draft {
  id?: string;
  name: string;
  priority: number;
  match_field: MatchField;
  match_type: MatchType;
  pattern: string;
  suggested_account_code: string;
  suggested_category: string;
}

const emptyDraft = (): Draft => ({
  name: '',
  priority: 100,
  match_field: 'counterparty',
  match_type: 'contains',
  pattern: '',
  suggested_account_code: '',
  suggested_category: '',
});

export function ReconciliationRulesPanel() {
  const { data: rules = [], isLoading } = useReconciliationRules();
  const save = useSaveReconciliationRule();
  const del = useDeleteReconciliationRule();
  const apply = useApplyReconciliationRules();

  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());

  const openCreate = () => {
    setDraft(emptyDraft());
    setEditorOpen(true);
  };
  const openEdit = (r: ReconciliationRule) => {
    setDraft({
      id: r.id,
      name: r.name,
      priority: r.priority,
      match_field: r.match_field,
      match_type: r.match_type,
      pattern: r.pattern,
      suggested_account_code: r.suggested_account_code ?? '',
      suggested_category: r.suggested_category ?? '',
    });
    setEditorOpen(true);
  };

  const submit = async () => {
    if (!draft.name.trim() || !draft.pattern.trim()) return;
    await save.mutateAsync({
      mode: draft.id ? 'update' : 'create',
      p_rule_id: draft.id,
      p_name: draft.name.trim(),
      p_match_field: draft.match_field,
      p_match_type: draft.match_type,
      p_pattern: draft.pattern.trim(),
      p_suggested_account_code: draft.suggested_account_code.trim() || undefined,
      p_suggested_category: draft.suggested_category.trim() || undefined,
      p_priority: Number(draft.priority) || 100,
    });
    setEditorOpen(false);
  };

  const sorted = [...rules].sort((a, b) => a.priority - b.priority);

  return (
    <>
      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Auto-categorisation rules</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Lower priority wins first. Rules tag unmatched transactions with a suggested account.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => apply.mutate()}
              disabled={apply.isPending || rules.length === 0}
            >
              <Play className="h-4 w-4 mr-2" />
              {apply.isPending ? 'Running…' : 'Run rules now'}
            </Button>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              New rule
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Priority</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead>Pattern</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : sorted.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No rules yet — create one to automate bank coding.
                    </TableCell>
                  </TableRow>
                ) : (
                  sorted.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono">{r.priority}</TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="secondary">{r.match_field}</Badge>
                          <Badge variant="outline">{r.match_type}</Badge>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs max-w-xs truncate">{r.pattern}</TableCell>
                      <TableCell className="font-mono text-sm">{r.suggested_account_code || '—'}</TableCell>
                      <TableCell className="text-sm">{r.suggested_category || '—'}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm(`Delete rule "${r.name}"?`)) del.mutate(r.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft.id ? 'Edit rule' : 'New rule'}</DialogTitle>
            <DialogDescription>
              Match a text field on incoming transactions and suggest an account code.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="rule-name">Name</Label>
              <Input
                id="rule-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Google Ads → 6541"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="rule-priority">Priority</Label>
                <Input
                  id="rule-priority"
                  type="number"
                  value={draft.priority}
                  onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Match field</Label>
                <Select
                  value={draft.match_field}
                  onValueChange={(v) => setDraft({ ...draft, match_field: v as MatchField })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="counterparty">Counterparty</SelectItem>
                    <SelectItem value="reference">Reference</SelectItem>
                    <SelectItem value="description">Description</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Match type</Label>
                <Select
                  value={draft.match_type}
                  onValueChange={(v) => setDraft({ ...draft, match_type: v as MatchType })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contains">Contains</SelectItem>
                    <SelectItem value="equals">Equals</SelectItem>
                    <SelectItem value="regex">Regex</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rule-pattern">Pattern</Label>
                <Input
                  id="rule-pattern"
                  value={draft.pattern}
                  onChange={(e) => setDraft({ ...draft, pattern: e.target.value })}
                  placeholder="e.g. GOOGLE"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="rule-account">Target account code</Label>
                <Input
                  id="rule-account"
                  value={draft.suggested_account_code}
                  onChange={(e) => setDraft({ ...draft, suggested_account_code: e.target.value })}
                  placeholder="e.g. 6541"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rule-category">Category (optional)</Label>
                <Input
                  id="rule-category"
                  value={draft.suggested_category}
                  onChange={(e) => setDraft({ ...draft, suggested_category: e.target.value })}
                  placeholder="e.g. Marketing"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={save.isPending || !draft.name.trim() || !draft.pattern.trim()}>
              {save.isPending ? 'Saving…' : draft.id ? 'Save changes' : 'Create rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
