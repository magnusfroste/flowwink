import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PurchaseOrdersList } from '@/components/admin/purchasing/PurchaseOrdersList';
import { PurchaseOrderEditor } from '@/components/admin/purchasing/PurchaseOrderEditor';
import { VendorProductsManager } from '@/components/admin/purchasing/VendorProductsManager';
import { AutoReorderSettings } from '@/components/admin/purchasing/AutoReorderSettings';

export default function PurchaseOrdersPage() {
  const [tab, setTab] = useState('list');
  const [editingId, setEditingId] = useState<string | null>(null);

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
      <div className="space-y-6">
        <AdminPageHeader
          title="Purchase Orders"
          description="Automated procurement — FlowPilot monitors stock and creates POs from preferred vendors"
        />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="list">Orders</TabsTrigger>
            <TabsTrigger value="sourcing">Vendor Sourcing</TabsTrigger>
            <TabsTrigger value="reorder">Auto-Reorder</TabsTrigger>
            {tab === 'editor' && <TabsTrigger value="editor">{editingId ? 'Edit PO' : 'New PO'}</TabsTrigger>}
          </TabsList>

          <TabsContent value="list">
            <PurchaseOrdersList onEdit={openEditor} onNew={() => openEditor(null)} />
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
      </div>
    </AdminLayout>
  );
}
