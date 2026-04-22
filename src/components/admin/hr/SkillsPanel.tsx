import { useState } from "react";
import { useEmployees } from "@/hooks/useEmployees";
import { useEmployeeSkills, useCertifications, certificationStatus } from "@/hooks/useSkills";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export function SkillsPanel() {
  const { data: employees } = useEmployees();
  const { data: skills, isLoading: sl } = useEmployeeSkills();
  const { data: certs, isLoading: cl } = useCertifications();
  const [tab, setTab] = useState("certs");

  if (sl || cl) return <Skeleton className="h-64 w-full" />;

  const empMap = new Map(employees?.map((e) => [e.id, e.name]));
  const expiring = certs?.filter((c) => certificationStatus(c.expires_at) === "expiring").length || 0;
  const expired = certs?.filter((c) => certificationStatus(c.expires_at) === "expired").length || 0;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex gap-3 mb-4">
          {expired > 0 && <Badge variant="destructive">{expired} expired</Badge>}
          {expiring > 0 && <Badge className="bg-yellow-500">{expiring} expiring soon</Badge>}
        </div>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="certs">Certifications ({certs?.length || 0})</TabsTrigger>
            <TabsTrigger value="skills">Skills ({skills?.length || 0})</TabsTrigger>
          </TabsList>
          <TabsContent value="certs" className="space-y-2">
            {!certs?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">No certifications recorded.</p>
            ) : (
              certs.map((c) => {
                const status = certificationStatus(c.expires_at);
                return (
                  <div key={c.id} className="flex items-center justify-between border-b pb-2">
                    <div>
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {empMap.get(c.employee_id)} · {c.issuer || "—"} ·{" "}
                        {c.expires_at ? `expires ${format(new Date(c.expires_at), "MMM d, yyyy")}` : "no expiry"}
                      </p>
                    </div>
                    {status === "expired" && <Badge variant="destructive">Expired</Badge>}
                    {status === "expiring" && <Badge className="bg-yellow-500">Expiring</Badge>}
                    {status === "valid" && <Badge variant="secondary">Valid</Badge>}
                  </div>
                );
              })
            )}
          </TabsContent>
          <TabsContent value="skills" className="space-y-2">
            {!skills?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">No skills recorded.</p>
            ) : (
              skills.map((s) => (
                <div key={s.id} className="flex items-center justify-between border-b pb-2">
                  <div>
                    <p className="font-medium">{s.skills_catalog?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {empMap.get(s.employee_id)} · Level {s.proficiency_level}/5 · {s.years_experience}y
                    </p>
                  </div>
                  {s.skills_catalog?.category && <Badge variant="outline">{s.skills_catalog.category}</Badge>}
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
