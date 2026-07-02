import { useState } from 'react';
import {
  BookOpen,
  Scale,
  FileBarChart,
  BarChart3,
  Layers,
  Receipt,
  Percent,
  FileText,
  ShieldCheck,
  History,
  CalendarCheck,
  Inbox,
  Download,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { JournalTab } from '@/components/admin/accounting/JournalTab';
import { LedgerTab } from '@/components/admin/accounting/LedgerTab';
import { OpeningBalancesTab } from '@/components/admin/accounting/OpeningBalancesTab';
import { ProfitLossTab } from '@/components/admin/accounting/ProfitLossTab';
import { BalanceSheetTab } from '@/components/admin/accounting/BalanceSheetTab';
import { TemplatesTab } from '@/components/admin/accounting/TemplatesTab';
import { TaxTab } from '@/components/admin/accounting/TaxTab';
import { VatReportTab } from '@/components/admin/accounting/VatReportTab';
import { SettingsTab } from '@/components/admin/accounting/SettingsTab';
import { AnalyticAccountingTab } from '@/components/admin/accounting/AnalyticAccountingTab';
import { AuditTrailTab } from '@/components/admin/accounting/AuditTrailTab';
import { ExportTab } from '@/components/admin/accounting/ExportTab';
import { VoucherIntegrityTab } from '@/components/admin/accounting/VoucherIntegrityTab';
import { YearEndTab } from '@/components/admin/accounting/YearEndTab';
import { PendingOperationsList } from '@/components/admin/PendingOperationsList';
import { cn } from '@/lib/utils';

type SectionId =
  | 'journal'
  | 'ledger'
  | 'opening'
  | 'pnl'
  | 'balance'
  | 'analytic'
  | 'vat'
  | 'tax'
  | 'yearend'
  | 'audit'
  | 'voucher'
  | 'pending'
  | 'templates'
  | 'export'
  | 'settings';

type NavItem = { id: SectionId; label: string; icon: LucideIcon };
type NavGroup = { label: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    label: 'Books',
    items: [
      { id: 'journal', label: 'Journal', icon: BookOpen },
      { id: 'ledger', label: 'General Ledger', icon: Layers },
      { id: 'opening', label: 'Opening Balances', icon: Scale },
    ],
  },
  {
    label: 'Reports',
    items: [
      { id: 'pnl', label: 'Profit & Loss', icon: FileBarChart },
      { id: 'balance', label: 'Balance Sheet', icon: BarChart3 },
      { id: 'analytic', label: 'Analytic', icon: Receipt },
    ],
  },
  {
    label: 'Compliance',
    items: [
      { id: 'vat', label: 'VAT Report', icon: Percent },
      { id: 'tax', label: 'Tax', icon: FileText },
      { id: 'yearend', label: 'Year-End', icon: CalendarCheck },
      { id: 'audit', label: 'Audit Trail', icon: History },
      { id: 'voucher', label: 'Voucher Integrity', icon: ShieldCheck },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'pending', label: 'Approvals', icon: Inbox },
      { id: 'templates', label: 'Templates', icon: FileText },
      { id: 'export', label: 'Export', icon: Download },
      { id: 'settings', label: 'Settings', icon: Settings },
    ],
  },
];

const CONTENT: Record<SectionId, () => JSX.Element> = {
  journal: () => <JournalTab />,
  ledger: () => <LedgerTab />,
  opening: () => <OpeningBalancesTab />,
  pnl: () => <ProfitLossTab />,
  balance: () => <BalanceSheetTab />,
  analytic: () => <AnalyticAccountingTab />,
  vat: () => <VatReportTab />,
  tax: () => <TaxTab />,
  yearend: () => <YearEndTab />,
  audit: () => <AuditTrailTab />,
  voucher: () => <VoucherIntegrityTab />,
  pending: () => <PendingOperationsList />,
  templates: () => <TemplatesTab />,
  export: () => <ExportTab />,
  settings: () => <SettingsTab />,
};

export default function AccountingPage() {
  const [section, setSection] = useState<SectionId>('journal');
  const Active = CONTENT[section];

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Accounting"
          description="Double-entry bookkeeping, ledgers and financial reports"
        />

        <div className="flex gap-6 items-start">
          <aside className="w-56 shrink-0 sticky top-4">
            <nav className="space-y-5">
              {NAV.map((group) => (
                <div key={group.label}>
                  <div className="px-2 mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </div>
                  <ul className="space-y-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = section === item.id;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => setSection(item.id)}
                            className={cn(
                              'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left transition-colors',
                              active
                                ? 'bg-accent text-accent-foreground font-medium'
                                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                            )}
                          >
                            <Icon className="h-4 w-4 shrink-0" />
                            <span className="truncate">{item.label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          </aside>

          <div className="flex-1 min-w-0">
            <Active />
          </div>
        </div>
      </AdminPageContainer>
    </AdminLayout>
  );
}
