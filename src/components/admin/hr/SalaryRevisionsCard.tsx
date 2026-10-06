import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Check, Plus, Play, X } from "lucide-react";
import { toast } from "sonner";
import { useHrQuery, useHrMutation } from "@/hooks/useHrOps";
import { usePlatformFormat } from "@/hooks/usePlatformFormat";

type Totals = {
  headcount: number;
  included: number;
  excluded: number;
  total_current_cents: number;
  total_proposed_cents: number;
  delta_cents: number;
  annual_delta_cents: number;
  delta_pct: number | null;
  budget_pct: number | null;
  budget_cents: number | null;
  budget_limit_cents: number | null;
  within_budget: boolean;
  over_by_cents: number;
  out_of_band_after: number;
  by_department: Array<{ department: string; headcount: number; current_cents: number; proposed_cents: number; delta_pct: number | null }>;
};

type Revision = {
  id: string;
  name: string;
  effective_date: string;
  status: "draft" | "approved" | "applied" | "cancelled";
  budget_pct: number | null;
  budget_cents: number | null;
  default_pct: number;
  notes: string | null;
  approved_at: string | null;
  applied_at: string | null;
  totals: Totals;
};

type Line = {
  id: string;
  employee_id: string;
  name: string;
  title: string | null;
  department: string | null;
  grade_code: string | null;
  current_cents: number;
  proposed_cents: number;
  change_pct: number | null;
  recommended_pct: number | null;
  review_id: string | null;
  compa_before: number | null;
  compa_after: number | null;
  in_band: boolean | null;
  rationale: string | null;
  status: "proposed" | "excluded" | "applied";
};

const STATUS_VARIANT: Record<Revision["status"], "secondary" | "default" | "outline" | "destructive"> = {
  draft: "secondary",
  approved: "default",
  applied: "outline",
  cancelled: "destructive",
};

const LIST_KEYS: string[][] = [["manage_compensation_revision", "list"]];

export function SalaryRevisionsCard() {
  const [openId, setOpenId] = useState<string | null>(null);
  return openId ? <RevisionDetail id={openId} onBack={() => setOpenId(null)} /> : <RevisionList onOpen={setOpenId} />;
}

function RevisionList({ onOpen }: { onOpen: (id: string) => void }) {
  const { formatCurrency, formatDate } = usePlatformFormat();
  const listQ = useHrQuery<{ revisions: Revision[] }>("manage_compensation_revision", { p_action: "list" }, ["list"]);
  const createMut = useHrMutation("manage_compensation_revision", LIST_KEYS);
  const [dlgOpen, setDlgOpen] = useState(false);
  const [form, setForm] = useState({ name: "", effective_date: "", budget_pct: "", default_pct: "", department: "" });

  const create = async () => {
    try {
      const res = (await createMut.mutateAsync({
        p_action: "create",
        p_name: form.name,
        p_effective_date: form.effective_date,
        p_budget_pct: form.budget_pct ? Number(form.budget_pct) : null,
        p_default_pct: form.default_pct ? Number(form.default_pct) : null,
        p_department: form.department || null,
      })) as { revision_id: string; lines: number };
      toast.success(`Round opened with ${res.lines} employees`);
      setDlgOpen(false);
      setForm({ name: "", effective_date: "", budget_pct: "", default_pct: "", department: "" });
      onOpen(res.revision_id);
    } catch {
      /* toast handled in useHrMutation */
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Salary revisions</CardTitle>
          <CardDescription>A budgeted round: proposals from the latest reviews, approved against the budget, applied on the effective date.</CardDescription>
        </div>
        <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-2" /> New round</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New salary revision</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Salary revision 2027" /></div>
              <div><Label>Effective date</Label><Input type="date" value={form.effective_date} onChange={(e) => setForm({ ...form, effective_date: e.target.value })} /></div>
              <div><Label>Department (optional)</Label><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="All" /></div>
              <div><Label>Budget (% of payroll)</Label><Input type="number" step="0.1" value={form.budget_pct} onChange={(e) => setForm({ ...form, budget_pct: e.target.value })} placeholder="No cap" /></div>
              <div><Label>Default raise (%)</Label><Input type="number" step="0.1" value={form.default_pct} onChange={(e) => setForm({ ...form, default_pct: e.target.value })} placeholder="0" /></div>
            </div>
            <p className="text-xs text-muted-foreground">Employees with a review recommendation get that percentage; everyone else gets the default. Adjust per person before approving.</p>
            <DialogFooter>
              <Button onClick={create} disabled={!form.name || !form.effective_date || createMut.isPending}>Open round</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {listQ.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !listQ.data?.revisions.length ? (
          <p className="text-sm text-muted-foreground text-center py-8">No salary revision yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Round</TableHead>
                <TableHead>Effective</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Employees</TableHead>
                <TableHead>Increase / month</TableHead>
                <TableHead>Budget</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listQ.data.revisions.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => onOpen(r.id)}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{formatDate(r.effective_date)}</TableCell>
                  <TableCell><Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge></TableCell>
                  <TableCell>{r.totals.included}{r.totals.excluded ? ` (+${r.totals.excluded} excluded)` : ""}</TableCell>
                  <TableCell>
                    {formatCurrency(r.totals.delta_cents, undefined, { maximumFractionDigits: 0 })}
                    {r.totals.delta_pct != null && <span className="text-muted-foreground"> · {r.totals.delta_pct} %</span>}
                  </TableCell>
                  <TableCell>
                    {r.totals.budget_limit_cents == null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : r.totals.within_budget ? (
                      <Badge variant="outline">within</Badge>
                    ) : (
                      <Badge variant="destructive">over by {formatCurrency(r.totals.over_by_cents, undefined, { maximumFractionDigits: 0 })}</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function RevisionDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { formatCurrency, formatDate } = usePlatformFormat();
  const q = useHrQuery<{ revision: Revision; totals: Totals; lines: Line[] }>("manage_compensation_revision", { p_action: "summary", p_revision_id: id }, ["summary", id]);
  const keys: string[][] = [...LIST_KEYS, ["manage_compensation_revision", "summary", id]];
  const lineMut = useHrMutation("manage_compensation_revision", keys);
  const roundMut = useHrMutation("manage_compensation_revision", keys);
  const [editing, setEditing] = useState<{ line: Line; pct: string; rationale: string } | null>(null);

  const rev = q.data?.revision;
  const totals = q.data?.totals;
  const editable = rev?.status === "draft";

  const propose = async () => {
    if (!editing) return;
    try {
      await lineMut.mutateAsync({ p_action: "propose", p_line_id: editing.line.id, p_pct: Number(editing.pct), p_rationale: editing.rationale || null });
      toast.success("Proposal updated");
      setEditing(null);
    } catch { /* handled */ }
  };
  const toggle = async (line: Line) => {
    try {
      await lineMut.mutateAsync({ p_action: line.status === "excluded" ? "include" : "exclude", p_line_id: line.id });
    } catch { /* handled */ }
  };
  const run = async (action: "approve" | "apply" | "cancel", force = false) => {
    try {
      const res = (await roundMut.mutateAsync({ p_action: action, p_revision_id: id, p_force: force })) as { applied?: number; contracts_updated?: number; status: string };
      if (action === "apply") toast.success(`Applied: ${res.applied} salaries changed, ${res.contracts_updated} contracts updated`);
      else toast.success(`Round ${res.status}`);
    } catch { /* handled */ }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
            <CardTitle>{rev?.name ?? "Salary revision"}</CardTitle>
            {rev && <Badge variant={STATUS_VARIANT[rev.status]}>{rev.status}</Badge>}
          </div>
          {rev && (
            <CardDescription>
              Effective {formatDate(rev.effective_date)} · default {rev.default_pct} %
              {rev.budget_pct != null && ` · budget ${rev.budget_pct} % of payroll`}
              {rev.budget_cents != null && ` · cap ${formatCurrency(rev.budget_cents, undefined, { maximumFractionDigits: 0 })}/month`}
            </CardDescription>
          )}
        </div>
        {rev && (
          <div className="flex gap-2">
            {rev.status === "draft" && (
              <Button size="sm" onClick={() => run("approve")} disabled={roundMut.isPending || !totals?.included}>
                <Check className="h-4 w-4 mr-2" /> Approve
              </Button>
            )}
            {rev.status === "draft" && totals && !totals.within_budget && (
              <Button size="sm" variant="outline" onClick={() => run("approve", true)} disabled={roundMut.isPending}>Approve over budget</Button>
            )}
            {rev.status === "approved" && (
              <Button size="sm" onClick={() => run("apply", new Date(rev.effective_date) > new Date())} disabled={roundMut.isPending}>
                <Play className="h-4 w-4 mr-2" /> {new Date(rev.effective_date) > new Date() ? "Apply early" : "Apply"}
              </Button>
            )}
            {(rev.status === "draft" || rev.status === "approved") && (
              <Button size="sm" variant="ghost" onClick={() => { if (confirm("Cancel this round?")) run("cancel"); }} disabled={roundMut.isPending}>
                <X className="h-4 w-4 mr-2" /> Cancel
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {q.isLoading || !totals ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <Stat label="Employees" value={`${totals.included}${totals.excluded ? ` · ${totals.excluded} excluded` : ""}`} />
              <Stat label="Payroll now → proposed" value={`${formatCurrency(totals.total_current_cents, undefined, { maximumFractionDigits: 0 })} → ${formatCurrency(totals.total_proposed_cents, undefined, { maximumFractionDigits: 0 })}`} />
              <Stat label="Increase" value={`${formatCurrency(totals.delta_cents, undefined, { maximumFractionDigits: 0 })}/month${totals.delta_pct != null ? ` · ${totals.delta_pct} %` : ""}`} sub={`${formatCurrency(totals.annual_delta_cents, undefined, { maximumFractionDigits: 0 })}/year`} />
              <Stat
                label="Budget"
                value={totals.budget_limit_cents == null ? "No cap" : totals.within_budget ? "Within budget" : `Over by ${formatCurrency(totals.over_by_cents, undefined, { maximumFractionDigits: 0 })}`}
                sub={totals.budget_limit_cents != null ? `${formatCurrency(totals.budget_limit_cents, undefined, { maximumFractionDigits: 0 })}/month` : totals.out_of_band_after ? `${totals.out_of_band_after} outside their band after` : undefined}
                tone={totals.budget_limit_cents != null && !totals.within_budget ? "destructive" : undefined}
              />
            </div>
            {rev?.notes && <p className="text-xs text-muted-foreground whitespace-pre-line">{rev.notes}</p>}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Current</TableHead>
                  <TableHead>Proposed</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead>Review</TableHead>
                  <TableHead>Compa after</TableHead>
                  <TableHead>Rationale</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data!.lines.map((l) => (
                  <TableRow key={l.id} className={l.status === "excluded" ? "opacity-50" : undefined}>
                    <TableCell>
                      <div className="font-medium">{l.name}</div>
                      <div className="text-xs text-muted-foreground">{[l.title, l.department].filter(Boolean).join(" · ")}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{l.grade_code ?? "—"}</TableCell>
                    <TableCell>{formatCurrency(l.current_cents, undefined, { maximumFractionDigits: 0 })}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(l.proposed_cents, undefined, { maximumFractionDigits: 0 })}</TableCell>
                    <TableCell>{l.change_pct != null ? `${l.change_pct > 0 ? "+" : ""}${l.change_pct} %` : "—"}</TableCell>
                    <TableCell className="text-xs">{l.recommended_pct != null ? `recommends ${l.recommended_pct} %` : <span className="text-muted-foreground">none</span>}</TableCell>
                    <TableCell>
                      {l.compa_after != null ? (
                        <span className={l.in_band === false ? "text-destructive" : undefined}>{l.compa_after.toFixed(2)}{l.in_band === false ? " · out of band" : ""}</span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-xs max-w-[14rem] truncate" title={l.rationale ?? undefined}>{l.rationale ?? ""}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {l.status === "applied" ? (
                        <Badge variant="outline">applied</Badge>
                      ) : editable ? (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setEditing({ line: l, pct: String(l.change_pct ?? 0), rationale: l.rationale ?? "" })} disabled={l.status === "excluded"}>Adjust</Button>
                          <Button size="sm" variant="ghost" onClick={() => toggle(l)}>{l.status === "excluded" ? "Include" : "Exclude"}</Button>
                        </>
                      ) : (
                        <Badge variant="secondary">{l.status}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adjust {editing?.line.name}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Current {formatCurrency(editing.line.current_cents, undefined, { maximumFractionDigits: 0 })}
                {editing.line.recommended_pct != null && ` · review recommends ${editing.line.recommended_pct} %`}
              </p>
              <div><Label>Raise (%)</Label><Input type="number" step="0.1" value={editing.pct} onChange={(e) => setEditing({ ...editing, pct: e.target.value })} /></div>
              <p className="text-sm">
                New salary: <span className="font-medium">{formatCurrency(Math.round(editing.line.current_cents * (1 + (Number(editing.pct) || 0) / 100)), undefined, { maximumFractionDigits: 0 })}</span>
              </p>
              <div><Label>Rationale</Label><Textarea rows={2} value={editing.rationale} onChange={(e) => setEditing({ ...editing, rationale: e.target.value })} placeholder="Required for a cut; written to the salary history" /></div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={propose} disabled={lineMut.isPending || editing?.pct === ""}>Save proposal</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "destructive" }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-medium ${tone === "destructive" ? "text-destructive" : ""}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
