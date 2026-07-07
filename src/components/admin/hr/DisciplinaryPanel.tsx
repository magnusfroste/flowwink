import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useEmployees } from "@/hooks/useEmployees";
import { useHrQuery, useHrMutation } from "@/hooks/useHrOps";

type Record_ = {
  id: string;
  employee: string;
  employee_id: string;
  action_type: string;
  severity: number;
  reason: string;
  status: "open" | "acknowledged" | "resolved" | "withdrawn";
  issued_at: string;
  follow_up_date: string | null;
};

const ACTION_TYPES = [
  "verbal_warning",
  "written_warning",
  "final_warning",
  "suspension",
  "termination_notice",
  "note",
] as const;

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  open: "destructive",
  acknowledged: "secondary",
  resolved: "default",
  withdrawn: "outline",
};

export function DisciplinaryPanel() {
  const { data: employees } = useEmployees();
  const listQ = useHrQuery<{ records: Record_[] }>("manage_disciplinary", { p_action: "list" }, ["list"]);
  const invalidate: string[][] = [["manage_disciplinary", "list"]];
  const createMut = useHrMutation("manage_disciplinary", invalidate);
  const ackMut = useHrMutation("manage_disciplinary", invalidate);
  const resolveMut = useHrMutation("manage_disciplinary", invalidate);
  const withdrawMut = useHrMutation("manage_disciplinary", invalidate);

  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({
    employee_id: "",
    action_type: "verbal_warning",
    severity: 1,
    reason: "",
    description: "",
    follow_up_date: "",
  });
  const submit = async () => {
    try {
      await createMut.mutateAsync({
        p_action: "create",
        p_employee_id: form.employee_id,
        p_action_type: form.action_type,
        p_severity: form.severity,
        p_reason: form.reason,
        p_description: form.description || null,
        p_follow_up_date: form.follow_up_date || null,
      });
      toast.success("Record created");
      setNewOpen(false);
      setForm({ employee_id: "", action_type: "verbal_warning", severity: 1, reason: "", description: "", follow_up_date: "" });
    } catch { /* handled */ }
  };

  const [resolveDlg, setResolveDlg] = useState<Record_ | null>(null);
  const [resolution, setResolution] = useState("");
  const doResolve = async () => {
    if (!resolveDlg) return;
    try {
      await resolveMut.mutateAsync({ p_action: "resolve", p_record_id: resolveDlg.id, p_resolution: resolution });
      toast.success("Resolved");
      setResolveDlg(null);
      setResolution("");
    } catch { /* handled */ }
  };

  return (
    <div className="space-y-4">
      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertDescription>Sensitive — admin only. All actions are audit-logged.</AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Disciplinary records</CardTitle>
          <Dialog open={newOpen} onOpenChange={setNewOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-2" /> New record</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New disciplinary record</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Employee</Label>
                  <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                    <SelectContent>
                      {employees?.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Action type</Label>
                  <Select value={form.action_type} onValueChange={(v) => setForm({ ...form, action_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ACTION_TYPES.map((a) => <SelectItem key={a} value={a}>{a.replace(/_/g, " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Severity (1–3)</Label>
                  <Select value={String(form.severity)} onValueChange={(v) => setForm({ ...form, severity: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 — Low</SelectItem>
                      <SelectItem value="2">2 — Medium</SelectItem>
                      <SelectItem value="3">3 — High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2"><Label>Reason</Label><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
                <div className="col-span-2"><Label>Description (optional)</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                <div className="col-span-2"><Label>Follow-up date (optional)</Label><Input type="date" value={form.follow_up_date} onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })} /></div>
              </div>
              <DialogFooter>
                <Button onClick={submit} disabled={!form.employee_id || !form.reason || createMut.isPending}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {listQ.isLoading ? <Skeleton className="h-24 w-full" /> : !listQ.data?.records.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">No disciplinary records.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Follow-up</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listQ.data.records.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.employee}</TableCell>
                    <TableCell>{r.action_type.replace(/_/g, " ")}</TableCell>
                    <TableCell>{r.severity}</TableCell>
                    <TableCell className="max-w-xs truncate">{r.reason}</TableCell>
                    <TableCell className="text-xs">{format(new Date(r.issued_at), "MMM d, yyyy")}</TableCell>
                    <TableCell className="text-xs">{r.follow_up_date ? format(new Date(r.follow_up_date), "MMM d") : "—"}</TableCell>
                    <TableCell><Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge></TableCell>
                    <TableCell className="text-right space-x-1">
                      {r.status === "open" && (
                        <Button size="sm" variant="ghost" onClick={async () => {
                          try { await ackMut.mutateAsync({ p_action: "acknowledge", p_record_id: r.id }); toast.success("Acknowledged"); } catch { /* handled */ }
                        }}>Ack</Button>
                      )}
                      {(r.status === "open" || r.status === "acknowledged") && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setResolveDlg(r)}>Resolve</Button>
                          <Button size="sm" variant="ghost" onClick={async () => {
                            try { await withdrawMut.mutateAsync({ p_action: "withdraw", p_record_id: r.id }); toast.success("Withdrawn"); } catch { /* handled */ }
                          }}>Withdraw</Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!resolveDlg} onOpenChange={(v) => { if (!v) { setResolveDlg(null); setResolution(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Resolve record</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{resolveDlg?.employee} · {resolveDlg?.action_type.replace(/_/g, " ")}</p>
            <Label>Resolution</Label>
            <Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={4} />
          </div>
          <DialogFooter>
            <Button onClick={doResolve} disabled={!resolution || resolveMut.isPending}>Resolve</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
