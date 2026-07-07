import { forwardRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';

export type PayslipData = {
  employer?: { name?: string } | null;
  employee?: {
    id: string;
    name?: string | null;
    email?: string | null;
    title?: string | null;
    department?: string | null;
    payroll_country?: string | null;
  } | null;
  period: string;
  run_id: string;
  status: string;
  components: Array<{
    type: string;
    label: string;
    amount_cents: number;
    taxable?: boolean;
    source?: string | null;
  }>;
  amounts: {
    gross_cents: number;
    benefits_cents?: number;
    deductions_cents?: number;
    taxable_cents: number;
    tax_cents: number;
    tax_correction_cents?: number;
    social_fee_cents: number;
    employer_social_pct?: number;
    pension_employer_cents?: number;
    pension_employee_cents?: number;
    sick_days?: number;
    sick_deduction_cents?: number;
    sick_pay_cents?: number;
    advance_deduction_cents?: number;
    net_cents: number;
  };
  ytd?: {
    gross_cents: number;
    taxable_cents: number;
    tax_cents: number;
    net_cents: number;
    pension_employee_cents?: number;
    months?: number;
  } | null;
};

export function fmtSEK(cents: number | null | undefined): string {
  const v = (cents ?? 0) / 100;
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 2,
  }).format(v);
}

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'outline'> = {
  paid: 'default',
  approved: 'secondary',
  draft: 'outline',
};

interface PayslipViewProps {
  payslip: PayslipData;
}

export const PayslipView = forwardRef<HTMLDivElement, PayslipViewProps>(({ payslip }, ref) => {
  const { employer, employee, period, status, components, amounts, ytd } = payslip;

  const row = (label: string, cents: number | null | undefined, opts?: { muted?: boolean; negative?: boolean }) => {
    if (cents == null || cents === 0) return null;
    return (
      <div className="flex justify-between text-sm py-1">
        <span className={opts?.muted ? 'text-muted-foreground' : ''}>{label}</span>
        <span className="font-mono">{opts?.negative ? '−' : ''}{fmtSEK(Math.abs(cents))}</span>
      </div>
    );
  };

  return (
    <div ref={ref} className="payslip-printable bg-background text-foreground p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-6 border-b pb-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Employer</div>
          <div className="text-lg font-semibold">{employer?.name ?? '—'}</div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Payslip</div>
          <div className="text-lg font-semibold">{period}</div>
          <Badge variant={STATUS_VARIANTS[status] ?? 'outline'} className="mt-1 capitalize">
            {status}
          </Badge>
        </div>
      </div>

      {/* Employee */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Employee</div>
          <div className="font-medium">{employee?.name ?? '—'}</div>
          {employee?.email && <div className="text-muted-foreground">{employee.email}</div>}
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Role</div>
          <div>{employee?.title ?? '—'}</div>
          {employee?.department && <div className="text-muted-foreground">{employee.department}</div>}
        </div>
      </div>

      {/* Components */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Components</h3>
        {components.length === 0 ? (
          <div className="text-sm text-muted-foreground italic">No components.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-center">Taxable</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {components.map((c, i) => (
                <TableRow key={i}>
                  <TableCell>{c.label}</TableCell>
                  <TableCell className="text-muted-foreground capitalize">{c.type}</TableCell>
                  <TableCell className="text-center text-muted-foreground">
                    {c.taxable ? 'Yes' : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono">{fmtSEK(c.amount_cents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Gross → Net */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Gross to net</h3>
        <div className="rounded-md border p-4 space-y-1">
          {row('Gross', amounts.gross_cents)}
          {row('Benefits', amounts.benefits_cents)}
          {row('Deductions', amounts.deductions_cents, { negative: true })}
          {row('Sick deduction', amounts.sick_deduction_cents, { negative: true })}
          {row('Sick pay', amounts.sick_pay_cents)}
          {row('Pension (employee)', amounts.pension_employee_cents, { negative: true })}
          {row('Advance deduction', amounts.advance_deduction_cents, { negative: true })}
          <Separator className="my-2" />
          {row('Taxable base', amounts.taxable_cents, { muted: true })}
          {row('Preliminary tax (PAYE)', amounts.tax_cents, { negative: true })}
          {row('Tax correction', amounts.tax_correction_cents)}
          <Separator className="my-2" />
          <div className="flex justify-between text-base font-semibold pt-1">
            <span>Net pay</span>
            <span className="font-mono">{fmtSEK(amounts.net_cents)}</span>
          </div>
        </div>
      </div>

      {/* Employer contributions */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Employer contributions</h3>
        <div className="rounded-md border p-4 space-y-1">
          {row(
            `Social fee${amounts.employer_social_pct ? ` (${amounts.employer_social_pct}%)` : ''}`,
            amounts.social_fee_cents,
          )}
          {row('Pension (employer)', amounts.pension_employer_cents)}
        </div>
      </div>

      {/* YTD */}
      {ytd && (
        <div>
          <h3 className="text-sm font-semibold mb-2">
            Year-to-date{ytd.months ? ` (${ytd.months} month${ytd.months === 1 ? '' : 's'})` : ''}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <YtdStat label="Gross" value={fmtSEK(ytd.gross_cents)} />
            <YtdStat label="Taxable" value={fmtSEK(ytd.taxable_cents)} />
            <YtdStat label="Tax" value={fmtSEK(ytd.tax_cents)} />
            <YtdStat label="Net" value={fmtSEK(ytd.net_cents)} />
          </div>
        </div>
      )}
    </div>
  );
});
PayslipView.displayName = 'PayslipView';

function YtdStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold font-mono">{value}</div>
    </div>
  );
}

/**
 * Trigger the browser print dialog scoped to only .payslip-printable content.
 * Injects a one-shot @media print style, prints, then removes it.
 */
export function printPayslip() {
  const styleId = 'payslip-print-style';
  let style = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = styleId;
    style.media = 'print';
    style.textContent = `
      @media print {
        body * { visibility: hidden !important; }
        .payslip-printable, .payslip-printable * { visibility: visible !important; }
        .payslip-printable {
          position: absolute !important;
          left: 0; top: 0; right: 0;
          width: 100% !important;
          padding: 24px !important;
          background: white !important;
          color: black !important;
        }
        @page { margin: 16mm; }
      }
    `;
    document.head.appendChild(style);
  }
  window.print();
}
