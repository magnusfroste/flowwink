import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExpensesListTab } from '@/components/admin/expenses/ExpensesListTab';
import { ExpenseReportsTab } from '@/components/admin/expenses/ExpenseReportsTab';

export default function ExpensesPage() {
  const [tab, setTab] = useState('expenses');

  return (
    <AdminLayout>
      <div className="space-y-6">
        <AdminPageHeader
          title="Expense Reporting"
          description="Employee expenses, receipt scanning, monthly reports and approval workflow"
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
      </div>
    </AdminLayout>
  );
}
