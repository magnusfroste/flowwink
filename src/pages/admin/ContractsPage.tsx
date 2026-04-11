import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ContractsList } from '@/components/admin/contracts/ContractsList';
import { ContractAlerts } from '@/components/admin/contracts/ContractAlerts';

export default function ContractsPage() {
  const [statusFilter, setStatusFilter] = useState('all');

  return (
    <AdminLayout>
      <div className="space-y-6">
        <AdminPageHeader
          title="Contracts & Documents"
          description="Manage contracts, track renewals, and store documents"
        />

        <ContractAlerts />

        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="space-y-4">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="draft">Draft</TabsTrigger>
            <TabsTrigger value="pending_signature">Pending</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="expired">Expired</TabsTrigger>
            <TabsTrigger value="terminated">Terminated</TabsTrigger>
          </TabsList>

          <TabsContent value={statusFilter}>
            <ContractsList statusFilter={statusFilter} />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
