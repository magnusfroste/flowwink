import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExpensesListTab } from '@/components/admin/expenses/ExpensesListTab';
import { ExpenseReportsTab } from '@/components/admin/expenses/ExpenseReportsTab';
import { ExpensePoliciesTab } from '@/components/admin/expenses/ExpensePoliciesTab';
import { ExpenseRatesTab } from '@/components/admin/expenses/ExpenseRatesTab';
import { ExpenseDelegationsTab } from '@/components/admin/expenses/ExpenseDelegationsTab';
import { AddExpenseDialog } from '@/components/admin/expenses/AddExpenseDialog';
import { useOpenOnQueryParam } from '@/hooks/useOpenOnQueryParam';

export default function ExpensesPage() {
  const [tab, setTab] = useState('expenses');
  const [addOpen, setAddOpen] = useState(false);
  useOpenOnQueryParam('new', '1', () => { setTab('expenses'); setAddOpen(true); });

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Expenses"
          description="Employee expenses, receipts and monthly reports"
        />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
            <TabsTrigger value="reports">Monthly Reports</TabsTrigger>
            <TabsTrigger value="policies">Policies</TabsTrigger>
            <TabsTrigger value="rates">Rates</TabsTrigger>
            <TabsTrigger value="delegations">Delegations</TabsTrigger>
          </TabsList>

          <TabsContent value="expenses">
            <ExpensesListTab />
          </TabsContent>
          <TabsContent value="reports">
            <ExpenseReportsTab />
          </TabsContent>
          <TabsContent value="policies">
            <ExpensePoliciesTab />
          </TabsContent>
          <TabsContent value="rates">
            <ExpenseRatesTab />
          </TabsContent>
          <TabsContent value="delegations">
            <ExpenseDelegationsTab />
          </TabsContent>
        </Tabs>
        <AddExpenseDialog open={addOpen} onOpenChange={setAddOpen} />
      </AdminPageContainer>
    </AdminLayout>
  );
}
