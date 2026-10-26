import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PackageOpen, Truck, Building2, Mail, Wrench, Tag } from 'lucide-react';
import { useReturnToVendor, useCreateRtv, useUpdateRtvStatus } from '@/hooks/useReturnToVendor';
import { useReturnPickups, useSchedulePickup, useUpdatePickup } from '@/hooks/useReturnPickups';
import { useReturnItems, useSetItemAction, useAttachReturnLabel, useSendReturnConfirmation } from '@/hooks/useReturnItems';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';

interface Props {
  returnRow: { id: string; rma_number: string; return_label_url: string | null; return_tracking_number: string | null; return_carrier_code: string | null } | null;
  onClose: () => void;
}

const ACTION_LABEL: Record<string, string> = {
  restock: 'Restock', refurbish: 'Refurbish', rtv: 'Return to vendor', scrap: 'Scrap',
};

export function ReturnDetailDrawer({ returnRow, onClose }: Props) {
  if (!returnRow) return null;
  return (
    <Sheet open={!!returnRow} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-2xl w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{returnRow.rma_number}</SheetTitle>
          <SheetDescription>Manage items, label, pickup, and return-to-vendor.</SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="items" className="mt-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="items"><Wrench className="h-3 w-3 mr-1" /> Items</TabsTrigger>
            <TabsTrigger value="label"><Tag className="h-3 w-3 mr-1" /> Label</TabsTrigger>
            <TabsTrigger value="pickup"><Truck className="h-3 w-3 mr-1" /> Pickup</TabsTrigger>
            <TabsTrigger value="rtv"><Building2 className="h-3 w-3 mr-1" /> RTV</TabsTrigger>
          </TabsList>

          <TabsContent value="items" className="mt-4">
            <ItemsTab returnId={returnRow.id} />
          </TabsContent>
          <TabsContent value="label" className="mt-4">
            <LabelTab returnRow={returnRow} />
          </TabsContent>
          <TabsContent value="pickup" className="mt-4">
            <PickupTab rmaId={returnRow.id} />
          </TabsContent>
          <TabsContent value="rtv" className="mt-4">
            <RtvTab rmaId={returnRow.id} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function ItemsTab({ returnId }: { returnId: string }) {
  const { data, isLoading } = useReturnItems(returnId);
  const setAction = useSetItemAction();
  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><PackageOpen className="h-4 w-4" /> Line items & condition-based actions</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
          : (data?.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">No line items yet.</p>
          : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Qty</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Suggested</TableHead>
                  <TableHead>Chosen action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data!.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell>{it.quantity}</TableCell>
                    <TableCell><Badge variant="outline">{it.condition ?? '—'}</Badge></TableCell>
                    <TableCell><Badge variant="secondary">{ACTION_LABEL[it.suggested_action ?? ''] ?? '—'}</Badge></TableCell>
                    <TableCell>
                      <Select
                        value={it.chosen_action ?? it.suggested_action ?? undefined}
                        onValueChange={(v) => setAction.mutate({ return_item_id: it.id, action: v, return_id: returnId })}
                      >
                        <SelectTrigger className="w-40"><SelectValue placeholder="Choose action" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="restock">Restock</SelectItem>
                          <SelectItem value="refurbish">Refurbish</SelectItem>
                          <SelectItem value="rtv">Return to vendor</SelectItem>
                          <SelectItem value="scrap">Scrap</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
      </CardContent>
    </Card>
  );
}

function LabelTab({ returnRow }: { returnRow: Props['returnRow'] }) {
  const [labelUrl, setLabelUrl] = useState(returnRow!.return_label_url ?? '');
  const [tracking, setTracking] = useState(returnRow!.return_tracking_number ?? '');
  const [carrier, setCarrier] = useState(returnRow!.return_carrier_code ?? '');
  const [email, setEmail] = useState('');
  const [instructions, setInstructions] = useState('');
  const attach = useAttachReturnLabel();
  const sendEmail = useSendReturnConfirmation();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Tag className="h-4 w-4" /> Return shipping label</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Label URL</Label>
            <Input value={labelUrl} onChange={(e) => setLabelUrl(e.target.value)} placeholder="https://…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Tracking number</Label>
              <Input value={tracking} onChange={(e) => setTracking(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Carrier code</Label>
              <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="e.g. postnord" />
            </div>
          </div>
          <Button
            onClick={() => attach.mutate({ return_id: returnRow!.id, label_url: labelUrl || undefined, tracking_number: tracking || undefined, carrier_code: carrier || undefined })}
            disabled={attach.isPending}
          >Save label</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Mail className="h-4 w-4" /> Send return confirmation email</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Override recipient (optional)</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@example.com" />
          </div>
          <div className="space-y-2">
            <Label>Custom instructions (optional)</Label>
            <Textarea rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          </div>
          <Button
            onClick={() => sendEmail.mutate({ return_id: returnRow!.id, override_email: email || undefined, custom_instructions: instructions || undefined })}
            disabled={sendEmail.isPending}
          >Send email</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function PickupTab({ rmaId }: { rmaId: string }) {
  const { data, isLoading } = useReturnPickups(rmaId);
  const schedule = useSchedulePickup();
  const update = useUpdatePickup();
  const [pickupDate, setPickupDate] = useState('');
  const [carrier, setCarrier] = useState('');
  const [addr, setAddr] = useState('');
  const [city, setCity] = useState('');
  const [postal, setPostal] = useState('');
  const [country, setCountry] = useState('SE');
  const [notes, setNotes] = useState('');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4" /> Schedule pickup</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Pickup date</Label><Input type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} /></div>
            <div className="space-y-2"><Label>Carrier</Label><Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="postnord / dhl / ups" /></div>
          </div>
          <div className="space-y-2"><Label>Address</Label><Input value={addr} onChange={(e) => setAddr(e.target.value)} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2"><Label>City</Label><Input value={city} onChange={(e) => setCity(e.target.value)} /></div>
            <div className="space-y-2"><Label>Postal</Label><Input value={postal} onChange={(e) => setPostal(e.target.value)} /></div>
            <div className="space-y-2"><Label>Country</Label><Input value={country} onChange={(e) => setCountry(e.target.value)} /></div>
          </div>
          <div className="space-y-2"><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <Button
            disabled={!pickupDate || schedule.isPending}
            onClick={() => schedule.mutate({ rma_id: rmaId, pickup_date: pickupDate, carrier: carrier || undefined, address_line1: addr || undefined, city: city || undefined, postal_code: postal || undefined, country: country || undefined, notes: notes || undefined })}
          >Schedule pickup</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Scheduled pickups</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
            : (data?.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">No pickups yet.</p>
            : (
              <Table>
                <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Date</TableHead><TableHead>Carrier</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {data!.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.pickup_number}</TableCell>
                      <TableCell>{p.pickup_date}</TableCell>
                      <TableCell>{p.carrier ?? '—'}</TableCell>
                      <TableCell><Badge variant="outline">{p.status}</Badge></TableCell>
                      <TableCell>
                        <Select value={p.status} onValueChange={(v) => update.mutate({ pickup_id: p.id, status: v })}>
                          <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="requested">Requested</SelectItem>
                            <SelectItem value="scheduled">Scheduled</SelectItem>
                            <SelectItem value="picked_up">Picked up</SelectItem>
                            <SelectItem value="failed">Failed</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
        </CardContent>
      </Card>
    </div>
  );
}

function RtvTab({ rmaId }: { rmaId: string }) {
  const { formatCurrency } = usePlatformFormat();
  const { data, isLoading } = useReturnToVendor(rmaId);
  const create = useCreateRtv();
  const update = useUpdateRtvStatus();
  const [vendorId, setVendorId] = useState('');
  const [expectedCredit, setExpectedCredit] = useState('0');
  const [notes, setNotes] = useState('');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" /> Create return-to-vendor</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2"><Label>Vendor ID</Label><Input value={vendorId} onChange={(e) => setVendorId(e.target.value)} placeholder="Vendor UUID (optional)" /></div>
          <div className="space-y-2"><Label>Expected vendor credit</Label><Input type="number" min="0" step="0.01" value={expectedCredit} onChange={(e) => setExpectedCredit(e.target.value)} /></div>
          <div className="space-y-2"><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <Button
            disabled={create.isPending}
            onClick={() => create.mutate({ rma_id: rmaId, vendor_id: vendorId || null, expected_credit_cents: Math.round(Number(expectedCredit || '0') * 100), notes: notes || undefined })}
          >Create RTV</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">RTVs on this RMA</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
            : (data?.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">No RTVs created.</p>
            : (
              <Table>
                <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Vendor</TableHead><TableHead>Credit</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data!.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.rtv_number}</TableCell>
                      <TableCell className="text-xs font-mono">{r.vendor_id ? r.vendor_id.slice(0, 8) : '—'}</TableCell>
                      <TableCell>{formatCurrency(r.expected_credit_cents)}</TableCell>
                      <TableCell>
                        <Select value={r.status} onValueChange={(v) => update.mutate({ rtv_id: r.id, status: v })}>
                          <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="sent">Sent</SelectItem>
                            <SelectItem value="credited">Credited</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
