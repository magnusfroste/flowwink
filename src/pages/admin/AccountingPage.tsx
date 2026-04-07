import { useState, useMemo } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { JournalTab } from '@/components/admin/accounting/JournalTab';
import { LedgerTab } from '@/components/admin/accounting/LedgerTab';
import { OpeningBalancesTab } from '@/components/admin/accounting/OpeningBalancesTab';
import { ProfitLossTab } from '@/components/admin/accounting/ProfitLossTab';
import { BalanceSheetTab } from '@/components/admin/accounting/BalanceSheetTab';
import { TemplatesTab } from '@/components/admin/accounting/TemplatesTab';
import { SettingsTab } from '@/components/admin/accounting/SettingsTab';

export default function AccountingPage() {
  const [tab, setTab] = useState('journal');

  return (
    <AdminLayout>
      <div className="space-y-6">
        <AdminPageHeader
          title="Accounting"
          description="Double-entry bookkeeping — journal entries, general ledger, and financial reports"
        />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="journal">Journal</TabsTrigger>
            <TabsTrigger value="opening">Opening Balances</TabsTrigger>
            <TabsTrigger value="ledger">General Ledger</TabsTrigger>
            <TabsTrigger value="pnl">Profit & Loss</TabsTrigger>
            <TabsTrigger value="balance">Balance Sheet</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="journal">
            <JournalTab />
          </TabsContent>
          <TabsContent value="opening">
            <OpeningBalancesTab />
          </TabsContent>
          <TabsContent value="ledger">
            <LedgerTab />
          </TabsContent>
          <TabsContent value="pnl">
            <ProfitLossTab />
          </TabsContent>
          <TabsContent value="balance">
            <BalanceSheetTab />
          </TabsContent>
          <TabsContent value="templates">
            <TemplatesTab />
          </TabsContent>
          <TabsContent value="settings">
            <SettingsTab />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
