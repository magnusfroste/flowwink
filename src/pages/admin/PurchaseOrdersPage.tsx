import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PurchaseOrdersList } from '@/components/admin/purchasing/PurchaseOrdersList';
import { PurchaseOrderEditor } from '@/components/admin/purchasing/PurchaseOrderEditor';
import { VendorProductsManager } from '@/components/admin/purchasing/VendorProductsManager';
import { AutoReorderSettings } from '@/components/admin/purchasing/AutoReorderSettings';
import { RfqsPanel } from '@/components/admin/purchasing/RfqsPanel';
import { VendorInvoicesPanel } from '@/components/admin/purchasing/VendorInvoicesPanel';
import { VendorScorecardsPanel } from '@/components/admin/purchasing/VendorScorecardsPanel';
import { VendorDisputesPanel } from '@/components/admin/purchasing/VendorDisputesPanel';
import { useIsModuleEnabled } from '@/hooks/useModules';
import { useOpenOnQueryParam } from '@/hooks/useOpenOnQueryParam';

export default function PurchaseOrdersPage() {
  const [tab, setTab] = useState('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const fpEnabled = useIsModuleEnabled('flowpilot');
  useOpenOnQueryParam('new', '1', () => { setEditingId(null); setTab('editor'); });

  const openEditor = (id: string | null) => {
    setEditingId(id);
    setTab('editor');
  };

  const closeEditor = () => {
    setEditingId(null);
    setTab('list');
  };

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Purchase Orders"
          description={fpEnabled
            ? "Automated procurement — FlowPilot monitors stock and creates POs"
            : "Manage procurement and vendor orders"}
        />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="list">Orders</TabsTrigger>
            <TabsTrigger value="invoices">Vendor Invoices</TabsTrigger>
            <TabsTrigger value="disputes">Disputes &amp; Credits</TabsTrigger>
            <TabsTrigger value="scorecards">Vendor Scorecards</TabsTrigger>
            <TabsTrigger value="rfqs">RFQs</TabsTrigger>
            <TabsTrigger value="sourcing">Vendor Sourcing</TabsTrigger>
            <TabsTrigger value="reorder">Auto-Reorder</TabsTrigger>
            {tab === 'editor' && <TabsTrigger value="editor">{editingId ? 'Edit PO' : 'New PO'}</TabsTrigger>}
          </TabsList>

          <TabsContent value="list">
            <PurchaseOrdersList onEdit={openEditor} onNew={() => openEditor(null)} />
          </TabsContent>
          <TabsContent value="invoices">
            <VendorInvoicesPanel />
          </TabsContent>
          <TabsContent value="disputes">
            <VendorDisputesPanel />
          </TabsContent>
          <TabsContent value="scorecards">
            <VendorScorecardsPanel />
          </TabsContent>
          <TabsContent value="rfqs">
            <RfqsPanel />
          </TabsContent>
          <TabsContent value="sourcing">
            <VendorProductsManager />
          </TabsContent>
          <TabsContent value="reorder">
            <AutoReorderSettings />
          </TabsContent>
          <TabsContent value="editor">
            <PurchaseOrderEditor poId={editingId} onClose={closeEditor} />
          </TabsContent>
        </Tabs>
      </AdminPageContainer>
    </AdminLayout>
  );
}
