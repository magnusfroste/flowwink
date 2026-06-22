import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { format } from 'date-fns';
import { Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Voicemail, PhoneCall, Settings as SettingsIcon, Headphones } from 'lucide-react';

import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { listVoiceProviders } from '@/lib/voice-providers';
import type { VoiceProviderId, VoiceSettings } from '@/lib/voice-providers/types';
import {
  useVoiceSettings,
  useUpdateVoiceSettings,
  useVoiceCalls,
  useUpdateVoiceCall,
  defaultVoiceSettings,
  voiceProviderLabel,
  type VoiceCallRow,
  type VoiceCallStatus,
} from '@/hooks/useVoice';

const STATUS_VARIANT: Record<VoiceCallStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  ringing: 'outline',
  answered: 'default',
  missed: 'destructive',
  voicemail: 'secondary',
  completed: 'default',
  failed: 'destructive',
  busy: 'destructive',
  no_answer: 'destructive',
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return '–';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function DirectionIcon({ direction }: { direction: VoiceCallRow['direction'] }) {
  return direction === 'inbound'
    ? <PhoneIncoming className="h-4 w-4 text-muted-foreground" />
    : <PhoneOutgoing className="h-4 w-4 text-muted-foreground" />;
}

function CallRow({ call, onAction }: { call: VoiceCallRow; onAction: (c: VoiceCallRow) => void }) {
  return (
    <TableRow>
      <TableCell><DirectionIcon direction={call.direction} /></TableCell>
      <TableCell className="font-mono text-sm">{call.from_number}</TableCell>
      <TableCell className="font-mono text-sm text-muted-foreground">{call.to_number}</TableCell>
      <TableCell>
        <Badge variant={STATUS_VARIANT[call.status]} className="capitalize">{call.status.replace('_', ' ')}</Badge>
      </TableCell>
      <TableCell className="text-sm">{formatDuration(call.duration_seconds)}</TableCell>
      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
        {format(new Date(call.started_at), 'yyyy-MM-dd HH:mm')}
      </TableCell>
      <TableCell>
        {call.recording_url ? (
          <a href={call.recording_url} target="_blank" rel="noreferrer" className="text-xs underline">
            <Voicemail className="inline h-3 w-3 mr-1" />Recording
          </a>
        ) : <span className="text-xs text-muted-foreground">–</span>}
      </TableCell>
      <TableCell>
        {call.callback_status !== 'none' && (
          <Badge variant="outline" className="capitalize">{call.callback_status}</Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <Button size="sm" variant="outline" onClick={() => onAction(call)}>
          <PhoneCall className="h-3 w-3 mr-1" />Manage
        </Button>
      </TableCell>
    </TableRow>
  );
}

function CallActionDialog({ call, open, onOpenChange }: { call: VoiceCallRow | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const update = useUpdateVoiceCall();
  const [scheduledAt, setScheduledAt] = useState<string>('');

  if (!call) return null;

  const handleSchedule = () => {
    update.mutate(
      { id: call.id, patch: { callback_status: 'scheduled', callback_scheduled_at: scheduledAt || new Date().toISOString() } },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  const handleMarkDone = () => {
    update.mutate(
      { id: call.id, patch: { callback_status: 'completed', callback_completed_at: new Date().toISOString() } },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Call from {call.from_number}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span>{call.status}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Started</span><span>{format(new Date(call.started_at), 'yyyy-MM-dd HH:mm')}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span>{formatDuration(call.duration_seconds)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Provider</span><span className="capitalize">{call.provider}</span></div>
          {call.transcript && (
            <div className="rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">{call.transcript}</div>
          )}
          {call.recording_url && (
            <audio src={call.recording_url} controls className="w-full" />
          )}
          <div className="border-t pt-3 space-y-2">
            <Label htmlFor="schedule">Schedule callback (ISO)</Label>
            <Input id="schedule" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value ? new Date(e.target.value).toISOString() : '')} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          {call.callback_status === 'scheduled' || call.callback_status === 'pending' ? (
            <Button onClick={handleMarkDone} disabled={update.isPending}>Mark callback done</Button>
          ) : null}
          <Button onClick={handleSchedule} disabled={update.isPending}>
            {scheduledAt ? 'Schedule callback' : 'Mark pending'}
          </Button>
          <a href={`tel:${call.from_number}`} className="inline-flex">
            <Button variant="default"><PhoneCall className="h-4 w-4 mr-1" />Call back</Button>
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CallsTable({ calls, onAction }: { calls: VoiceCallRow[]; onAction: (c: VoiceCallRow) => void }) {
  if (calls.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No calls yet.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8"></TableHead>
            <TableHead>From</TableHead>
            <TableHead>To</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Voicemail</TableHead>
            <TableHead>Callback</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {calls.map((c) => <CallRow key={c.id} call={c} onAction={onAction} />)}
        </TableBody>
      </Table>
    </Card>
  );
}

function VoiceSettingsCard() {
  const { data, isLoading } = useVoiceSettings();
  const update = useUpdateVoiceSettings();
  const [draft, setDraft] = useState<VoiceSettings | null>(null);

  const settings = draft ?? data ?? defaultVoiceSettings;
  const providers = listVoiceProviders();
  const dirty = draft !== null;

  const set = <K extends keyof VoiceSettings>(k: K, v: VoiceSettings[K]) =>
    setDraft({ ...(draft ?? data ?? defaultVoiceSettings), [k]: v });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><SettingsIcon className="h-5 w-5" />Voice settings</CardTitle>
        <CardDescription>Provider, voicemail greeting and routing behaviour.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Provider</Label>
          <Select
            value={settings.provider ?? 'none'}
            onValueChange={(v) => set('provider', v === 'none' ? null : (v as VoiceProviderId))}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None — module inactive</SelectItem>
              {providers.map((p) => (
                <SelectItem key={p.metadata.id} value={p.metadata.id}>
                  {voiceProviderLabel(p.metadata.id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {settings.provider && (
            <p className="text-xs text-muted-foreground">
              Regions: {providers.find((p) => p.metadata.id === settings.provider)?.metadata.regions.join(', ')} ·{' '}
              WebRTC: {providers.find((p) => p.metadata.id === settings.provider)?.metadata.capabilities.webrtc ? 'yes' : 'no'}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ring">Ring timeout (seconds)</Label>
            <Input
              id="ring"
              type="number"
              min={5}
              max={120}
              value={settings.ringTimeoutSeconds}
              onChange={(e) => set('ringTimeoutSeconds', Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">Seconds to ring agents before falling back to voicemail.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="welcome">Welcome greeting URL</Label>
            <Input
              id="welcome"
              placeholder="https://…/welcome.mp3"
              value={settings.welcomeGreetingUrl ?? ''}
              onChange={(e) => set('welcomeGreetingUrl', e.target.value || undefined)}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="vm">Voicemail greeting URL</Label>
            <Input
              id="vm"
              placeholder="https://…/voicemail.mp3"
              value={settings.voicemailGreetingUrl ?? ''}
              onChange={(e) => set('voicemailGreetingUrl', e.target.value || undefined)}
            />
            <p className="text-xs text-muted-foreground">
              Played when no agent picks up. Leave empty to use the provider's default greeting.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label className="text-sm font-medium">Booking IVR (UC4)</Label>
            <p className="text-xs text-muted-foreground">When all agents are offline, offer the caller a callback slot from a booking service.</p>
          </div>
          <Switch
            checked={settings.bookingIvrEnabled}
            onCheckedChange={(v) => set('bookingIvrEnabled', v)}
          />
        </div>

        {settings.bookingIvrEnabled && (
          <div className="space-y-2">
            <Label htmlFor="svc">Booking service ID</Label>
            <Input
              id="svc"
              placeholder="uuid of booking_services row"
              value={settings.bookingServiceId ?? ''}
              onChange={(e) => set('bookingServiceId', e.target.value || undefined)}
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t pt-4">
          {dirty && (
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={update.isPending}>
              Reset
            </Button>
          )}
          <Button
            onClick={() => draft && update.mutate(draft, { onSuccess: () => setDraft(null) })}
            disabled={!dirty || update.isPending || isLoading}
          >
            Save settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ProviderCapabilitiesCard() {
  const providers = listVoiceProviders();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Headphones className="h-5 w-5" />Available providers</CardTitle>
        <CardDescription>Adapter contract is identical across providers — UI, voicemail and callback flow work the same.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Regions</TableHead>
              <TableHead>WebRTC</TableHead>
              <TableHead>Recording</TableHead>
              <TableHead>Realtime</TableHead>
              <TableHead>Required secrets</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {providers.map((p) => (
              <TableRow key={p.metadata.id}>
                <TableCell className="font-medium">{p.metadata.name}</TableCell>
                <TableCell className="text-xs">{p.metadata.regions.join(', ')}</TableCell>
                <TableCell>{p.metadata.capabilities.webrtc ? '✓' : '–'}</TableCell>
                <TableCell>{p.metadata.capabilities.recording ? '✓' : '–'}</TableCell>
                <TableCell>{p.metadata.capabilities.realtimeStream ? '✓' : '–'}</TableCell>
                <TableCell className="text-xs font-mono">{p.metadata.requiredSecrets.join(', ') || '–'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function VoicePage() {
  const [tab, setTab] = useState<'all' | 'missed' | 'voicemail' | 'callbacks' | 'settings'>('all');
  const [selected, setSelected] = useState<VoiceCallRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: allCalls = [], isLoading } = useVoiceCalls({ limit: 200 });

  const counts = useMemo(() => ({
    all: allCalls.length,
    missed: allCalls.filter((c) => c.status === 'missed' || c.status === 'no_answer' || c.status === 'busy').length,
    voicemail: allCalls.filter((c) => c.voicemail || c.status === 'voicemail').length,
    callbacks: allCalls.filter((c) => c.callback_status === 'pending' || c.callback_status === 'scheduled').length,
  }), [allCalls]);

  const filtered = useMemo(() => {
    switch (tab) {
      case 'missed': return allCalls.filter((c) => ['missed', 'no_answer', 'busy'].includes(c.status));
      case 'voicemail': return allCalls.filter((c) => c.voicemail || c.status === 'voicemail');
      case 'callbacks': return allCalls.filter((c) => c.callback_status === 'pending' || c.callback_status === 'scheduled');
      default: return allCalls;
    }
  }, [allCalls, tab]);

  const onAction = (c: VoiceCallRow) => { setSelected(c); setDialogOpen(true); };

  return (
    <AdminLayout>
      <Helmet><title>Voice · Admin</title></Helmet>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2"><Phone className="h-6 w-6" />Voice</h1>
            <p className="text-sm text-muted-foreground">
              Inbound and outbound calls. Provider-agnostic — same UI regardless of 46elks / Twilio / etc.
            </p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="all">All <Badge variant="secondary" className="ml-2">{counts.all}</Badge></TabsTrigger>
            <TabsTrigger value="missed"><PhoneMissed className="h-3 w-3 mr-1" />Missed <Badge variant="secondary" className="ml-2">{counts.missed}</Badge></TabsTrigger>
            <TabsTrigger value="voicemail"><Voicemail className="h-3 w-3 mr-1" />Voicemail <Badge variant="secondary" className="ml-2">{counts.voicemail}</Badge></TabsTrigger>
            <TabsTrigger value="callbacks"><PhoneCall className="h-3 w-3 mr-1" />Callbacks <Badge variant="secondary" className="ml-2">{counts.callbacks}</Badge></TabsTrigger>
            <TabsTrigger value="settings"><SettingsIcon className="h-3 w-3 mr-1" />Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-4">
            {isLoading ? <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Loading…</CardContent></Card> : <CallsTable calls={filtered} onAction={onAction} />}
          </TabsContent>
          <TabsContent value="missed" className="mt-4"><CallsTable calls={filtered} onAction={onAction} /></TabsContent>
          <TabsContent value="voicemail" className="mt-4"><CallsTable calls={filtered} onAction={onAction} /></TabsContent>
          <TabsContent value="callbacks" className="mt-4"><CallsTable calls={filtered} onAction={onAction} /></TabsContent>

          <TabsContent value="settings" className="mt-4 space-y-6">
            <VoiceSettingsCard />
            <ProviderCapabilitiesCard />
          </TabsContent>
        </Tabs>

        <CallActionDialog call={selected} open={dialogOpen} onOpenChange={setDialogOpen} />
      </div>
    </AdminLayout>
  );
}
