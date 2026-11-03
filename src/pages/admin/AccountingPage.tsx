import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useOpenOnQueryParam } from '@/hooks/useOpenOnQueryParam';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWorkspace } from '@/hooks/useWorkspace';
import { activeItem } from '@/lib/workspaces';
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
import { EventsToBookTab } from '@/components/admin/accounting/EventsToBookTab';
import { SettingsTab } from '@/components/admin/accounting/SettingsTab';
import { AnalyticAccountingTab } from '@/components/admin/accounting/AnalyticAccountingTab';
import { AuditTrailTab } from '@/components/admin/accounting/AuditTrailTab';
import { ExportTab } from '@/components/admin/accounting/ExportTab';
import { VoucherIntegrityTab } from '@/components/admin/accounting/VoucherIntegrityTab';
import { YearEndTab } from '@/components/admin/accounting/YearEndTab';
import { BudgetsTab } from '@/components/admin/accounting/BudgetsTab';
import { CashFlowTab } from '@/components/admin/accounting/CashFlowTab';
import { ConsolidationTab } from '@/components/admin/accounting/ConsolidationTab';
import { PendingOperationsList } from '@/components/admin/PendingOperationsList';
import { OverviewTab } from '@/components/admin/accounting/dashboard/OverviewTab';
import { MonthCloseTab } from '@/components/admin/accounting/MonthCloseTab';
import { FilingsTab } from '@/components/admin/accounting/FilingsTab';
import { FiscalYearProvider } from '@/components/admin/accounting/FiscalYearContext';
import { FiscalYearSelector } from '@/components/admin/accounting/FiscalYearSelector';
import { NewJournalEntryDialog } from '@/components/admin/accounting/NewJournalEntryDialog';

type TabId =
  | 'overview'
  | 'journal' | 'ledger' | 'pnl' | 'balance'
  | 'vat' | 'momsdekl' | 'tax'
  | 'opening' | 'analytic' | 'close' | 'filings' | 'yearend' | 'audit' | 'voucher' | 'budgets' | 'cashflow' | 'consolidation'
  | 'pending' | 'events_to_book' | 'templates' | 'export' | 'settings';

const PRIMARY: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'journal', label: 'Journal' },
  { id: 'ledger', label: 'General Ledger' },
  { id: 'pnl', label: 'Profit & Loss' },
  { id: 'balance', label: 'Balance Sheet' },
  { id: 'vat', label: 'VAT' },
  { id: 'momsdekl', label: 'VAT Declaration' },
  { id: 'tax', label: 'Tax' },
];

const MORE: { group: string; items: { id: TabId; label: string }[] }[] = [
  {
    group: 'Books',
    items: [
      { id: 'opening', label: 'Opening Balances' },
      { id: 'analytic', label: 'Analytic' },
      { id: 'budgets', label: 'Budgets' },
      { id: 'cashflow', label: 'Cash flow' },
      { id: 'consolidation', label: 'Consolidation' },
    ],
  },
  {
    group: 'Compliance',
    items: [
      { id: 'close', label: 'Month close' },
      { id: 'filings', label: 'Filings' },
      { id: 'yearend', label: 'Year-End' },
      { id: 'audit', label: 'Audit Trail' },
      { id: 'voucher', label: 'Voucher Integrity' },
    ],
  },
  {
    group: 'Operations',
    items: [
      { id: 'pending', label: 'Approvals' },
      { id: 'events_to_book', label: 'Events to book' },
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

function TabView({ tab, onNavigate }: { tab: TabId; onNavigate: (id: string) => void }) {
  const views: Record<TabId, ReactNode> = {
    overview: <OverviewTab onNavigate={onNavigate} />,
    journal: <JournalTab />,
    ledger: <LedgerTab />,
    pnl: <ProfitLossTab />,
    balance: <BalanceSheetTab />,
    vat: <VatReportTab />,
    momsdekl: <MomsdeklarationTab />,
    tax: <TaxTab />,
    opening: <OpeningBalancesTab />,
    analytic: <AnalyticAccountingTab />,
    close: <MonthCloseTab onNavigate={onNavigate} />,
    filings: <FilingsTab />,
    yearend: <YearEndTab />,
    audit: <AuditTrailTab />,
    voucher: <VoucherIntegrityTab />,
    budgets: <BudgetsTab />,
    cashflow: <CashFlowTab />,
    consolidation: <ConsolidationTab />,
    pending: <PendingOperationsList />,
    events_to_book: <EventsToBookTab />,
    templates: <TemplatesTab />,
    export: <ExportTab />,
    settings: <SettingsTab />,
  };
  return <div key={tab}>{views[tab]}</div>;
}

/**
 * Accounting is a workspace (src/lib/workspaces.ts): its menu is the panel on
 * the left, and every view has its own address (?tab=). The tab row below is
 * only the fallback for a session with no panel (accounting switched off for
 * the panel's module check while an admin still opens the page).
 */
export default function AccountingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab') as TabId | null;
  const tab: TabId = urlTab && ALL_IDS.has(urlTab) ? urlTab : 'overview';
  const setTab = (next: TabId) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    setSearchParams(params);
  };
  const go = (id: string) => ALL_IDS.has(id as TabId) && setTab(id as TabId);
  const [showCreate, setShowCreate] = useState(false);
  const workspace = useWorkspace();

  useOpenOnQueryParam('new', '1', () => setShowCreate(true));

  const inPrimary = PRIMARY.some((t) => t.id === tab);
  const activeMore = !inPrimary
    ? MORE.flatMap((g) => g.items).find((i) => i.id === tab)
    : null;
  const current = workspace ? activeItem(workspace.def, '/admin/accounting', `?tab=${tab}`) : null;

  return (
    <AdminLayout>
      <AdminPageContainer>
        <FiscalYearProvider>
        <AdminPageHeader
          title={current?.label ?? 'Accounting'}
          description={current ? undefined : 'Double-entry bookkeeping, ledgers and financial reports'}
        >
          <FiscalYearSelector />
        </AdminPageHeader>

          {!workspace && (
            <div className="flex items-center gap-2 flex-wrap mb-4">
              <Tabs value={tab} onValueChange={go}>
                <TabsList>
                  {PRIMARY.map((t) => (
                    <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>
                  ))}
                  {activeMore && (
                    <TabsTrigger value={activeMore.id}>{activeMore.label}</TabsTrigger>
                  )}
                </TabsList>
              </Tabs>

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
          )}

          <TabView tab={tab} onNavigate={go} />
        </FiscalYearProvider>

        <NewJournalEntryDialog open={showCreate} onOpenChange={setShowCreate} />
      </AdminPageContainer>
    </AdminLayout>
  );
}
