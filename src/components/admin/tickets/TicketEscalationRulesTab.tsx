import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Play, Trash2 } from "lucide-react";
import {
  useTicketEscalationRules,
  useUpsertEscalationRule,
  useDeleteEscalationRule,
  useRunEscalations,
  type TicketEscalationRule,
} from "@/hooks/useTicketEscalationRules";

const emptyRule: Partial<TicketEscalationRule> = {
  name: "",
  is_active: true,
  match_status: null,
  match_priority: null,
  match_unassigned: false,
  age_hours: 24,
  age_field: "created_at",
  action_raise_priority: null,
  action_notify: true,
};

export function TicketEscalationRulesTab() {
  const { data: rules = [] } = useTicketEscalationRules();
  const upsert = useUpsertEscalationRule();
  const del = useDeleteEscalationRule();
  const run = useRunEscalations();

  const [draft, setDraft] = useState<Partial<TicketEscalationRule>>(emptyRule);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">New rule</CardTitle>
          <Button size="sm" variant="outline" onClick={() => run.mutate()} disabled={run.isPending}>
            <Play className="h-3.5 w-3.5 mr-1" /> Run sweep now
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              placeholder="Rule name (e.g. Unassigned > 4h)"
              value={draft.name ?? ""}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="h-8 text-sm"
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Age hours</span>
              <Input
                type="number"
                min={1}
                value={draft.age_hours ?? 24}
                onChange={(e) => setDraft({ ...draft, age_hours: Number(e.target.value) })}
                className="h-8 text-sm w-24"
              />
              <Select
                value={draft.age_field ?? "created_at"}
                onValueChange={(v) => setDraft({ ...draft, age_field: v as never })}
              >
                <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at">since created</SelectItem>
                  <SelectItem value="updated_at">since updated</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Select
              value={draft.match_status ?? "any"}
              onValueChange={(v) => setDraft({ ...draft, match_status: v === "any" ? null : v })}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Match status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any status</SelectItem>
                {["new","open","in_progress","waiting"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select
              value={draft.match_priority ?? "any"}
              onValueChange={(v) => setDraft({ ...draft, match_priority: v === "any" ? null : v })}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Match priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any priority</SelectItem>
                {["low","medium","high","urgent"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Switch
                checked={draft.match_unassigned ?? false}
                onCheckedChange={(v) => setDraft({ ...draft, match_unassigned: v })}
              />
              <span className="text-sm">Only unassigned tickets</span>
            </div>

            <Select
              value={draft.action_raise_priority ?? "none"}
              onValueChange={(v) => setDraft({ ...draft, action_raise_priority: v === "none" ? null : v })}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Raise priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Don't raise priority</SelectItem>
                {["medium","high","urgent"].map(p => <SelectItem key={p} value={p}>Raise to {p}</SelectItem>)}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Switch
                checked={draft.action_notify ?? true}
                onCheckedChange={(v) => setDraft({ ...draft, action_notify: v })}
              />
              <span className="text-sm">Log to support_escalations</span>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <Button
              size="sm"
              disabled={!draft.name?.trim() || upsert.isPending}
              onClick={() => upsert.mutate(
                { ...(draft as TicketEscalationRule), name: draft.name!.trim() },
                { onSuccess: () => setDraft(emptyRule) }
              )}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Save rule
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Active rules</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium text-sm">{r.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    &gt; {r.age_hours}h {r.age_field === "updated_at" ? "since updated" : "old"}
                    {r.match_status && `, status=${r.match_status}`}
                    {r.match_priority && `, priority=${r.match_priority}`}
                    {r.match_unassigned && `, unassigned`}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.action_raise_priority && <div>Raise → {r.action_raise_priority}</div>}
                    {r.action_notify && <div>Notify</div>}
                    {r.action_reassign_to && <div>Reassign ({r.action_reassign_kind})</div>}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={r.is_active}
                      onCheckedChange={(v) => upsert.mutate({ id: r.id, name: r.name, is_active: v })}
                    />
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => confirm(`Delete rule "${r.name}"?`) && del.mutate(r.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {rules.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground">No rules configured</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
