import { useState } from "react";
import { useGoals, useOneOnOnes, useReviews, useUpsertGoal, useUpsertOneOnOne, useUpsertReview } from "@/hooks/usePerformance";
import { useEmployees } from "@/hooks/useEmployees";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Plus, Target, Calendar, MessageSquare, Star } from "lucide-react";
import { format } from "date-fns";

export function PerformancePanel() {
  const { data: employees = [] } = useEmployees();
  const [selectedEmp, setSelectedEmp] = useState<string>("");
  const empId = selectedEmp || employees[0]?.id || "";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Label>Employee</Label>
        <Select value={empId} onValueChange={setSelectedEmp}>
          <SelectTrigger className="w-72"><SelectValue placeholder="Select employee" /></SelectTrigger>
          <SelectContent>
            {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {empId && (
        <Tabs defaultValue="goals">
          <TabsList>
            <TabsTrigger value="goals"><Target className="h-4 w-4 mr-1" />Goals</TabsTrigger>
            <TabsTrigger value="oneonones"><Calendar className="h-4 w-4 mr-1" />1:1s</TabsTrigger>
            <TabsTrigger value="reviews"><Star className="h-4 w-4 mr-1" />Reviews</TabsTrigger>
          </TabsList>
          <TabsContent value="goals"><GoalsTab employeeId={empId} /></TabsContent>
          <TabsContent value="oneonones"><OneOnOnesTab employeeId={empId} employees={employees} /></TabsContent>
          <TabsContent value="reviews"><ReviewsTab employeeId={empId} employees={employees} /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function GoalsTab({ employeeId }: { employeeId: string }) {
  const { data: goals = [], isLoading } = useGoals(employeeId);
  const upsert = useUpsertGoal();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", category: "professional", target_date: "", weight: 3, progress_pct: 0, status: "active" });

  const submit = async () => {
    await upsert.mutateAsync({ ...form, employee_id: employeeId, target_date: form.target_date || null } as any);
    setOpen(false);
    setForm({ title: "", description: "", category: "professional", target_date: "", weight: 3, progress_pct: 0, status: "active" });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Goals & PDP</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />New Goal</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Goal</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Category</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="personal">Personal</SelectItem>
                      <SelectItem value="skill">Skill</SelectItem>
                      <SelectItem value="business">Business</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Target Date</Label><Input type="date" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} /></div>
                <div><Label>Weight (1-5)</Label><Input type="number" min={1} max={5} value={form.weight} onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })} /></div>
                <div><Label>Progress %</Label><Input type="number" min={0} max={100} value={form.progress_pct} onChange={(e) => setForm({ ...form, progress_pct: Number(e.target.value) })} /></div>
              </div>
            </div>
            <DialogFooter><Button onClick={submit} disabled={!form.title}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> :
          goals.length === 0 ? <p className="text-sm text-muted-foreground">No goals yet.</p> :
            goals.map((g) => (
              <div key={g.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{g.title}</div>
                    {g.description && <p className="text-sm text-muted-foreground mt-0.5">{g.description}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Badge variant="outline">{g.category}</Badge>
                    <Badge variant={g.status === "completed" ? "default" : "secondary"}>{g.status}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Progress value={g.progress_pct} className="flex-1" />
                  <span className="text-xs font-medium tabular-nums w-10 text-right">{g.progress_pct}%</span>
                </div>
                {g.target_date && <p className="text-xs text-muted-foreground">Due {format(new Date(g.target_date), "MMM d, yyyy")}</p>}
              </div>
            ))}
      </CardContent>
    </Card>
  );
}

function OneOnOnesTab({ employeeId, employees }: { employeeId: string; employees: any[] }) {
  const { data: meetings = [], isLoading } = useOneOnOnes(employeeId);
  const upsert = useUpsertOneOnOne();
  const [open, setOpen] = useState(false);
  const emp = employees.find((e) => e.id === employeeId);
  const managerId = emp?.manager_id || "";
  const [form, setForm] = useState({ scheduled_at: "", duration_minutes: 30, agenda: "", manager_id: managerId });

  const submit = async () => {
    await upsert.mutateAsync({
      employee_id: employeeId,
      manager_id: form.manager_id,
      scheduled_at: form.scheduled_at,
      duration_minutes: form.duration_minutes,
      agenda: form.agenda,
    } as any);
    setOpen(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>1:1 Meetings</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Schedule 1:1</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Schedule 1:1</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Manager</Label>
                <Select value={form.manager_id} onValueChange={(v) => setForm({ ...form, manager_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select manager" /></SelectTrigger>
                  <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>When</Label><Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} /></div>
              <div><Label>Duration (min)</Label><Input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} /></div>
              <div><Label>Agenda</Label><Textarea value={form.agenda} onChange={(e) => setForm({ ...form, agenda: e.target.value })} placeholder="What to discuss…" /></div>
            </div>
            <DialogFooter><Button onClick={submit} disabled={!form.scheduled_at || !form.manager_id}>Schedule</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> :
          meetings.length === 0 ? <p className="text-sm text-muted-foreground">No 1:1s scheduled.</p> :
            meetings.map((m) => (
              <div key={m.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{format(new Date(m.scheduled_at), "EEE MMM d, HH:mm")}</div>
                  <Badge variant={m.status === "completed" ? "default" : "secondary"}>{m.status}</Badge>
                </div>
                {m.agenda && <p className="text-sm text-muted-foreground mt-1">{m.agenda}</p>}
                {m.notes && <p className="text-sm mt-2 border-t pt-2">{m.notes}</p>}
              </div>
            ))}
      </CardContent>
    </Card>
  );
}

function ReviewsTab({ employeeId, employees }: { employeeId: string; employees: any[] }) {
  const { data: reviews = [], isLoading } = useReviews(employeeId);
  const upsert = useUpsertReview();
  const [open, setOpen] = useState(false);
  const year = new Date().getFullYear();
  const [form, setForm] = useState({
    period_type: "annual",
    period_start: `${year}-01-01`,
    period_end: `${year}-12-31`,
    overall_rating: 3,
    achievements: "",
    areas_of_improvement: "",
    goals_next_period: "",
    manager_comments: "",
    salary_adjustment_pct: 0,
    promotion_recommended: false,
    status: "draft",
  });

  const submit = async () => {
    await upsert.mutateAsync({ ...form, employee_id: employeeId } as any);
    setOpen(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Performance Reviews</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />New Review</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>New Performance Review</DialogTitle></DialogHeader>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Type</Label>
                  <Select value={form.period_type} onValueChange={(v) => setForm({ ...form, period_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="annual">Annual</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="probation">Probation</SelectItem>
                      <SelectItem value="ad_hoc">Ad-hoc</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Period start</Label><Input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} /></div>
                <div><Label>Period end</Label><Input type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} /></div>
              </div>
              <div><Label>Overall rating (1-5)</Label><Input type="number" min={1} max={5} value={form.overall_rating} onChange={(e) => setForm({ ...form, overall_rating: Number(e.target.value) })} /></div>
              <div><Label>Achievements</Label><Textarea value={form.achievements} onChange={(e) => setForm({ ...form, achievements: e.target.value })} /></div>
              <div><Label>Areas of improvement</Label><Textarea value={form.areas_of_improvement} onChange={(e) => setForm({ ...form, areas_of_improvement: e.target.value })} /></div>
              <div><Label>Goals next period</Label><Textarea value={form.goals_next_period} onChange={(e) => setForm({ ...form, goals_next_period: e.target.value })} /></div>
              <div><Label>Manager comments</Label><Textarea value={form.manager_comments} onChange={(e) => setForm({ ...form, manager_comments: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Salary adjustment %</Label><Input type="number" step="0.1" value={form.salary_adjustment_pct} onChange={(e) => setForm({ ...form, salary_adjustment_pct: Number(e.target.value) })} /></div>
                <div><Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="employee_review">Send to employee</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter><Button onClick={submit}>Save Review</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> :
          reviews.length === 0 ? <p className="text-sm text-muted-foreground">No reviews yet.</p> :
            reviews.map((r) => (
              <div key={r.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium capitalize">{r.period_type} review</div>
                    <p className="text-xs text-muted-foreground">{format(new Date(r.period_start), "MMM d")} – {format(new Date(r.period_end), "MMM d, yyyy")}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.overall_rating && <div className="flex items-center gap-0.5">{Array.from({ length: 5 }).map((_, i) => <Star key={i} className={`h-4 w-4 ${i < r.overall_rating! ? "fill-primary text-primary" : "text-muted-foreground"}`} />)}</div>}
                    <Badge variant={r.status === "acknowledged" ? "default" : "secondary"}>{r.status}</Badge>
                  </div>
                </div>
                {r.achievements && <p className="text-sm mt-2"><strong>Achievements:</strong> {r.achievements}</p>}
                {r.manager_comments && <p className="text-sm mt-1 text-muted-foreground">{r.manager_comments}</p>}
              </div>
            ))}
      </CardContent>
    </Card>
  );
}
