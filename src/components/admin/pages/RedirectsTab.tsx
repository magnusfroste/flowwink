import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { usePagesRpcQuery, usePagesRpcMutation } from "@/hooks/usePagesRpc";

type Redirect = {
  id: string;
  from_path: string;
  to_path: string;
  status_code: number;
  is_active: boolean;
  note: string | null;
  hit_count: number;
  last_hit_at: string | null;
  created_at: string;
};

export default function RedirectsTab() {
  const listQ = usePagesRpcQuery<{ redirects: Redirect[] }>("manage_redirect", { p_action: "list" }, ["list"]);
  const invalidate = [["manage_redirect", "list"]];
  const createMut = usePagesRpcMutation("manage_redirect", invalidate);
  const updateMut = usePagesRpcMutation("manage_redirect", invalidate);
  const deleteMut = usePagesRpcMutation("manage_redirect", invalidate);

  const [dlgOpen, setDlgOpen] = useState(false);
  const [editing, setEditing] = useState<Redirect | null>(null);
  const [form, setForm] = useState({ from_path: "", to_path: "", status_code: "301", note: "" });

  const openNew = () => {
    setEditing(null);
    setForm({ from_path: "", to_path: "", status_code: "301", note: "" });
    setDlgOpen(true);
  };
  const openEdit = (r: Redirect) => {
    setEditing(r);
    setForm({ from_path: r.from_path, to_path: r.to_path, status_code: String(r.status_code), note: r.note ?? "" });
    setDlgOpen(true);
  };

  const submit = async () => {
    try {
      if (editing) {
        await updateMut.mutateAsync({
          p_action: "update",
          p_redirect_id: editing.id,
          p_from_path: form.from_path,
          p_to_path: form.to_path,
          p_status_code: Number(form.status_code),
          p_note: form.note || null,
        });
        toast.success("Redirect updated");
      } else {
        await createMut.mutateAsync({
          p_action: "create",
          p_from_path: form.from_path,
          p_to_path: form.to_path,
          p_status_code: Number(form.status_code),
          p_note: form.note || null,
        });
        toast.success("Redirect created");
      }
      setDlgOpen(false);
    } catch {
      /* handled */
    }
  };

  const toggleActive = async (r: Redirect) => {
    try {
      await updateMut.mutateAsync({ p_action: "update", p_redirect_id: r.id, p_is_active: !r.is_active });
    } catch {
      /* handled */
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>URL Redirects</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            301/302 redirects for renamed or removed URLs. Requests to <code className="font-mono">from</code> are sent to <code className="font-mono">to</code>.
          </p>
        </div>
        <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openNew}>
              <Plus className="h-4 w-4 mr-2" /> New redirect
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit redirect" : "New redirect"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>From path</Label>
                <Input placeholder="/old-url" value={form.from_path} onChange={(e) => setForm({ ...form, from_path: e.target.value })} />
              </div>
              <div>
                <Label>To path</Label>
                <Input placeholder="/new-url" value={form.to_path} onChange={(e) => setForm({ ...form, to_path: e.target.value })} />
              </div>
              <div>
                <Label>Status code</Label>
                <Select value={form.status_code} onValueChange={(v) => setForm({ ...form, status_code: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="301">301 — Permanent</SelectItem>
                    <SelectItem value="302">302 — Temporary</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Note (optional)</Label>
                <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={submit} disabled={!form.from_path || !form.to_path || createMut.isPending || updateMut.isPending}>
                {editing ? "Save" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {listQ.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !listQ.data?.redirects.length ? (
          <p className="text-sm text-muted-foreground text-center py-8">No redirects configured.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Hits</TableHead>
                <TableHead>Last hit</TableHead>
                <TableHead>Active</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listQ.data.redirects.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.from_path}</TableCell>
                  <TableCell className="font-mono text-xs">{r.to_path}</TableCell>
                  <TableCell><Badge variant="outline">{r.status_code}</Badge></TableCell>
                  <TableCell className="tabular-nums">{r.hit_count}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.last_hit_at ? formatDistanceToNow(new Date(r.last_hit_at), { addSuffix: true }) : "—"}
                  </TableCell>
                  <TableCell>
                    <Switch checked={r.is_active} onCheckedChange={() => toggleActive(r)} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={async () => {
                        if (!confirm(`Delete redirect ${r.from_path}?`)) return;
                        try {
                          await deleteMut.mutateAsync({ p_action: "delete", p_redirect_id: r.id });
                          toast.success("Deleted");
                        } catch {
                          /* handled */
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
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
