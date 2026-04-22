import { useEmployeeSelf } from "@/hooks/useEmployeeSelf";
import { useGoals, useOneOnOnes, useReviews, useAcknowledgeReview, useUpsertGoal } from "@/hooks/usePerformance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Star, Target, Calendar, Plus } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";

export default function PerformancePage() {
  const { employee, isEmployee } = useEmployeeSelf();

  if (!isEmployee || !employee) {
    return <div className="text-sm text-muted-foreground">Performance is available for employees only.</div>;
  }

  const empId = employee.id;
  const { data: goals = [] } = useGoals(empId);
  const { data: meetings = [] } = useOneOnOnes(empId);
  const { data: reviews = [] } = useReviews(empId);
  const ack = useAcknowledgeReview();
  const upsertGoal = useUpsertGoal();

  const [goalOpen, setGoalOpen] = useState(false);
  const [goal, setGoal] = useState({ title: "", description: "", category: "professional", target_date: "" });

  const [updateOpen, setUpdateOpen] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Performance</h2>
        <p className="text-sm text-muted-foreground">Your goals, 1:1s and reviews</p>
      </div>

      <Tabs defaultValue="goals">
        <TabsList>
          <TabsTrigger value="goals"><Target className="h-4 w-4 mr-1" />Goals ({goals.length})</TabsTrigger>
          <TabsTrigger value="oneonones"><Calendar className="h-4 w-4 mr-1" />1:1s ({meetings.length})</TabsTrigger>
          <TabsTrigger value="reviews"><Star className="h-4 w-4 mr-1" />Reviews ({reviews.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="goals">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>My Goals</CardTitle>
              <Dialog open={goalOpen} onOpenChange={setGoalOpen}>
                <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Add</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>New Goal</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div><Label>Title</Label><Input value={goal.title} onChange={(e) => setGoal({ ...goal, title: e.target.value })} /></div>
                    <div><Label>Description</Label><Textarea value={goal.description} onChange={(e) => setGoal({ ...goal, description: e.target.value })} /></div>
                    <div><Label>Target date</Label><Input type="date" value={goal.target_date} onChange={(e) => setGoal({ ...goal, target_date: e.target.value })} /></div>
                  </div>
                  <DialogFooter>
                    <Button onClick={async () => {
                      await upsertGoal.mutateAsync({ ...goal, employee_id: empId, target_date: goal.target_date || null } as any);
                      setGoalOpen(false);
                      setGoal({ title: "", description: "", category: "professional", target_date: "" });
                    }} disabled={!goal.title}>Save</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="space-y-3">
              {goals.length === 0 ? <p className="text-sm text-muted-foreground">No goals yet — add one to start tracking your development.</p> :
                goals.map((g) => (
                  <div key={g.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium">{g.title}</div>
                        {g.description && <p className="text-sm text-muted-foreground">{g.description}</p>}
                      </div>
                      <Badge variant="outline">{g.category}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={g.progress_pct} className="flex-1" />
                      <span className="text-xs tabular-nums w-10 text-right">{g.progress_pct}%</span>
                      <Dialog open={updateOpen === g.id} onOpenChange={(o) => { setUpdateOpen(o ? g.id : null); setProgress(g.progress_pct); }}>
                        <DialogTrigger asChild><Button size="sm" variant="outline">Update</Button></DialogTrigger>
                        <DialogContent>
                          <DialogHeader><DialogTitle>Update progress</DialogTitle></DialogHeader>
                          <div className="space-y-3 py-2">
                            <Slider value={[progress]} onValueChange={(v) => setProgress(v[0])} max={100} step={5} />
                            <p className="text-center text-2xl font-bold">{progress}%</p>
                          </div>
                          <DialogFooter>
                            <Button onClick={async () => {
                              await upsertGoal.mutateAsync({ id: g.id, employee_id: empId, title: g.title, progress_pct: progress, status: progress >= 100 ? "completed" : "active" } as any);
                              setUpdateOpen(null);
                            }}>Save</Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                    {g.target_date && <p className="text-xs text-muted-foreground">Due {format(new Date(g.target_date), "MMM d, yyyy")}</p>}
                  </div>
                ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="oneonones">
          <Card>
            <CardHeader><CardTitle>Upcoming & past 1:1s</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {meetings.length === 0 ? <p className="text-sm text-muted-foreground">No 1:1s scheduled.</p> :
                meetings.map((m) => (
                  <div key={m.id} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{format(new Date(m.scheduled_at), "EEE MMM d, HH:mm")}</div>
                      <Badge variant={m.status === "completed" ? "default" : "secondary"}>{m.status}</Badge>
                    </div>
                    {m.agenda && <p className="text-sm text-muted-foreground mt-1"><strong>Agenda:</strong> {m.agenda}</p>}
                    {m.notes && <p className="text-sm mt-2 border-t pt-2">{m.notes}</p>}
                  </div>
                ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reviews">
          <Card>
            <CardHeader><CardTitle>Reviews</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {reviews.length === 0 ? <p className="text-sm text-muted-foreground">No reviews yet.</p> :
                reviews.map((r) => (
                  <div key={r.id} className="border rounded-lg p-4 space-y-2">
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
                    {r.achievements && <p className="text-sm"><strong>Achievements:</strong> {r.achievements}</p>}
                    {r.areas_of_improvement && <p className="text-sm"><strong>Improvements:</strong> {r.areas_of_improvement}</p>}
                    {r.goals_next_period && <p className="text-sm"><strong>Next period:</strong> {r.goals_next_period}</p>}
                    {r.manager_comments && <p className="text-sm text-muted-foreground italic">"{r.manager_comments}"</p>}
                    {r.status !== "acknowledged" && r.status !== "draft" && (
                      <Button size="sm" onClick={() => ack.mutate({ id: r.id })}>Acknowledge</Button>
                    )}
                  </div>
                ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
