import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';
import { JournalTab } from '@/components/admin/accounting/JournalTab';
import { LedgerTab } from '@/components/admin/accounting/LedgerTab';
import { OpeningBalancesTab } from '@/components/admin/accounting/OpeningBalancesTab';
import { ProfitLossTab } from '@/components/admin/accounting/ProfitLossTab';
import { BalanceSheetTab } from '@/components/admin/accounting/BalanceSheetTab';
import { TemplatesTab } from '@/components/admin/accounting/TemplatesTab';
import { TaxTab } from '@/components/admin/accounting/TaxTab';
import { VatReportTab } from '@/components/admin/accounting/VatReportTab';
import { MomsdeklarationTab } from '@/components/admin/accounting/MomsdeklarationTab';
import { SettingsTab } from '@/components/admin/accounting/SettingsTab';
import { AnalyticAccountingTab } from '@/components/admin/accounting/AnalyticAccountingTab';
import { AuditTrailTab } from '@/components/admin/accounting/AuditTrailTab';
import { ExportTab } from '@/components/admin/accounting/ExportTab';
import { VoucherIntegrityTab } from '@/components/admin/accounting/VoucherIntegrityTab';
import { YearEndTab } from '@/components/admin/accounting/YearEndTab';
import { BudgetsTab } from '@/components/admin/accounting/BudgetsTab';
import { PendingOperationsList } from '@/components/admin/PendingOperationsList';

type TabId =
  | 'journal' | 'ledger' | 'pnl' | 'balance'
  | 'vat' | 'momsdekl' | 'tax'
  | 'opening' | 'analytic' | 'yearend' | 'audit' | 'voucher' | 'budgets'
  | 'pending' | 'templates' | 'export' | 'settings';

const PRIMARY: { id: TabId; label: string }[] = [
  { id: 'journal', label: 'Journal' },
  { id: 'ledger', label: 'General Ledger' },
  { id: 'pnl', label: 'Profit & Loss' },
  { id: 'balance', label: 'Balance Sheet' },
  { id: 'vat', label: 'VAT' },
  { id: 'tax', label: 'Tax' },
];

const MORE: { group: string; items: { id: TabId; label: string }[] }[] = [
  {
    group: 'Books',
    items: [
      { id: 'opening', label: 'Opening Balances' },
      { id: 'analytic', label: 'Analytic' },
      { id: 'budgets', label: 'Budgets' },
    ],
  },
  {
    group: 'Compliance',
    items: [
      { id: 'yearend', label: 'Year-End' },
      { id: 'audit', label: 'Audit Trail' },
      { id: 'voucher', label: 'Voucher Integrity' },
    ],
  },
  {
    group: 'Operations',
    items: [
      { id: 'pending', label: 'Approvals' },
      { id: 'templates', label: 'Templates' },
      { id: 'export', label: 'Export' },
      { id: 'settings', label: 'Settings' },
    ],
  },
];

const ALL_IDS = new Set<TabId>([
  ...PRIMARY.map((t) => t.id),
  ...MORE.flatMap((g) => g.items.map((i) => i.id)),
]);

export default function AccountingPage() {
  const [tab, setTab] = useState<TabId>('journal');
  const inPrimary = PRIMARY.some((t) => t.id === tab);
  const activeMore = !inPrimary
    ? MORE.flatMap((g) => g.items).find((i) => i.id === tab)
    : null;

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Accounting"
          description="Double-entry bookkeeping, ledgers and financial reports"
        />

        <Tabs value={tab} onValueChange={(v) => ALL_IDS.has(v as TabId) && setTab(v as TabId)}>
          <div className="flex items-center gap-2 flex-wrap">
            <TabsList>
              {PRIMARY.map((t) => (
                <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>
              ))}
              {activeMore && (
                <TabsTrigger value={activeMore.id}>{activeMore.label}</TabsTrigger>
              )}
            </TabsList>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-9">
                  More
                  <ChevronDown className="h-4 w-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {MORE.map((group, gi) => (
                  <div key={group.group}>
                    {gi > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      {group.group}
                    </DropdownMenuLabel>
                    {group.items.map((item) => (
                      <DropdownMenuItem
                        key={item.id}
                        onSelect={() => setTab(item.id)}
                        className={tab === item.id ? 'bg-accent' : ''}
                      >
                        {item.label}
                      </DropdownMenuItem>
                    ))}
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <TabsContent value="journal"><JournalTab /></TabsContent>
          <TabsContent value="ledger"><LedgerTab /></TabsContent>
          <TabsContent value="pnl"><ProfitLossTab /></TabsContent>
          <TabsContent value="balance"><BalanceSheetTab /></TabsContent>
          <TabsContent value="vat"><VatReportTab /></TabsContent>
          <TabsContent value="tax"><TaxTab /></TabsContent>
          <TabsContent value="opening"><OpeningBalancesTab /></TabsContent>
          <TabsContent value="analytic"><AnalyticAccountingTab /></TabsContent>
          <TabsContent value="yearend"><YearEndTab /></TabsContent>
          <TabsContent value="audit"><AuditTrailTab /></TabsContent>
          <TabsContent value="voucher"><VoucherIntegrityTab /></TabsContent>
          <TabsContent value="budgets"><BudgetsTab /></TabsContent>
          <TabsContent value="pending"><PendingOperationsList /></TabsContent>
          <TabsContent value="templates"><TemplatesTab /></TabsContent>
          <TabsContent value="export"><ExportTab /></TabsContent>
          <TabsContent value="settings"><SettingsTab /></TabsContent>
        </Tabs>
      </AdminPageContainer>
    </AdminLayout>
  );
}
