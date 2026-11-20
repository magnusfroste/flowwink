import { useEmployeeSelf } from "@/hooks/useEmployeeSelf";
import { useEmploymentContracts, useSignEmploymentContract } from "@/hooks/useEmploymentContracts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { useCustomerFormat } from "@/hooks/useCustomerFormat";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useUiText } from "@/lib/ui-text";
import { contractStatusWord, employmentTypeWord } from "@/lib/staff-words";

export default function MyContractsPage() {
  const { formatDate, formatDateTime, formatCurrency } = useCustomerFormat();
  const t = useUiText();
  const { employee, isEmployee, loading: isLoading } = useEmployeeSelf();
  const { data: contracts } = useEmploymentContracts(employee?.id);
  const sign = useSignEmploymentContract();
  const [openId, setOpenId] = useState<string | null>(null);

  if (isLoading) return <div className="text-muted-foreground">{t('staff.common.loading', 'Loading…')}</div>;
  if (!isEmployee) return <div className="text-muted-foreground">{t('staff.contracts.noEmployee', 'No employee record found.')}</div>;

  return (
    <>
      <Helmet><title>{t('staff.contracts.title', 'My contracts')}</title></Helmet>
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold">{t('staff.contracts.title', 'My contracts')}</h2>
          <p className="text-sm text-muted-foreground">{t('staff.contracts.subtitle', 'Review and sign your employment contracts')}</p>
        </div>

        {!contracts?.length && (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            {t('staff.contracts.none', 'No contracts yet.')}
          </CardContent></Card>
        )}

        {contracts?.map((c) => {
          const needsSign = !c.signed_by_employee_at && (c.status === "sent" || c.status === "draft");
          return (
            <Card key={c.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      {c.title}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      {employmentTypeWord(c.employment_type, t)} · {t('staff.contracts.starts', 'starts {date}').replace('{date}', formatDate(c.start_date, { year: "numeric", month: "short", day: "numeric" }))}
                    </p>
                  </div>
                  <Badge variant={c.status === "active" || c.status === "signed" ? "default" : "secondary"}>
                    {contractStatusWord(c.status, t)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">{t('staff.contracts.salary', 'Salary:')}</span> {c.monthly_salary_cents ? t('staff.contracts.perMonth', '{amount}/mo').replace('{amount}', formatCurrency(c.monthly_salary_cents, c.currency)) : "—"}</div>
                  <div><span className="text-muted-foreground">{t('staff.contracts.hours', 'Hours:')}</span> {t('staff.contracts.perWeek', '{hours}/wk').replace('{hours}', String(c.weekly_hours))}</div>
                  <div><span className="text-muted-foreground">{t('staff.contracts.probationUntil', 'Probation until:')}</span> {c.probation_end_date ? formatDate(c.probation_end_date, { year: "numeric", month: "short", day: "numeric" }) : "—"}</div>
                  <div><span className="text-muted-foreground">{t('staff.contracts.notice', 'Notice:')}</span> {t('staff.contracts.noticeDays', '{count} days').replace('{count}', String(c.notice_period_days))}</div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <Dialog open={openId === c.id} onOpenChange={(o) => setOpenId(o ? c.id : null)}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline">{t('staff.contracts.read', 'Read full contract')}</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                      <DialogHeader><DialogTitle>{c.title}</DialogTitle></DialogHeader>
                      <pre className="whitespace-pre-wrap text-sm font-sans">{c.body_markdown}</pre>
                    </DialogContent>
                  </Dialog>

                  {needsSign && (
                    <Button size="sm" onClick={() => sign.mutate({ id: c.id, side: "employee" })}>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      {t('staff.contracts.sign', 'Sign contract')}
                    </Button>
                  )}
                  {c.signed_by_employee_at && (
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      {t('staff.contracts.youSigned', 'You signed {date}').replace('{date}', formatDateTime(c.signed_by_employee_at, { year: "numeric", month: "short", day: "numeric" }))}
                    </span>
                  )}
                  {!c.signed_by_employer_at && c.signed_by_employee_at && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {t('staff.contracts.awaitingEmployer', 'Awaiting employer signature')}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
