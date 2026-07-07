import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus, Play, Square, ChevronDown, ChevronRight, Trophy } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { usePagesRpcQuery, usePagesRpcMutation, pagesRpc } from "@/hooks/usePagesRpc";

type Experiment = {
  id: string;
  name: string;
  status: "draft" | "running" | "stopped" | "concluded";
  traffic_split: number;
  goal: string | null;
  winner: "a" | "b" | null;
  page_slug: string;
  variant_slug: string;
  started_at: string | null;
  stopped_at: string | null;
};

type Results = {
  a: { impressions: number; conversions: number; rate: number };
  b: { impressions: number; conversions: number; rate: number };
  lift_pct: number | null;
};

const STATUS_VARIANT: Record<Experiment["status"], "default" | "secondary" | "outline"> = {
  draft: "secondary",
  running: "default",
  stopped: "outline",
  concluded: "outline",
};

function usePagesForSelect() {
  return useQuery({
    queryKey: ["pages-select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pages")
        .select("slug, title, status")
        .order("title");
      if (error) throw error;
      return data as { slug: string; title: string; status: string }[];
    },
  });
}

function ResultsRow({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["manage_page_experiment", "results", id],
    queryFn: () => pagesRpc<Results>("manage_page_experiment", { p_action: "results", p_experiment_id: id }),
  });
  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (!data) return <p className="text-sm text-muted-foreground">No data.</p>;
  return (
    <div className="grid grid-cols-3 gap-4 text-sm">
      {(["a", "b"] as const).map((k) => (
        <div key={k} className="border border-border rounded p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Variant {k.toUpperCase()}</p>
          <p className="mt-1">{data[k].impressions} impressions</p>
          <p>{data[k].conversions} conversions</p>
          <p className="font-medium">{(data[k].rate * 100).toFixed(2)}% rate</p>
        </div>
      ))}
      <div className="border border-border rounded p-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Lift</p>
        <p className="mt-1 text-lg font-semibold">{data.lift_pct != null ? `${data.lift_pct.toFixed(1)}%` : "—"}</p>
      </div>
    </div>
  );
}

export default function PageExperimentsTab() {
  const listQ = usePagesRpcQuery<{ experiments: Experiment[] }>("manage_page_experiment", { p_action: "list" }, ["list"]);
  const pagesQ = usePagesForSelect();
  const invalidate = [["manage_page_experiment", "list"]];
  const createMut = usePagesRpcMutation("manage_page_experiment", invalidate);
  const startMut = usePagesRpcMutation("manage_page_experiment", invalidate);
  const stopMut = usePagesRpcMutation("manage_page_experiment", invalidate);
  const concludeMut = usePagesRpcMutation("manage_page_experiment", invalidate);

  const [dlgOpen, setDlgOpen] = useState(false);
  const [form, setForm] = useState({ name: "", page_slug: "", variant_slug: "", traffic_split: "0.5", goal: "" });
  const submit = async () => {
    try {
      await createMut.mutateAsync({
        p_action: "create",
        p_name: form.name,
        p_page_slug: form.page_slug,
        p_variant_slug: form.variant_slug,
        p_traffic_split: Number(form.traffic_split),
        p_goal: form.goal,
      });
      toast.success("Experiment created");
      setDlgOpen(false);
      setForm({ name: "", page_slug: "", variant_slug: "", traffic_split: "0.5", goal: "" });
    } catch {
      /* handled */
    }
  };

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  const [concludeDlg, setConcludeDlg] = useState<Experiment | null>(null);
  const [winner, setWinner] = useState<"a" | "b">("a");
  const doConclude = async () => {
    if (!concludeDlg) return;
    try {
      await concludeMut.mutateAsync({ p_action: "conclude", p_experiment_id: concludeDlg.id, p_winner: winner });
      toast.success("Experiment concluded");
      setConcludeDlg(null);
    } catch {
      /* handled */
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Page Experiments (A/B)</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Split traffic between a control page and a variant to test which converts better.
          </p>
        </div>
        <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-2" /> New experiment</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New experiment</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div>
                <Label>Control page</Label>
                <Select value={form.page_slug} onValueChange={(v) => setForm({ ...form, page_slug: v })}>
                  <SelectTrigger><SelectValue placeholder="Select control page" /></SelectTrigger>
                  <SelectContent>
                    {pagesQ.data?.map((p) => <SelectItem key={p.slug} value={p.slug}>{p.title} (/{p.slug})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Variant page</Label>
                <Select value={form.variant_slug} onValueChange={(v) => setForm({ ...form, variant_slug: v })}>
                  <SelectTrigger><SelectValue placeholder="Select variant page" /></SelectTrigger>
                  <SelectContent>
                    {pagesQ.data?.filter((p) => p.slug !== form.page_slug).map((p) => (
                      <SelectItem key={p.slug} value={p.slug}>{p.title} (/{p.slug}) · {p.status}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Traffic to variant ({(Number(form.traffic_split) * 100).toFixed(0)}%)</Label>
                <Input type="number" min="0.1" max="0.9" step="0.05" value={form.traffic_split} onChange={(e) => setForm({ ...form, traffic_split: e.target.value })} />
              </div>
              <div><Label>Goal</Label><Input placeholder="e.g. Signup click on hero CTA" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button
                onClick={submit}
                disabled={!form.name || !form.page_slug || !form.variant_slug || !form.goal || createMut.isPending}
              >
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {listQ.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !listQ.data?.experiments.length ? (
          <p className="text-sm text-muted-foreground text-center py-8">No experiments yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Control → Variant</TableHead>
                <TableHead>Split</TableHead>
                <TableHead>Goal</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listQ.data.experiments.map((e) => {
                const isOpen = expanded.has(e.id);
                return (
                  <>
                    <TableRow key={e.id}>
                      <TableCell>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => toggle(e.id)}>
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">{e.name}</TableCell>
                      <TableCell className="text-xs font-mono">/{e.page_slug} → /{e.variant_slug}</TableCell>
                      <TableCell>{(e.traffic_split * 100).toFixed(0)}%</TableCell>
                      <TableCell className="max-w-xs truncate text-sm">{e.goal || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[e.status]}>{e.status}</Badge>
                        {e.status === "concluded" && e.winner && (
                          <Badge variant="outline" className="ml-1">
                            <Trophy className="h-3 w-3 mr-1" /> {e.winner.toUpperCase()}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        {e.status === "draft" && (
                          <Button size="sm" variant="ghost" onClick={async () => {
                            try { await startMut.mutateAsync({ p_action: "start", p_experiment_id: e.id }); toast.success("Started"); } catch { /* handled */ }
                          }}>
                            <Play className="h-3.5 w-3.5 mr-1" /> Start
                          </Button>
                        )}
                        {e.status === "running" && (
                          <>
                            <Button size="sm" variant="ghost" onClick={async () => {
                              try { await stopMut.mutateAsync({ p_action: "stop", p_experiment_id: e.id }); toast.success("Stopped"); } catch { /* handled */ }
                            }}>
                              <Square className="h-3.5 w-3.5 mr-1" /> Stop
                            </Button>
                          </>
                        )}
                        {(e.status === "running" || e.status === "stopped") && (
                          <Button size="sm" variant="ghost" onClick={() => { setConcludeDlg(e); setWinner("a"); }}>
                            <Trophy className="h-3.5 w-3.5 mr-1" /> Conclude
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow key={`${e.id}-results`}>
                        <TableCell></TableCell>
                        <TableCell colSpan={6}>
                          <div className="py-2">
                            {e.started_at && (
                              <p className="text-xs text-muted-foreground mb-2">
                                Started {format(new Date(e.started_at), "MMM d, yyyy HH:mm")}
                                {e.stopped_at && ` · stopped ${format(new Date(e.stopped_at), "MMM d, yyyy HH:mm")}`}
                              </p>
                            )}
                            <ResultsRow id={e.id} />
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={!!concludeDlg} onOpenChange={(v) => { if (!v) setConcludeDlg(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Conclude experiment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{concludeDlg?.name}</p>
            <div>
              <Label>Winner</Label>
              <Select value={winner} onValueChange={(v) => setWinner(v as "a" | "b")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="a">A — Control (/{concludeDlg?.page_slug})</SelectItem>
                  <SelectItem value="b">B — Variant (/{concludeDlg?.variant_slug})</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={doConclude} disabled={concludeMut.isPending}>Conclude</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
