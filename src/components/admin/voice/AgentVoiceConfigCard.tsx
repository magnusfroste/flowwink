import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { UserCircle, Loader2, ChevronDown, ChevronRight, Info } from 'lucide-react';

import {
  useMyAgentVoice,
  useUpdateMyAgentVoice,
  type SupportAgentVoice,
} from '@/hooks/useVoice';

type Draft = Partial<SupportAgentVoice>;

export function AgentVoiceConfigCard() {
  const { data: agent, isLoading } = useMyAgentVoice();
  const update = useUpdateMyAgentVoice();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

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

  // Auto-expand advanced if SIP credentials already configured
  useEffect(() => {
    if (merged.voice_sip_uri || merged.voice_sip_username) setShowAdvanced(true);
  }, [merged.voice_sip_uri, merged.voice_sip_username]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft({ ...(draft ?? {}), [k]: v });

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
          <UserCircle className="h-5 w-5" />My voice routing
        </CardTitle>
        <CardDescription>
          Where should inbound calls reach you? Use mobile fallback for the standard
          46elks-webhook flow — no SIP user required.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label className="text-sm font-medium">Receive voice calls</Label>
            <p className="text-xs text-muted-foreground">
              When off, calls go straight to voicemail/IVR. You can stay logged in
              for chat/SMS/email regardless.
            </p>
          </div>
          <Switch
            checked={!!merged.voice_enabled}
            onCheckedChange={(v) => set('voice_enabled', v)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="mobile">Mobile number (E.164)</Label>
          <Input
            id="mobile"
            placeholder="+46701234567"
            value={merged.voice_mobile_number ?? ''}
            onChange={(e) => set('voice_mobile_number', e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            46elks rings this number on inbound calls. Every call is still logged
            in FlowWink with recording/transcript when available.
          </p>
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            All calls — answered on mobile, missed, or sent to voicemail — land in
            the unified Voice inbox so the team has one source of truth.
          </AlertDescription>
        </Alert>

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          {showAdvanced ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Advanced — browser softphone (requires SIP user)
        </button>

        {showAdvanced && (
          <div className="rounded-md border border-dashed p-3 space-y-3">
            <p className="text-xs text-muted-foreground">
              Only needed if you want calls to ring inside the browser via WebRTC.
              Most setups skip this and use the mobile fallback above. Create a SIP
              user in your 46elks dashboard first.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="sip-uri" className="text-xs">SIP URI</Label>
                <Input
                  id="sip-uri"
                  placeholder="sip:user@sip.46elks.com"
                  value={merged.voice_sip_uri ?? ''}
                  onChange={(e) => set('voice_sip_uri', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sip-user" className="text-xs">SIP username</Label>
                <Input
                  id="sip-user"
                  value={merged.voice_sip_username ?? ''}
                  onChange={(e) => set('voice_sip_username', e.target.value)}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="sip-pass" className="text-xs">SIP password</Label>
                <Input
                  id="sip-pass"
                  type="password"
                  value={merged.voice_sip_password ?? ''}
                  onChange={(e) => set('voice_sip_password', e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

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
