import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useManufacturingOrders,
  useBoms,
  useConfirmMo,
  useStartMo,
  useCompleteMo,
  useCancelMo,
  useCheckAvailability,
  useTriggerProcurement,
  type MoStatus,
} from '@/hooks/useManufacturing';

const STATUS_VARIANT: Record<MoStatus, 'secondary' | 'outline' | 'default'> = {
  draft: 'outline',
  planned: 'outline',
  confirmed: 'secondary',
  in_progress: 'default',
  done: 'secondary',
  cancelled: 'outline',
};

function MoActions({ mo }: { mo: Record<string, unknown> }) {
  const id = String(mo.id);
  const status = mo.status as MoStatus;
  const confirm = useConfirmMo();
  const start = useStartMo();
  const complete = useCompleteMo();
  const cancel = useCancelMo();
  const check = useCheckAvailability();
  const procure = useTriggerProcurement();

  return (
    <div className="flex flex-wrap gap-2">
      {status === 'draft' && (
        <Button size="sm" onClick={() => confirm.mutate({ p_mo_id: id })}>Confirm</Button>
      )}
      {status === 'confirmed' && (
        <>
          <Button size="sm" onClick={() => start.mutate({ p_mo_id: id })}>Start</Button>
          <Button size="sm" variant="outline" onClick={() => check.mutate({ p_mo_id: id })}>Re-check</Button>
          <Button size="sm" variant="outline" onClick={() => procure.mutate({ p_mo_id: id })}>Procure</Button>
        </>
      )}
      {status === 'in_progress' && (
        <Button size="sm" onClick={() => complete.mutate({ p_mo_id: id })}>Complete</Button>
      )}
      {!['done', 'cancelled'].includes(status) && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => cancel.mutate({ p_mo_id: id, p_reason: 'cancelled by user' })}
        >
          Cancel
        </Button>
      )}
    </div>
  );
}

function MoList() {
  const { data, isLoading } = useManufacturingOrders();
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No manufacturing orders yet. Create one via the <code>create_manufacturing_order</code> skill.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {data.map((mo) => (
        <Card key={String(mo.id)}>
          <CardContent className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-medium">{String(mo.mo_number)}</span>
                <Badge variant={STATUS_VARIANT[mo.status as MoStatus] ?? 'outline'}>
                  {String(mo.status)}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                Qty {String(mo.quantity)} · due {mo.due_date ? String(mo.due_date) : '—'} · source {String(mo.source_type)}
              </div>
            </div>
            <MoActions mo={mo} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function BomList() {
  const { data, isLoading } = useBoms();
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No Bills of Materials yet. Create one via the <code>manage_bom</code> skill (action: create).
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {data.map((bom) => (
        <Card key={String(bom.id)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {String(bom.version)} {bom.is_active ? <Badge className="ml-2">active</Badge> : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Produces {String(bom.quantity_produced)} unit(s) per run.
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function ManufacturingPage() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <AdminPageHeader
          title="Manufacturing"
          description="MRP-light: Bills of Materials, Manufacturing Orders, and the procurement loop."
        />
        <Tabs defaultValue="orders">
          <TabsList>
            <TabsTrigger value="orders">Manufacturing Orders</TabsTrigger>
            <TabsTrigger value="boms">Bills of Materials</TabsTrigger>
          </TabsList>
          <TabsContent value="orders" className="mt-4"><MoList /></TabsContent>
          <TabsContent value="boms" className="mt-4"><BomList /></TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
