import { useState } from 'react';
import { useCustomerAddresses, useUpsertAddress, useDeleteAddress, type CustomerAddress } from '@/hooks/useCustomerData';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, MapPin } from 'lucide-react';

function AddressForm({ address, onClose }: { address?: CustomerAddress; onClose: () => void }) {
  const upsert = useUpsertAddress();
  const [form, setForm] = useState({
    label: address?.label || 'Home',
    full_name: address?.full_name || '',
    address_line1: address?.address_line1 || '',
    address_line2: address?.address_line2 || '',
    city: address?.city || '',
    postal_code: address?.postal_code || '',
    country: address?.country || 'SE',
    phone: address?.phone || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await upsert.mutateAsync({ ...form, id: address?.id });
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Label</Label>
          <Input value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} placeholder="Home" required />
        </div>
        <div className="space-y-2">
          <Label>Full Name</Label>
          <Input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} required />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Address Line 1</Label>
        <Input value={form.address_line1} onChange={e => setForm(p => ({ ...p, address_line1: e.target.value }))} required />
      </div>
      <div className="space-y-2">
        <Label>Address Line 2</Label>
        <Input value={form.address_line2} onChange={e => setForm(p => ({ ...p, address_line2: e.target.value }))} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>City</Label>
          <Input value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} required />
        </div>
        <div className="space-y-2">
          <Label>Postal Code</Label>
          <Input value={form.postal_code} onChange={e => setForm(p => ({ ...p, postal_code: e.target.value }))} required />
        </div>
        <div className="space-y-2">
          <Label>Country</Label>
          <Input value={form.country} onChange={e => setForm(p => ({ ...p, country: e.target.value }))} required />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Phone</Label>
        <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={upsert.isPending}>
          {address ? 'Update' : 'Add'} Address
        </Button>
      </div>
    </form>
  );
}

export default function AddressesPage() {
  const { data: addresses = [], isLoading } = useCustomerAddresses();
  const deleteAddress = useDeleteAddress();
  const [editingAddress, setEditingAddress] = useState<CustomerAddress | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);

  const openNew = () => { setEditingAddress(undefined); setDialogOpen(true); };
  const openEdit = (a: CustomerAddress) => { setEditingAddress(a); setDialogOpen(true); };
  const closeDialog = () => setDialogOpen(false);

  if (isLoading) {
    return <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Saved Addresses</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openNew}>
              <Plus className="h-4 w-4 mr-2" />
              Add Address
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingAddress ? 'Edit Address' : 'New Address'}</DialogTitle>
            </DialogHeader>
            <AddressForm address={editingAddress} onClose={closeDialog} />
          </DialogContent>
        </Dialog>
      </div>

      {addresses.length === 0 ? (
        <div className="text-center py-16 space-y-4">
          <MapPin className="h-16 w-16 mx-auto text-muted-foreground/30" />
          <h3 className="text-lg font-medium">No saved addresses</h3>
          <p className="text-muted-foreground">Add an address to speed up checkout.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {addresses.map((addr) => (
            <Card key={addr.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{addr.label}</span>
                      {addr.is_default && <Badge variant="secondary" className="text-xs">Default</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">{addr.full_name}</p>
                    <p className="text-sm text-muted-foreground">{addr.address_line1}</p>
                    {addr.address_line2 && <p className="text-sm text-muted-foreground">{addr.address_line2}</p>}
                    <p className="text-sm text-muted-foreground">{addr.postal_code} {addr.city}, {addr.country}</p>
                    {addr.phone && <p className="text-sm text-muted-foreground mt-1">{addr.phone}</p>}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(addr)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteAddress.mutate(addr.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
