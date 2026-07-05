import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExpensesListTab } from '@/components/admin/expenses/ExpensesListTab';
import { ExpenseReportsTab } from '@/components/admin/expenses/ExpenseReportsTab';
import { ExpensePoliciesTab } from '@/components/admin/expenses/ExpensePoliciesTab';

export default function ExpensesPage() {
  const [tab, setTab] = useState('expenses');

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
          </TabsList>

          <TabsContent value="expenses">
            <ExpensesListTab />
          </TabsContent>
          <TabsContent value="reports">
            <ExpenseReportsTab />
          </TabsContent>
        </Tabs>
      </AdminPageContainer>
    </AdminLayout>
  );
}
