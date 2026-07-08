import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Pencil } from "lucide-react";
import {
  useSubscriptionPlans,
  useUpsertSubscriptionPlan,
  useDeleteSubscriptionPlan,
  type SubscriptionPlan,
} from "@/hooks/useSubscriptionPlans";

const empty: Partial<SubscriptionPlan> = {
  name: "",
  description: "",
  product_name: "",
  unit_amount_cents: 0,
  currency: "EUR",
  billing_interval: "month",
  billing_interval_count: 1,
  trial_days: 0,
  commitment_months: 0,
  is_active: true,
};

export function SubscriptionPlansTab() {
  const { data: plans = [] } = useSubscriptionPlans();
  const upsert = useUpsertSubscriptionPlan();
  const del = useDeleteSubscriptionPlan();
  const [draft, setDraft] = useState<Partial<SubscriptionPlan>>(empty);
  const [priceInput, setPriceInput] = useState<string>("");
  const editing = Boolean(draft.id);

  const startEdit = (p: SubscriptionPlan) => {
    setDraft(p);
    setPriceInput((p.unit_amount_cents / 100).toString());
  };
  const reset = () => { setDraft(empty); setPriceInput(""); };

  const save = () => {
    if (!draft.name?.trim() || !draft.product_name?.trim()) return;
    const cents = Math.round(Number(priceInput || 0) * 100);
    if (cents < 0) return;
    upsert.mutate(
      {
        ...(draft as SubscriptionPlan),
        name: draft.name!.trim(),
        product_name: draft.product_name!.trim(),
        unit_amount_cents: cents,
      },
      { onSuccess: reset }
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{editing ? "Edit plan" : "New plan"}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Internal name *</Label>
              <Input value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Starter Monthly" />
            </div>
            <div className="space-y-1">
              <Label>Product / plan name (shown on invoice) *</Label>
              <Input value={draft.product_name ?? ""} onChange={(e) => setDraft({ ...draft, product_name: e.target.value })} placeholder="Starter" />
            </div>
            <div className="space-y-1">
              <Label>Price *</Label>
              <Input type="number" step="0.01" value={priceInput} onChange={(e) => setPriceInput(e.target.value)} placeholder="49.00" />
            </div>
            <div className="space-y-1">
              <Label>Currency</Label>
              <Select value={draft.currency ?? "EUR"} onValueChange={(v) => setDraft({ ...draft, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["EUR","SEK","USD","GBP","NOK","DKK"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Billing interval</Label>
              <Select value={draft.billing_interval ?? "month"} onValueChange={(v) => setDraft({ ...draft, billing_interval: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Monthly</SelectItem>
                  <SelectItem value="year">Yearly</SelectItem>
                  <SelectItem value="week">Weekly</SelectItem>
                  <SelectItem value="day">Daily</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Interval count</Label>
              <Input type="number" min={1} value={draft.billing_interval_count ?? 1}
                onChange={(e) => setDraft({ ...draft, billing_interval_count: Number(e.target.value) })} />
            </div>
            <div className="space-y-1">
              <Label>Trial (days)</Label>
              <Input type="number" min={0} value={draft.trial_days ?? 0}
                onChange={(e) => setDraft({ ...draft, trial_days: Number(e.target.value) })} />
            </div>
            <div className="space-y-1">
              <Label>Commitment (months)</Label>
              <Input type="number" min={0} value={draft.commitment_months ?? 0}
                onChange={(e) => setDraft({ ...draft, commitment_months: Number(e.target.value) })} />
            </div>
            <div className="md:col-span-2 space-y-1">
              <Label>Description</Label>
              <Textarea rows={2} value={draft.description ?? ""}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Notes / features summary" />
            </div>
            <div className="md:col-span-2 flex items-center gap-2">
              <Switch checked={draft.is_active ?? true} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} />
              <span className="text-sm">Active</span>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            {editing && <Button variant="outline" size="sm" onClick={reset}>Cancel edit</Button>}
            <Button size="sm" onClick={save} disabled={!draft.name?.trim() || !draft.product_name?.trim() || upsert.isPending}>
              <Plus className="h-3.5 w-3.5 mr-1" /> {editing ? "Save changes" : "Create plan"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Plans</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Trial</TableHead>
                <TableHead>Commitment</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium text-sm">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.product_name}</div>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {(p.unit_amount_cents / 100).toFixed(2)} {p.currency.toUpperCase()} / {p.billing_interval}
                  </TableCell>
                  <TableCell className="text-sm">{p.trial_days > 0 ? `${p.trial_days} d` : "—"}</TableCell>
                  <TableCell className="text-sm">{p.commitment_months > 0 ? `${p.commitment_months} mo` : "—"}</TableCell>
                  <TableCell>{p.is_active ? <Badge variant="default">Active</Badge> : <Badge variant="outline">Inactive</Badge>}</TableCell>
                  <TableCell className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => startEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => confirm(`Delete plan "${p.name}"?`) && del.mutate(p.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {plans.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">
                    No plan templates yet. Create one above to speed up new subscription setup.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
