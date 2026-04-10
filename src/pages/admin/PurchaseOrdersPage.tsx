import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PurchaseOrdersList } from '@/components/admin/purchasing/PurchaseOrdersList';
import { PurchaseOrderEditor } from '@/components/admin/purchasing/PurchaseOrderEditor';

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
          description="Create, track and receive purchase orders from vendors"
        />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="list">All Orders</TabsTrigger>
            {tab === 'editor' && <TabsTrigger value="editor">{editingId ? 'Edit PO' : 'New PO'}</TabsTrigger>}
          </TabsList>

          <TabsContent value="list">
            <PurchaseOrdersList onEdit={openEditor} onNew={() => openEditor(null)} />
          </TabsContent>
          <TabsContent value="editor">
            <PurchaseOrderEditor poId={editingId} onClose={closeEditor} />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
