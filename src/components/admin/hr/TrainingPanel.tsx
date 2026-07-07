import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useEmployees } from "@/hooks/useEmployees";
import { useHrQuery, useHrMutation } from "@/hooks/useHrOps";

type Course = {
  id: string;
  title: string;
  category: string | null;
  provider: string | null;
  duration_hours: number | null;
  cost_cents: number | null;
  mandatory: boolean;
  valid_months: number | null;
  is_active: boolean;
  enrolled: number;
  completed: number;
};
type Enrollment = {
  id: string;
  course: string;
  course_id: string;
  employee: string;
  employee_id: string;
  status: "enrolled" | "in_progress" | "completed" | "cancelled";
  enrolled_at: string;
  due_date: string | null;
  completed_at: string | null;
  score: number | null;
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  enrolled: "secondary",
  in_progress: "default",
  completed: "outline",
  cancelled: "outline",
};

export function TrainingPanel() {
  const { data: employees } = useEmployees();
  const coursesQ = useHrQuery<{ courses: Course[] }>("manage_training", { p_action: "list_courses" }, ["courses"]);
  const enrollmentsQ = useHrQuery<{ enrollments: Enrollment[] }>("manage_training", { p_action: "list_enrollments" }, ["enrollments"]);

  const invalidate: string[][] = [["manage_training", "courses"], ["manage_training", "enrollments"]];
  const createCourseMut = useHrMutation("manage_training", invalidate);
  const enrollMut = useHrMutation("manage_training", invalidate);
  const completeMut = useHrMutation("manage_training", invalidate);

  const [courseOpen, setCourseOpen] = useState(false);
  const [courseForm, setCourseForm] = useState({
    title: "", category: "", provider: "", duration_hours: "", cost_kr: "", mandatory: false, valid_months: "",
  });
  const submitCourse = async () => {
    try {
      await createCourseMut.mutateAsync({
        p_action: "create_course",
        p_title: courseForm.title,
        p_category: courseForm.category || null,
        p_provider: courseForm.provider || null,
        p_duration_hours: courseForm.duration_hours ? Number(courseForm.duration_hours) : null,
        p_cost_cents: courseForm.cost_kr ? Math.round(Number(courseForm.cost_kr) * 100) : null,
        p_mandatory: courseForm.mandatory,
        p_valid_months: courseForm.valid_months ? Number(courseForm.valid_months) : null,
      });
      toast.success("Course created");
      setCourseOpen(false);
      setCourseForm({ title: "", category: "", provider: "", duration_hours: "", cost_kr: "", mandatory: false, valid_months: "" });
    } catch { /* handled */ }
  };

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollForm, setEnrollForm] = useState({ employee_id: "", course_id: "", due_date: "" });
  const submitEnroll = async () => {
    try {
      await enrollMut.mutateAsync({
        p_action: "enroll",
        p_course_id: enrollForm.course_id,
        p_employee_id: enrollForm.employee_id,
        p_due_date: enrollForm.due_date || null,
      });
      toast.success("Enrolled");
      setEnrollOpen(false);
      setEnrollForm({ employee_id: "", course_id: "", due_date: "" });
    } catch { /* handled */ }
  };

  const [completeDlg, setCompleteDlg] = useState<Enrollment | null>(null);
  const [completeForm, setCompleteForm] = useState({ score: "", cert: true });
  const doComplete = async () => {
    if (!completeDlg) return;
    try {
      await completeMut.mutateAsync({
        p_action: "complete",
        p_course_id: completeDlg.course_id,
        p_employee_id: completeDlg.employee_id,
        p_score: completeForm.score ? Number(completeForm.score) : null,
        p_award_certification: completeForm.cert,
      });
      toast.success("Marked completed");
      setCompleteDlg(null);
      setCompleteForm({ score: "", cert: true });
    } catch { /* handled */ }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Course catalog</CardTitle>
          <Dialog open={courseOpen} onOpenChange={setCourseOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-2" /> New course</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New course</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><Label>Title</Label><Input value={courseForm.title} onChange={(e) => setCourseForm({ ...courseForm, title: e.target.value })} /></div>
                <div><Label>Category</Label><Input value={courseForm.category} onChange={(e) => setCourseForm({ ...courseForm, category: e.target.value })} /></div>
                <div><Label>Provider</Label><Input value={courseForm.provider} onChange={(e) => setCourseForm({ ...courseForm, provider: e.target.value })} /></div>
                <div><Label>Duration (h)</Label><Input type="number" value={courseForm.duration_hours} onChange={(e) => setCourseForm({ ...courseForm, duration_hours: e.target.value })} /></div>
                <div><Label>Cost (kr)</Label><Input type="number" value={courseForm.cost_kr} onChange={(e) => setCourseForm({ ...courseForm, cost_kr: e.target.value })} /></div>
                <div><Label>Valid (months)</Label><Input type="number" value={courseForm.valid_months} onChange={(e) => setCourseForm({ ...courseForm, valid_months: e.target.value })} /></div>
                <div className="flex items-center gap-2 mt-6">
                  <Checkbox id="mand" checked={courseForm.mandatory} onCheckedChange={(v) => setCourseForm({ ...courseForm, mandatory: !!v })} />
                  <Label htmlFor="mand">Mandatory</Label>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={submitCourse} disabled={!courseForm.title || createCourseMut.isPending}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {coursesQ.isLoading ? <Skeleton className="h-24 w-full" /> : !coursesQ.data?.courses.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">No courses yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Enrolled</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coursesQ.data.courses.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.title}</TableCell>
                    <TableCell>{c.category || "—"}</TableCell>
                    <TableCell>{c.provider || "—"}</TableCell>
                    <TableCell>{c.duration_hours ?? "—"}</TableCell>
                    <TableCell>{c.enrolled}</TableCell>
                    <TableCell>{c.completed}</TableCell>
                    <TableCell>{c.mandatory && <Badge variant="destructive">Mandatory</Badge>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Enrollments</CardTitle>
          <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-2" /> Enroll</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Enroll employee</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Employee</Label>
                  <Select value={enrollForm.employee_id} onValueChange={(v) => setEnrollForm({ ...enrollForm, employee_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                    <SelectContent>
                      {employees?.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Course</Label>
                  <Select value={enrollForm.course_id} onValueChange={(v) => setEnrollForm({ ...enrollForm, course_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
                    <SelectContent>
                      {coursesQ.data?.courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Due date (optional)</Label><Input type="date" value={enrollForm.due_date} onChange={(e) => setEnrollForm({ ...enrollForm, due_date: e.target.value })} /></div>
              </div>
              <DialogFooter>
                <Button onClick={submitEnroll} disabled={!enrollForm.employee_id || !enrollForm.course_id || enrollMut.isPending}>Enroll</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {enrollmentsQ.isLoading ? <Skeleton className="h-24 w-full" /> : !enrollmentsQ.data?.enrollments.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">No enrollments.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrollmentsQ.data.enrollments.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.employee}</TableCell>
                    <TableCell>{e.course}</TableCell>
                    <TableCell><Badge variant={STATUS_VARIANT[e.status] || "outline"}>{e.status}</Badge></TableCell>
                    <TableCell>{e.due_date ? format(new Date(e.due_date), "MMM d, yyyy") : "—"}</TableCell>
                    <TableCell>{e.score ?? "—"}</TableCell>
                    <TableCell>
                      {e.status !== "completed" && e.status !== "cancelled" && (
                        <Button size="sm" variant="ghost" onClick={() => setCompleteDlg(e)}>
                          <Check className="h-3.5 w-3.5 mr-1" /> Complete
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!completeDlg} onOpenChange={(v) => { if (!v) setCompleteDlg(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark completed</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{completeDlg?.employee} · {completeDlg?.course}</p>
            <div><Label>Score (optional)</Label><Input type="number" value={completeForm.score} onChange={(e) => setCompleteForm({ ...completeForm, score: e.target.value })} /></div>
            <div className="flex items-center gap-2">
              <Checkbox id="cert" checked={completeForm.cert} onCheckedChange={(v) => setCompleteForm({ ...completeForm, cert: !!v })} />
              <Label htmlFor="cert">Award certification</Label>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={doComplete} disabled={completeMut.isPending}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
