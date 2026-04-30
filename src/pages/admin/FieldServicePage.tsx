import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  useServiceOrders,
  useCreateServiceOrder,
  useUpdateServiceOrderStatus,
  useCompleteServiceOrder,
  type ServiceOrder,
  type ServiceOrderStatus,
} from '@/hooks/useFieldService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Loader2, Plus, Truck, CheckCircle2, Calendar, Clock } from 'lucide-react';
import { format } from 'date-fns';

const STATUS_VARIANT: Record<ServiceOrderStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'outline',
  scheduled: 'secondary',
  in_progress: 'default',
  completed: 'default',
  invoiced: 'secondary',
  cancelled: 'destructive',
};

const PRIORITY_COLOR: Record<string, string> = {
  low: 'text-muted-foreground',
  medium: 'text-foreground',
  high: 'text-orange-500',
  urgent: 'text-red-500',
};

export default function FieldServicePage() {
  const [activeTab, setActiveTab] = useState<'all' | ServiceOrderStatus>('all');
  const [newOpen, setNewOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = activeTab === 'all' ? undefined : (activeTab as ServiceOrderStatus);
  const { data: orders = [], isLoading } = useServiceOrders(filter);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setNewOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const counts = {
    draft: orders.filter((o) => o.status === 'draft').length,
    scheduled: orders.filter((o) => o.status === 'scheduled').length,
    in_progress: orders.filter((o) => o.status === 'in_progress').length,
    completed: orders.filter((o) => o.status === 'completed').length,
  };

  return (
    <AdminLayout>
    <div className="container mx-auto p-6 space-y-6">
      <Helmet>
        <title>Field Service · FlowWink</title>
      </Helmet>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Truck className="h-7 w-7" />
            Field Service
          </h1>
          <p className="text-muted-foreground mt-1">
            Dispatch service orders, schedule visits, and auto-bill on completion.
          </p>
        </div>
        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New service order
            </Button>
          </DialogTrigger>
          <NewServiceOrderDialog onClose={() => setNewOpen(false)} />
        </Dialog>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Draft" value={counts.draft} icon={<Clock className="h-4 w-4" />} />
        <KpiCard label="Scheduled" value={counts.scheduled} icon={<Calendar className="h-4 w-4" />} />
        <KpiCard label="In progress" value={counts.in_progress} icon={<Truck className="h-4 w-4" />} />
        <KpiCard label="Completed" value={counts.completed} icon={<CheckCircle2 className="h-4 w-4" />} />
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="draft">Draft</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
          <TabsTrigger value="in_progress">In progress</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="invoiced">Invoiced</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : orders.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No service orders {filter ? `with status "${filter}"` : 'yet'}.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {orders.map((order) => (
                <ServiceOrderRow key={order.id} order={order} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
    </AdminLayout>
  );
}

function KpiCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
          <div className="text-muted-foreground">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function ServiceOrderRow({ order }: { order: ServiceOrder }) {
  const updateStatus = useUpdateServiceOrderStatus();
  const complete = useCompleteServiceOrder();

  return (
    <Card>
      <CardContent className="py-4 flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-muted-foreground">{order.order_number}</span>
            <span className="font-semibold truncate">{order.title}</span>
            <Badge variant={STATUS_VARIANT[order.status]}>{order.status}</Badge>
            <span className={`text-xs uppercase ${PRIORITY_COLOR[order.priority]}`}>{order.priority}</span>
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            {order.customer_name}
            {order.service_address && ` · ${order.service_address}`}
            {order.scheduled_start && ` · ${format(new Date(order.scheduled_start), 'PP HH:mm')}`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono">
            {order.total_amount.toFixed(2)} {order.currency}
          </span>
          {order.status === 'draft' && (
            <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: order.id, status: 'scheduled' })}>
              Schedule
            </Button>
          )}
          {(order.status === 'scheduled' || order.status === 'in_progress') && (
            <Button size="sm" onClick={() => complete.mutate({ id: order.id })}>
              Complete
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function NewServiceOrderDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateServiceOrder();
  const [form, setForm] = useState({ title: '', customer_name: '', customer_email: '', service_address: '', priority: 'medium', description: '' });

  const submit = async () => {
    if (!form.title || !form.customer_name) return;
    await create.mutateAsync(form);
    onClose();
    setForm({ title: '', customer_name: '', customer_email: '', service_address: '', priority: 'medium', description: '' });
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New service order</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Title *</Label>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Install AC unit at HQ" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Customer name *</Label>
            <Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
          </div>
          <div>
            <Label>Customer email</Label>
            <Input type="email" value={form.customer_email} onChange={(e) => setForm({ ...form, customer_email: e.target.value })} />
          </div>
        </div>
        <div>
          <Label>Service address</Label>
          <Input value={form.service_address} onChange={(e) => setForm({ ...form, service_address: e.target.value })} />
        </div>
        <div>
          <Label>Priority</Label>
          <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Description</Label>
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={create.isPending || !form.title || !form.customer_name}>
          {create.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Create
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
