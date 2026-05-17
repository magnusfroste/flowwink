import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';
import { ContractsList } from '@/components/admin/contracts/ContractsList';
import { ContractAlerts } from '@/components/admin/contracts/ContractAlerts';

export default function ContractsPage() {
  const [statusFilter, setStatusFilter] = useState('all');

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <AdminPageHeader
            title="Contracts & Documents"
            description="Manage contracts, track renewals, and store documents"
          />
          <Button variant="outline" asChild>
            <Link to="/admin/contracts/templates">
              <FileText className="h-4 w-4 mr-2" /> Templates
            </Link>
          </Button>
        </div>

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
