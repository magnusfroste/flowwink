import { useState } from 'react';
import { Plus, Pencil, Trash2, GripVertical, Clock, DollarSign, Link2 } from 'lucide-react';
import {
  useBookingServices,
  useCreateService,
  useUpdateService,
  useDeleteService,
  type BookingService, type IntakeField } from '@/hooks/useBookings';
import { useProducts } from '@/hooks/useProducts';
import { fieldKey } from '@/lib/slugify';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';

export default function BookingServicesTab() {
  const { data: services, isLoading } = useBookingServices();
  const { data: products } = useProducts();
  const { formatCurrency, settings } = usePlatformFormat();
  const createService = useCreateService();
  const updateService = useUpdateService();
  const deleteService = useDeleteService();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<BookingService | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    duration_minutes: 60,
    buffer_before_minutes: 0,
    buffer_after_minutes: 0,
    capacity: 1,
    price_cents: 0,
    currency: 'SEK',
    color: '#3b82f6',
    is_active: true,
    product_id: '' as string,
    location_type: 'in_person' as 'in_person' | 'video' | 'phone',
    video_provider: 'webmeet' as 'webmeet' | 'url',
    video_url: '',
    intake_fields: [] as IntakeField[],
  });

  const openCreateDialog = () => {
    setEditingService(null);
    setFormData({
      name: '',
      description: '',
      duration_minutes: 60,
      buffer_before_minutes: 0,
      buffer_after_minutes: 0,
      capacity: 1,
      price_cents: 0,
      currency: settings.default_currency,
      color: '#3b82f6',
      is_active: true,
      product_id: '',
      location_type: 'in_person',
      video_provider: 'webmeet',
      video_url: '',
      intake_fields: [],
    });
    setDialogOpen(true);
  };

  const openEditDialog = (service: BookingService) => {
    setEditingService(service);
    setFormData({
      name: service.name,
      description: service.description || '',
      duration_minutes: service.duration_minutes,
      buffer_before_minutes: service.buffer_before_minutes ?? 0,
      buffer_after_minutes: service.buffer_after_minutes ?? 0,
      capacity: service.capacity ?? 1,
      price_cents: service.price_cents,
      currency: service.currency,
      color: service.color || '#3b82f6',
      is_active: service.is_active,
      product_id: service.product_id || '',
      location_type: service.location_type ?? 'in_person',
      video_provider: service.video_provider ?? 'webmeet',
      video_url: service.video_url ?? '',
      intake_fields: service.intake_fields ?? [],
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...formData, product_id: formData.product_id || null, video_url: formData.video_url.trim() || null };
    if (editingService) {
      await updateService.mutateAsync({ id: editingService.id, ...payload });
    } else {
      await createService.mutateAsync(payload);
    }
    setDialogOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this service?')) {
      await deleteService.mutateAsync(id);
    }
  };

  const formatPrice = (cents: number, currency: string) =>
    formatCurrency(cents, currency, { minimumFractionDigits: 0 });

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          New Service
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : services?.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">No services created yet</p>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Create your first service
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {services?.map((service) => (
            <Card key={service.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="cursor-grab text-muted-foreground">
                    <GripVertical className="h-5 w-5" />
                  </div>
                  <div
                    className="w-4 h-4 rounded-full shrink-0"
                    style={{ backgroundColor: service.color || '#3b82f6' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{service.name}</h3>
                      {!service.is_active && <Badge variant="secondary">Inactive</Badge>}
                      {service.product_id && (
                        <Badge variant="outline" className="gap-1">
                          <Link2 className="h-3 w-3" />
                          Product
                        </Badge>
                      )}
                    </div>
                    {service.description && (
                      <p className="text-sm text-muted-foreground truncate">{service.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {service.duration_minutes} min
                    </span>
                    {service.price_cents > 0 && (
                      <span className="flex items-center gap-1">
                        <DollarSign className="h-4 w-4" />
                        {formatPrice(service.price_cents, service.currency)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(service)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(service.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingService ? 'Edit Service' : 'New Service'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="duration">Duration (minutes) *</Label>
                <Input id="duration" type="number" min={15} step={15} value={formData.duration_minutes} onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) || 60 })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="price">Price</Label>
                <MoneyInput id="price" value={formData.price_cents} onChange={(c) => setFormData({ ...formData, price_cents: c })} currency={formData.currency} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="buffer-before">Buffer before (min)</Label>
                <Input id="buffer-before" type="number" min={0} step={5} value={formData.buffer_before_minutes} onChange={(e) => setFormData({ ...formData, buffer_before_minutes: Math.max(0, parseInt(e.target.value) || 0) })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="buffer-after">Buffer after (min)</Label>
                <Input id="buffer-after" type="number" min={0} step={5} value={formData.buffer_after_minutes} onChange={(e) => setFormData({ ...formData, buffer_after_minutes: Math.max(0, parseInt(e.target.value) || 0) })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="capacity">Places per time</Label>
                <Input id="capacity" type="number" min={1} value={formData.capacity} onChange={(e) => setFormData({ ...formData, capacity: Math.max(1, parseInt(e.target.value) || 1) })} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Buffers keep time free around each booking (set-up, cleaning, travel) — they are never offered to the next customer. Places per time is 1 for an appointment and more for a class or a viewing.
            </p>
            <div className="space-y-3 rounded-md border p-3" data-service-meeting>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="location-type">Where</Label>
                    <Select value={formData.location_type} onValueChange={(v) => setFormData({ ...formData, location_type: v as 'in_person' | 'video' | 'phone' })}>
                      <SelectTrigger id="location-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="in_person">In person</SelectItem>
                        <SelectItem value="video">Video meeting</SelectItem>
                        <SelectItem value="phone">Phone</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {formData.location_type === 'video' && (
                    <div className="space-y-2">
                      <Label htmlFor="video-provider">Meeting link</Label>
                      <Select value={formData.video_provider} onValueChange={(v) => setFormData({ ...formData, video_provider: v as 'webmeet' | 'url' })}>
                        <SelectTrigger id="video-provider"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="webmeet">Own WebMeet room per booking</SelectItem>
                          <SelectItem value="url">Fixed link (Zoom / Teams room)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                {formData.location_type === 'video' && formData.video_provider === 'url' && (
                  <div className="space-y-2">
                    <Label htmlFor="video-url">Fixed meeting link</Label>
                    <Input id="video-url" type="url" placeholder="https://teams.microsoft.com/…" value={formData.video_url} onChange={(e) => setFormData({ ...formData, video_url: e.target.value })} />
                  </div>
                )}
                {formData.location_type === 'video' && (
                  <p className="text-xs text-muted-foreground">Every booking gets its meeting link when the time is booked; it is in the confirmation and the reminder, and a cancelled booking closes its room.</p>
                )}
              </div>

              <div className="space-y-2 rounded-md border p-3" data-service-intake>
                <div className="flex items-center justify-between">
                  <Label>Questions before booking</Label>
                  <Button type="button" variant="outline" size="sm"
                    onClick={() => setFormData({ ...formData, intake_fields: [...formData.intake_fields, { id: `q${formData.intake_fields.length + 1}`, label: '', type: 'text', required: false }] })}>
                    Add question
                  </Button>
                </div>
                {formData.intake_fields.length === 0 && <p className="text-xs text-muted-foreground">None — the visitor is asked only for name, e-mail, phone and notes.</p>}
                {formData.intake_fields.map((f, i) => {
                  const set = (patch: Partial<IntakeField>) => setFormData({ ...formData, intake_fields: formData.intake_fields.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                  return (
                    <div key={i} className="grid grid-cols-[1fr_8rem_auto_auto] gap-2 items-center">
                      <Input placeholder="Question" value={f.label} aria-label="Question"
                        onChange={(e) => set({ label: e.target.value, id: f.id.startsWith('q') ? (fieldKey(e.target.value).slice(0, 40) || f.id) : f.id })} />
                      <Select value={f.type ?? 'text'} onValueChange={(v) => set({ type: v as IntakeField['type'] })}>
                        <SelectTrigger aria-label="Type"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Short text</SelectItem>
                          <SelectItem value="textarea">Long text</SelectItem>
                          <SelectItem value="select">Choice</SelectItem>
                          <SelectItem value="checkbox">Yes / no</SelectItem>
                          <SelectItem value="email">E-mail</SelectItem>
                          <SelectItem value="phone">Phone</SelectItem>
                          <SelectItem value="number">Number</SelectItem>
                        </SelectContent>
                      </Select>
                      <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!!f.required} onChange={(e) => set({ required: e.target.checked })} /> required</label>
                      <Button type="button" variant="ghost" size="sm" aria-label="Remove question"
                        onClick={() => setFormData({ ...formData, intake_fields: formData.intake_fields.filter((_, j) => j !== i) })}>×</Button>
                      {f.type === 'select' && (
                        <Input className="col-span-4" placeholder="Choices, comma-separated" aria-label="Choices"
                          value={(f.options ?? []).join(', ')} onChange={(e) => set({ options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })} />
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2">
              <Label htmlFor="color">Color</Label>
              <div className="flex items-center gap-2">
                <input type="color" id="color" value={formData.color} onChange={(e) => setFormData({ ...formData, color: e.target.value })} className="w-10 h-10 rounded border cursor-pointer" />
                <Input value={formData.color} onChange={(e) => setFormData({ ...formData, color: e.target.value })} className="flex-1" />
              </div>
            </div>
            {products && products.length > 0 && (
              <div className="space-y-2">
                <Label>Linked Product (for online payment)</Label>
                <Select
                  value={formData.product_id || 'none'}
                  onValueChange={(v) => setFormData({ ...formData, product_id: v === 'none' ? '' : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No product linked" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No product (pay on site)</SelectItem>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Link to a product to enable Stripe payment at booking time.</p>
              </div>
            )}
            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">Active</Label>
              <Switch id="is_active" checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createService.isPending || updateService.isPending}>
                {editingService ? 'Save' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
