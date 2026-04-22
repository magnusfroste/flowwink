import { useState } from "react";
import { useEmployeeSelf } from "@/hooks/useEmployeeSelf";
import {
  useEmployeeSkills,
  useCertifications,
  useSkillsCatalog,
  useUpsertEmployeeSkill,
  useDeleteEmployeeSkill,
  useUpsertCertification,
  useDeleteCertification,
  certificationStatus,
} from "@/hooks/useSkills";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Award, GraduationCap } from "lucide-react";
import { format } from "date-fns";

export default function MySkillsPage() {
  const { employee, isEmployee, loading } = useEmployeeSelf();
  const empId = employee?.id;
  const { data: skills } = useEmployeeSkills(empId);
  const { data: catalog } = useSkillsCatalog();
  const { data: certs } = useCertifications(empId);
  const upsertSkill = useUpsertEmployeeSkill();
  const delSkill = useDeleteEmployeeSkill();
  const upsertCert = useUpsertCertification();
  const delCert = useDeleteCertification();

  const [skillId, setSkillId] = useState<string>("");
  const [level, setLevel] = useState<number>(3);
  const [years, setYears] = useState<number>(0);
  const [certOpen, setCertOpen] = useState(false);
  const [newCert, setNewCert] = useState({ name: "", issuer: "", issued_date: "", expires_at: "" });

  if (loading) return <Skeleton className="h-64 w-full" />;
  if (!isEmployee || !empId) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          Skills register is only available for employees.
        </CardContent>
      </Card>
    );
  }

  const myIds = new Set(skills?.map((s) => s.skill_id));
  const available = catalog?.filter((c) => !myIds.has(c.id)) || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><GraduationCap className="h-5 w-5" /> My skills</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-[1fr_120px_120px_auto] items-end">
            <div>
              <Label>Skill</Label>
              <Select value={skillId} onValueChange={setSkillId}>
                <SelectTrigger><SelectValue placeholder="Select skill" /></SelectTrigger>
                <SelectContent>
                  {available.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Level (1-5)</Label>
              <Input type="number" min={1} max={5} value={level} onChange={(e) => setLevel(parseInt(e.target.value) || 3)} />
            </div>
            <div>
              <Label>Years</Label>
              <Input type="number" min={0} step={0.5} value={years} onChange={(e) => setYears(parseFloat(e.target.value) || 0)} />
            </div>
            <Button
              onClick={() => skillId && upsertSkill.mutate({ employee_id: empId, skill_id: skillId, proficiency_level: level, years_experience: years })}
              disabled={!skillId || upsertSkill.isPending}
            ><Plus className="h-4 w-4" /></Button>
          </div>

          <div className="space-y-2">
            {!skills?.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">No skills added yet.</p>
            ) : (
              skills.map((s) => (
                <div key={s.id} className="flex items-center justify-between border-b pb-2">
                  <div>
                    <p className="font-medium">{s.skills_catalog?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Level {s.proficiency_level}/5 · {s.years_experience}y experience
                    </p>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => delSkill.mutate(s.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Award className="h-5 w-5" /> Certifications</CardTitle>
          <Dialog open={certOpen} onOpenChange={setCertOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add certification</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name *</Label><Input value={newCert.name} onChange={(e) => setNewCert({ ...newCert, name: e.target.value })} /></div>
                <div><Label>Issuer</Label><Input value={newCert.issuer} onChange={(e) => setNewCert({ ...newCert, issuer: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Issued</Label><Input type="date" value={newCert.issued_date} onChange={(e) => setNewCert({ ...newCert, issued_date: e.target.value })} /></div>
                  <div><Label>Expires</Label><Input type="date" value={newCert.expires_at} onChange={(e) => setNewCert({ ...newCert, expires_at: e.target.value })} /></div>
                </div>
                <Button
                  onClick={() => {
                    if (!newCert.name) return;
                    upsertCert.mutate({
                      employee_id: empId,
                      name: newCert.name,
                      issuer: newCert.issuer || null,
                      issued_date: newCert.issued_date || null,
                      expires_at: newCert.expires_at || null,
                    } as any);
                    setNewCert({ name: "", issuer: "", issued_date: "", expires_at: "" });
                    setCertOpen(false);
                  }}
                  className="w-full"
                >Save</Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {!certs?.length ? (
            <p className="text-sm text-muted-foreground text-center py-4">No certifications.</p>
          ) : (
            <div className="space-y-2">
              {certs.map((c) => {
                const status = certificationStatus(c.expires_at);
                return (
                  <div key={c.id} className="flex items-center justify-between border-b pb-2">
                    <div>
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.issuer && `${c.issuer} · `}
                        {c.expires_at ? `expires ${format(new Date(c.expires_at), "MMM d, yyyy")}` : "no expiry"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {status === "expired" && <Badge variant="destructive">Expired</Badge>}
                      {status === "expiring" && <Badge className="bg-yellow-500">Expiring soon</Badge>}
                      {status === "valid" && <Badge variant="secondary">Valid</Badge>}
                      <Button size="icon" variant="ghost" onClick={() => delCert.mutate(c.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
