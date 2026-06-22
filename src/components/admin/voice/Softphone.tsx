/**
 * Softphone — minimal WebRTC SIP client built on JsSIP.
 *
 * Reads the current user's `support_agents.voice_*` row and registers against
 * the chosen provider's WSS endpoint. Renders connection status, incoming
 * call ringer, answer/hangup controls.
 *
 * Provider-agnostic: relies only on `voice_sip_uri` + username/password from
 * the agent record. The voice provider adapter chooses what URI to issue.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import * as JsSIP from 'jssip';
import type { RTCSession } from 'jssip/lib/RTCSession';
import { Phone, PhoneOff, PhoneIncoming, Loader2, MicOff, Mic } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useMyAgentVoice } from '@/hooks/useVoice';
import { logger } from '@/lib/logger';

type CallState = 'idle' | 'ringing' | 'in-call' | 'ended';
type SipState = 'disabled' | 'connecting' | 'registered' | 'failed' | 'disconnected';

interface Props {
  /** Optional override of WSS endpoint (else derived from voice_sip_uri). */
  wssUrl?: string;
}

function deriveWss(sipUri: string | null | undefined, override?: string): string | null {
  if (override) return override;
  if (!sipUri) return null;
  // 46elks: SIP-URI is sip:user@sip.46elks.com -> WSS sip.46elks.com:443
  try {
    const host = sipUri.replace(/^sips?:/, '').split('@')[1]?.split(';')[0];
    if (!host) return null;
    return `wss://${host}/ws`;
  } catch {
    return null;
  }
}

export default function Softphone({ wssUrl }: Props) {
  const { data: agent, isLoading } = useMyAgentVoice();
  const uaRef = useRef<JsSIP.UA | null>(null);
  const sessionRef = useRef<RTCSession | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [sipState, setSipState] = useState<SipState>('disabled');
  const [callState, setCallState] = useState<CallState>('idle');
  const [remoteParty, setRemoteParty] = useState<string>('');
  const [muted, setMuted] = useState(false);

  const ready = useMemo(() => {
    if (!agent?.voice_enabled) return false;
    if (!agent.voice_sip_uri || !agent.voice_sip_username || !agent.voice_sip_password) return false;
    return true;
  }, [agent]);

  // Initialise / tear down UA
  useEffect(() => {
    if (!agent || isLoading) return;
    if (!ready) {
      setSipState('disabled');
      return;
    }

    const ws = deriveWss(agent.voice_sip_uri, wssUrl);
    if (!ws) {
      setSipState('failed');
      logger.error('softphone: cannot derive WSS URL from', agent.voice_sip_uri);
      return;
    }

    setSipState('connecting');
    const socket = new JsSIP.WebSocketInterface(ws);
    const ua = new JsSIP.UA({
      sockets: [socket],
      uri: agent.voice_sip_uri!,
      password: agent.voice_sip_password!,
      authorization_user: agent.voice_sip_username!,
      register: true,
      session_timers: false,
    });
    uaRef.current = ua;

    ua.on('registered', () => setSipState('registered'));
    ua.on('unregistered', () => setSipState('disconnected'));
    ua.on('registrationFailed', (e: { cause?: string }) => {
      logger.error('softphone registration failed', e?.cause);
      setSipState('failed');
    });

    ua.on('newRTCSession', (data: { session: RTCSession; originator: 'local' | 'remote' }) => {
      const session = data.session;
      const isIncoming = data.originator === 'remote';
      sessionRef.current = session;
      setRemoteParty(session.remote_identity?.uri?.toString() ?? '');
      setCallState(isIncoming ? 'ringing' : 'in-call');

      session.on('accepted', () => setCallState('in-call'));
      session.on('confirmed', () => setCallState('in-call'));
      session.on('ended', () => { setCallState('ended'); sessionRef.current = null; });
      session.on('failed', () => { setCallState('ended'); sessionRef.current = null; });

      // Attach remote audio
      session.connection?.addEventListener('addstream', (ev: unknown) => {
        const stream = (ev as { stream: MediaStream }).stream;
        if (audioRef.current) {
          audioRef.current.srcObject = stream;
          audioRef.current.play().catch(() => {});
        }
      });
    });

    ua.start();
    return () => {
      try { ua.stop(); } catch { /* noop */ }
      uaRef.current = null;
    };
  }, [agent, isLoading, ready, wssUrl]);

  const answer = () => {
    if (!sessionRef.current) return;
    sessionRef.current.answer({
      mediaConstraints: { audio: true, video: false },
    });
  };

  const hangup = () => {
    try { sessionRef.current?.terminate(); } catch { /* noop */ }
    setCallState('idle');
  };

  const toggleMute = () => {
    if (!sessionRef.current) return;
    if (muted) sessionRef.current.unmute({ audio: true });
    else sessionRef.current.mute({ audio: true });
    setMuted(!muted);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading softphone…</CardContent>
      </Card>
    );
  }

  if (!ready) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Phone className="h-4 w-4" />Softphone</CardTitle>
          <CardDescription>
            Your account isn't configured for WebRTC voice. Enable "Receive voice calls" and add SIP credentials in the Agents tab.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const stateColor: Record<SipState, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    disabled: 'outline',
    connecting: 'secondary',
    registered: 'default',
    failed: 'destructive',
    disconnected: 'destructive',
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base"><Phone className="h-4 w-4" />Softphone</CardTitle>
          <Badge variant={stateColor[sipState]} className="capitalize">{sipState}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <audio ref={audioRef} autoPlay />

        {callState === 'idle' && (
          <p className="text-sm text-muted-foreground">Waiting for incoming calls…</p>
        )}

        {callState === 'ringing' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 animate-pulse">
              <PhoneIncoming className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Incoming call</p>
                <p className="text-xs text-muted-foreground font-mono">{remoteParty}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={answer} className="flex-1"><Phone className="h-4 w-4 mr-1" />Answer</Button>
              <Button size="sm" variant="destructive" onClick={hangup}><PhoneOff className="h-4 w-4 mr-1" />Decline</Button>
            </div>
          </div>
        )}

        {callState === 'in-call' && (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">In call</p>
              <p className="text-xs text-muted-foreground font-mono">{remoteParty}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={toggleMute}>
                {muted ? <><MicOff className="h-4 w-4 mr-1" />Unmute</> : <><Mic className="h-4 w-4 mr-1" />Mute</>}
              </Button>
              <Button size="sm" variant="destructive" onClick={hangup} className="flex-1">
                <PhoneOff className="h-4 w-4 mr-1" />Hang up
              </Button>
            </div>
          </div>
        )}

        {callState === 'ended' && (
          <p className="text-sm text-muted-foreground">Call ended.</p>
        )}
      </CardContent>
    </Card>
  );
}
