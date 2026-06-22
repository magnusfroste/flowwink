import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserCircle, Loader2 } from 'lucide-react';

import { listVoiceProviders } from '@/lib/voice-providers';
import {
  useMyAgentVoice,
  useUpdateMyAgentVoice,
  voiceProviderLabel,
  type SupportAgentVoice,
} from '@/hooks/useVoice';

type Draft = Partial<SupportAgentVoice>;

export function AgentVoiceConfigCard() {
  const { data: agent, isLoading } = useMyAgentVoice();
  const update = useUpdateMyAgentVoice();
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    setDraft(null);
  }, [agent?.id]);

  const merged: Draft = {
    voice_enabled: false,
    voice_sip_username: '',
    voice_sip_password: '',
    voice_sip_uri: '',
    voice_mobile_number: '',
    voice_provider: null,
    ...(agent ?? {}),
    ...(draft ?? {}),
  };

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft({ ...(draft ?? {}), [k]: v });

  const providers = listVoiceProviders();
  const dirty = draft !== null;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 inline animate-spin mr-2" />Loading…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCircle className="h-5 w-5" />My voice configuration
        </CardTitle>
        <CardDescription>
          Enable WebRTC voice calls for your account. SIP credentials come from your provider (e.g. 46elks SIP user).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label className="text-sm font-medium">Receive voice calls</Label>
            <p className="text-xs text-muted-foreground">When enabled, inbound calls ring in your browser softphone.</p>
          </div>
          <Switch
            checked={!!merged.voice_enabled}
            onCheckedChange={(v) => set('voice_enabled', v)}
          />
        </div>

        <div className="space-y-2">
          <Label>Provider</Label>
          <Select
            value={merged.voice_provider ?? 'none'}
            onValueChange={(v) => set('voice_provider', v === 'none' ? null : v)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Use site default</SelectItem>
              {providers.map((p) => (
                <SelectItem key={p.metadata.id} value={p.metadata.id}>
                  {voiceProviderLabel(p.metadata.id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="sip-uri">SIP URI</Label>
            <Input
              id="sip-uri"
              placeholder="sip:user@sip.46elks.com"
              value={merged.voice_sip_uri ?? ''}
              onChange={(e) => set('voice_sip_uri', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sip-user">SIP username</Label>
            <Input
              id="sip-user"
              value={merged.voice_sip_username ?? ''}
              onChange={(e) => set('voice_sip_username', e.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="sip-pass">SIP password</Label>
            <Input
              id="sip-pass"
              type="password"
              value={merged.voice_sip_password ?? ''}
              onChange={(e) => set('voice_sip_password', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Stored in support_agents; consider rotating regularly.</p>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="mobile">Mobile fallback number</Label>
            <Input
              id="mobile"
              placeholder="+46701234567"
              value={merged.voice_mobile_number ?? ''}
              onChange={(e) => set('voice_mobile_number', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">If WebRTC isn't available, the provider forwards to this number.</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t pt-4">
          {dirty && <Button variant="ghost" onClick={() => setDraft(null)} disabled={update.isPending}>Reset</Button>}
          <Button
            disabled={!dirty || update.isPending}
            onClick={() => draft && update.mutate(draft, { onSuccess: () => setDraft(null) })}
          >
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
