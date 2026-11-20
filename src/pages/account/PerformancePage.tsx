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
import { useCustomerFormat } from "@/hooks/useCustomerFormat";
import { useState } from "react";
import { useUiText } from "@/lib/ui-text";
import { goalCategoryWord, meetingStatusWord, reviewPeriodWord, reviewStatusWord } from "@/lib/staff-words";

export default function PerformancePage() {
  // EVERY hook runs on every render, before any early return.
  //
  // `useEmployeeSelf` is a query: on first render `employee` is undefined, so
  // `isEmployee` is false. Returning here — as this component used to — meant
  // two hooks on render 1 and eleven on render 2, once the query resolved.
  // React counts hooks per render and throws "Rendered more hooks than during
  // the previous render", so the page crashed for exactly the people it is for,
  // and never for anyone else. That is why it could sit here unnoticed.
  //
  // The admin twin (`admin/hr/PerformancePanel.tsx`) expresses the same intent
  // legally, by gating at the component boundary — `{empId && <GoalsTab …/>}`
  // mounts and unmounts a child rather than skipping hooks inside one.
  const { formatDate, formatDateTime } = useCustomerFormat();
  const t = useUiText();
  const { employee, isEmployee, loading } = useEmployeeSelf();

  // Undefined until the query resolves. The read hooks below are `enabled` on
  // this id, so they stay idle rather than firing without an employee filter.
  const empId = employee?.id;

  const { data: goals = [] } = useGoals(empId);
  const { data: meetings = [] } = useOneOnOnes(empId);
  const { data: reviews = [] } = useReviews(empId);
  const ack = useAcknowledgeReview();
  const upsertGoal = useUpsertGoal();

  const [goalOpen, setGoalOpen] = useState(false);
  const [goal, setGoal] = useState({ title: "", description: "", category: "professional", target_date: "" });

  const [updateOpen, setUpdateOpen] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Below the hooks, so the render path may branch freely from here.
  if (loading) {
    return <div className="text-sm text-muted-foreground">{t('staff.common.loading', 'Loading…')}</div>;
  }

  if (!isEmployee || !employee) {
    return <div className="text-sm text-muted-foreground">{t('staff.performance.employeesOnly', 'Performance is available for employees only.')}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">{t('staff.performance.title', 'Performance')}</h2>
        <p className="text-sm text-muted-foreground">{t('staff.performance.subtitle', 'Your goals, 1:1s and reviews')}</p>
      </div>

      <Tabs defaultValue="goals">
        <TabsList>
          <TabsTrigger value="goals"><Target className="h-4 w-4 mr-1" />{t('staff.performance.tabGoals', 'Goals ({count})').replace('{count}', String(goals.length))}</TabsTrigger>
          <TabsTrigger value="oneonones"><Calendar className="h-4 w-4 mr-1" />{t('staff.performance.tabMeetings', '1:1s ({count})').replace('{count}', String(meetings.length))}</TabsTrigger>
          <TabsTrigger value="reviews"><Star className="h-4 w-4 mr-1" />{t('staff.performance.tabReviews', 'Reviews ({count})').replace('{count}', String(reviews.length))}</TabsTrigger>
        </TabsList>

        <TabsContent value="goals">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t('staff.performance.myGoals', 'My Goals')}</CardTitle>
              <Dialog open={goalOpen} onOpenChange={setGoalOpen}>
                <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />{t('staff.common.add', 'Add')}</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{t('staff.performance.newGoal', 'New Goal')}</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div><Label>{t('staff.performance.goalTitle', 'Title')}</Label><Input value={goal.title} onChange={(e) => setGoal({ ...goal, title: e.target.value })} /></div>
                    <div><Label>{t('staff.common.description', 'Description')}</Label><Textarea value={goal.description} onChange={(e) => setGoal({ ...goal, description: e.target.value })} /></div>
                    <div><Label>{t('staff.performance.targetDate', 'Target date')}</Label><Input type="date" value={goal.target_date} onChange={(e) => setGoal({ ...goal, target_date: e.target.value })} /></div>
                  </div>
                  <DialogFooter>
                    <Button onClick={async () => {
                      await upsertGoal.mutateAsync({ ...goal, employee_id: empId, target_date: goal.target_date || null } as any);
                      setGoalOpen(false);
                      setGoal({ title: "", description: "", category: "professional", target_date: "" });
                    }} disabled={!goal.title}>{t('staff.common.save', 'Save')}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="space-y-3">
              {goals.length === 0 ? <p className="text-sm text-muted-foreground">{t('staff.performance.noGoals', 'No goals yet — add one to start tracking your development.')}</p> :
                goals.map((g) => (
                  <div key={g.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium">{g.title}</div>
                        {g.description && <p className="text-sm text-muted-foreground">{g.description}</p>}
                      </div>
                      <Badge variant="outline">{goalCategoryWord(g.category, t)}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={g.progress_pct} className="flex-1" />
                      <span className="text-xs tabular-nums w-10 text-right">{g.progress_pct}%</span>
                      <Dialog open={updateOpen === g.id} onOpenChange={(o) => { setUpdateOpen(o ? g.id : null); setProgress(g.progress_pct); }}>
                        <DialogTrigger asChild><Button size="sm" variant="outline">{t('staff.performance.update', 'Update')}</Button></DialogTrigger>
                        <DialogContent>
                          <DialogHeader><DialogTitle>{t('staff.performance.updateProgress', 'Update progress')}</DialogTitle></DialogHeader>
                          <div className="space-y-3 py-2">
                            <Slider value={[progress]} onValueChange={(v) => setProgress(v[0])} max={100} step={5} />
                            <p className="text-center text-2xl font-bold">{progress}%</p>
                          </div>
                          <DialogFooter>
                            <Button onClick={async () => {
                              await upsertGoal.mutateAsync({ id: g.id, employee_id: empId, title: g.title, progress_pct: progress, status: progress >= 100 ? "completed" : "active" } as any);
                              setUpdateOpen(null);
                            }}>{t('staff.common.save', 'Save')}</Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                    {g.target_date && <p className="text-xs text-muted-foreground">{t('staff.performance.due', 'Due {date}').replace('{date}', formatDate(g.target_date, { year: "numeric", month: "short", day: "numeric" }))}</p>}
                  </div>
                ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="oneonones">
          <Card>
            <CardHeader><CardTitle>{t('staff.performance.meetingsTitle', 'Upcoming & past 1:1s')}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {meetings.length === 0 ? <p className="text-sm text-muted-foreground">{t('staff.performance.noMeetings', 'No 1:1s scheduled.')}</p> :
                meetings.map((m) => (
                  <div key={m.id} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{formatDateTime(m.scheduled_at, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                      <Badge variant={m.status === "completed" ? "default" : "secondary"}>{meetingStatusWord(m.status, t)}</Badge>
                    </div>
                    {m.agenda && <p className="text-sm text-muted-foreground mt-1"><strong>{t('staff.performance.agenda', 'Agenda:')}</strong> {m.agenda}</p>}
                    {m.notes && <p className="text-sm mt-2 border-t pt-2">{m.notes}</p>}
                  </div>
                ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reviews">
          <Card>
            <CardHeader><CardTitle>{t('staff.performance.reviews', 'Reviews')}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {reviews.length === 0 ? <p className="text-sm text-muted-foreground">{t('staff.performance.noReviews', 'No reviews yet.')}</p> :
                reviews.map((r) => (
                  <div key={r.id} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{reviewPeriodWord(r.period_type, t)}</div>
                        <p className="text-xs text-muted-foreground">{formatDate(r.period_start, { month: "short", day: "numeric" })} – {formatDate(r.period_end, { year: "numeric", month: "short", day: "numeric" })}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {r.overall_rating && <div className="flex items-center gap-0.5">{Array.from({ length: 5 }).map((_, i) => <Star key={i} className={`h-4 w-4 ${i < r.overall_rating! ? "fill-primary text-primary" : "text-muted-foreground"}`} />)}</div>}
                        <Badge variant={r.status === "acknowledged" ? "default" : "secondary"}>{reviewStatusWord(r.status, t)}</Badge>
                      </div>
                    </div>
                    {r.achievements && <p className="text-sm"><strong>{t('staff.performance.achievements', 'Achievements:')}</strong> {r.achievements}</p>}
                    {r.areas_of_improvement && <p className="text-sm"><strong>{t('staff.performance.improvements', 'Improvements:')}</strong> {r.areas_of_improvement}</p>}
                    {r.goals_next_period && <p className="text-sm"><strong>{t('staff.performance.nextPeriod', 'Next period:')}</strong> {r.goals_next_period}</p>}
                    {r.manager_comments && <p className="text-sm text-muted-foreground italic">"{r.manager_comments}"</p>}
                    {r.status !== "acknowledged" && r.status !== "draft" && (
                      <Button size="sm" onClick={() => ack.mutate({ id: r.id })}>{t('staff.performance.acknowledge', 'Acknowledge')}</Button>
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
