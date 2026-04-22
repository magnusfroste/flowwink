import { useState } from "react";
import {
  useEmploymentContracts,
  useContractTemplatesEmp,
  useCreateEmploymentContract,
  useUpdateEmploymentContract,
  useSignEmploymentContract,
  useOnboardingTemplates,
  useApplyOnboardingTemplate,
  renderEmploymentTemplate,
  type EmploymentContract,
  type ContractTemplate,
} from "@/hooks/useEmploymentContracts";
import { useEmployees } from "@/hooks/useEmployees";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, FilePlus, ListChecks, CheckCircle2, Clock } from "lucide-react";
import { format } from "date-fns";

function statusBadge(s: EmploymentContract["status"]) {
  const map: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    sent: "bg-blue-500/15 text-blue-600",
    signed: "bg-green-500/15 text-green-600",
    active: "bg-green-500/15 text-green-700",
    terminated: "bg-red-500/15 text-red-600",
    expired: "bg-orange-500/15 text-orange-600",
  };
  return <Badge className={map[s] || ""} variant="secondary">{s}</Badge>;
}

function NewContractDialog({ templates }: { templates: ContractTemplate[] }) {
  const [open, setOpen] = useState(false);
  const { data: employees } = useEmployees();
  const create = useCreateEmploymentContract();

  const [employeeId, setEmployeeId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("Employment Contract");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [salary, setSalary] = useState("");
  const [hours, setHours] = useState("40");

  const tpl = templates.find((t) => t.id === templateId);
  const emp = employees?.find((e) => e.id === employeeId);

  const submit = async () => {
    if (!employeeId || !startDate) return;
    const probationMonths = tpl?.default_probation_months ?? 6;
    const probationEnd = new Date(startDate);
    probationEnd.setMonth(probationEnd.getMonth() + probationMonths);

    const body = tpl
      ? renderEmploymentTemplate(tpl.body_markdown, {
          company_name: "Our Company",
          employee_name: emp?.name ?? "",
          personal_number: (emp as any)?.personal_number ?? "",
          title: emp?.title ?? "",
          department: emp?.department ?? "",
          start_date: startDate,
          monthly_salary: salary,
          currency: "SEK",
          weekly_hours: hours,
          probation_months: String(probationMonths),
          notice_period_days: String(tpl?.default_notice_period_days ?? 30),
        })
      : "";

    await create.mutateAsync({
      employee_id: employeeId,
      template_id: templateId || null,
      title,
      employment_type: tpl?.employment_type ?? "permanent",
      start_date: startDate,
      monthly_salary_cents: salary ? Math.round(parseFloat(salary) * 100) : null,
      weekly_hours: hours ? parseFloat(hours) : 40,
      probation_end_date: probationEnd.toISOString().slice(0, 10),
      notice_period_days: tpl?.default_notice_period_days ?? 30,
      body_markdown: body,
      status: "draft",
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><FilePlus className="h-4 w-4 mr-2" />New contract</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New employment contract</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Employee</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>
                {employees?.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>Start date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label>Monthly salary</Label>
              <Input type="number" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>Weekly hours</Label>
              <Input type="number" value={hours} onChange={(e) => setHours(e.target.value)} />
            </div>
          </div>
          <Button onClick={submit} disabled={!employeeId || create.isPending} className="w-full">
            Create draft
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ApplyOnboardingButton({ employees }: { employees: any[] }) {
  const [open, setOpen] = useState(false);
  const { data: templates } = useOnboardingTemplates();
  const apply = useApplyOnboardingTemplate();
  const [empId, setEmpId] = useState("");
  const [tplId, setTplId] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><ListChecks className="h-4 w-4 mr-2" />Apply onboarding</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Apply onboarding template</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Employee</Label>
            <Select value={empId} onValueChange={setEmpId}>
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Template</Label>
            <Select value={tplId} onValueChange={setTplId}>
              <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
              <SelectContent>
                {templates?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name} ({t.items.length} items)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={async () => {
              await apply.mutateAsync({ employee_id: empId, template_id: tplId });
              setOpen(false);
            }}
            disabled={!empId || !tplId || apply.isPending}
            className="w-full"
          >
            Create checklist
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ContractDetail({ c, employees }: { c: EmploymentContract; employees: any[] }) {
  const [open, setOpen] = useState(false);
  const update = useUpdateEmploymentContract();
  const sign = useSignEmploymentContract();
  const emp = employees.find((e) => e.id === c.employee_id);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">View</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {c.title} — {emp?.name} {statusBadge(c.status)}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div><span className="text-muted-foreground">Type:</span> {c.employment_type}</div>
            <div><span className="text-muted-foreground">Start:</span> {c.start_date}</div>
            <div><span className="text-muted-foreground">Probation end:</span> {c.probation_end_date ?? "—"}</div>
            <div><span className="text-muted-foreground">Salary:</span> {c.monthly_salary_cents ? `${(c.monthly_salary_cents / 100).toLocaleString()} ${c.currency}` : "—"}</div>
            <div><span className="text-muted-foreground">Hours/wk:</span> {c.weekly_hours}</div>
            <div><span className="text-muted-foreground">Notice:</span> {c.notice_period_days} days</div>
          </div>
          <div className="rounded border bg-muted/30 p-4">
            <Textarea
              value={c.body_markdown}
              onChange={(e) => update.mutate({ id: c.id, body_markdown: e.target.value })}
              rows={20}
              className="font-mono text-xs bg-background"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {c.status === "draft" && (
              <Button size="sm" onClick={() => update.mutate({ id: c.id, status: "sent", sent_at: new Date().toISOString() })}>
                Send to employee
              </Button>
            )}
            {!c.signed_by_employer_at && (
              <Button size="sm" variant="outline" onClick={() => sign.mutate({ id: c.id, side: "employer" })}>
                Sign as employer
              </Button>
            )}
            {c.status === "signed" && (
              <Button size="sm" variant="outline" onClick={() => update.mutate({ id: c.id, status: "active" })}>
                Mark active
              </Button>
            )}
            {c.status === "active" && (
              <Button size="sm" variant="destructive" onClick={() => update.mutate({ id: c.id, status: "terminated", terminated_at: new Date().toISOString() })}>
                Terminate
              </Button>
            )}
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            {c.signed_by_employee_at && <div className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-600" />Employee signed: {format(new Date(c.signed_by_employee_at), "PPp")}</div>}
            {c.signed_by_employer_at && <div className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-600" />Employer signed: {format(new Date(c.signed_by_employer_at), "PPp")}</div>}
            {c.sent_at && <div className="flex items-center gap-1"><Clock className="h-3 w-3" />Sent: {format(new Date(c.sent_at), "PPp")}</div>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ContractsPanel() {
  const { data: contracts, isLoading } = useEmploymentContracts();
  const { data: templates } = useContractTemplatesEmp();
  const { data: onbTemplates } = useOnboardingTemplates();
  const { data: employees } = useEmployees();

  return (
    <Tabs defaultValue="contracts">
      <TabsList>
        <TabsTrigger value="contracts">Contracts ({contracts?.length ?? 0})</TabsTrigger>
        <TabsTrigger value="templates">Contract templates ({templates?.length ?? 0})</TabsTrigger>
        <TabsTrigger value="onboarding">Onboarding templates ({onbTemplates?.length ?? 0})</TabsTrigger>
      </TabsList>

      <TabsContent value="contracts">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Employment contracts</CardTitle>
            <div className="flex gap-2">
              <ApplyOnboardingButton employees={employees ?? []} />
              <NewContractDialog templates={templates ?? []} />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : !contracts?.length ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                No contracts yet — click <strong>New contract</strong> to create one.
              </div>
            ) : (
              <div className="space-y-2">
                {contracts.map((c) => {
                  const emp = employees?.find((e) => e.id === c.employee_id);
                  return (
                    <div key={c.id} className="flex items-center justify-between rounded border p-3 hover:bg-muted/30">
                      <div className="min-w-0">
                        <div className="font-medium flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          {emp?.name ?? "—"} {statusBadge(c.status)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {c.title} · {c.employment_type} · starts {c.start_date}
                          {c.monthly_salary_cents ? ` · ${(c.monthly_salary_cents / 100).toLocaleString()} ${c.currency}/mo` : ""}
                        </div>
                      </div>
                      <ContractDetail c={c} employees={employees ?? []} />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="templates">
        <Card>
          <CardContent className="pt-6 space-y-2">
            {templates?.map((t) => (
              <div key={t.id} className="rounded border p-3">
                <div className="font-medium flex items-center gap-2">
                  {t.name}
                  {t.is_default && <Badge variant="secondary">Default</Badge>}
                  <Badge variant="outline">{t.employment_type}</Badge>
                </div>
                {t.description && <div className="text-xs text-muted-foreground mt-1">{t.description}</div>}
                <div className="text-xs text-muted-foreground mt-1">
                  Probation: {t.default_probation_months}mo · Notice: {t.default_notice_period_days}d
                </div>
              </div>
            ))}
            {!templates?.length && <div className="text-sm text-muted-foreground">No templates</div>}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="onboarding">
        <Card>
          <CardContent className="pt-6 space-y-2">
            {onbTemplates?.map((t) => (
              <div key={t.id} className="rounded border p-3">
                <div className="font-medium flex items-center gap-2">
                  {t.name}
                  {t.is_default && <Badge variant="secondary">Default</Badge>}
                  {t.employment_type && <Badge variant="outline">{t.employment_type}</Badge>}
                </div>
                {t.description && <div className="text-xs text-muted-foreground mt-1">{t.description}</div>}
                <div className="text-xs text-muted-foreground mt-1">{t.items.length} items</div>
              </div>
            ))}
            {!onbTemplates?.length && <div className="text-sm text-muted-foreground">No templates</div>}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
