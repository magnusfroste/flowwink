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
import { Phone, PhoneOff, PhoneIncoming, PhoneOutgoing, Loader2, MicOff, Mic } from 'lucide-react';
import { Input } from '@/components/ui/input';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useMyAgentVoice } from '@/hooks/useVoice';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';

type CallState = 'idle' | 'dialing' | 'ringing' | 'in-call' | 'ended';
type SipState = 'disabled' | 'connecting' | 'registered' | 'failed' | 'disconnected';

interface Props {
  /** Optional override of WSS endpoint (else derived from voice_sip_uri). */
  wssUrl?: string;
}

function deriveWss(sipUri: string | null | undefined, override?: string): string | null {
  if (override) return override;
  if (!sipUri) return null;
  try {
    const host = sipUri.replace(/^sips?:/, '').split('@')[1]?.split(';')[0];
    if (!host) return null;
    // 46elks WebRTC: official endpoint is wss://voip.46elks.com/w1/websocket
    // Accept both voip.* and legacy sip.* hostnames in the SIP URI.
    if (/(^|\.)46elks\.com$/i.test(host)) {
      return 'wss://voip.46elks.com/w1/websocket';
    }
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
  const pendingOutboundRef = useRef(false);

  const [sipState, setSipState] = useState<SipState>('disabled');
  const [callState, setCallState] = useState<CallState>('idle');
  const [remoteParty, setRemoteParty] = useState<string>('');
  const [muted, setMuted] = useState(false);
  const [dialTarget, setDialTarget] = useState('');

  const ready = useMemo(() => {
    if (!agent?.voice_enabled) return false;
    if (!agent.voice_sip_uri || !agent.voice_sip_username || !agent.voice_sip_password) return false;
    return true;
  }, [agent]);

  const startProviderCall = async (number: string) => {
    const target = number.trim();
    if (!target) return;
    if (!uaRef.current || sipState !== 'registered') {
      toast.error('Softphone is not registered yet');
      return;
    }

    setDialTarget(target);
    setRemoteParty(target);
    setCallState('dialing');
    pendingOutboundRef.current = true;

    try {
      const { data, error } = await supabase.functions.invoke('elks46-ingest', {
        body: { action: 'call', mode: 'webrtc', to: target },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success('Calling via 46elks softphone…');
    } catch (err) {
      logger.error('softphone provider call failed', err);
      pendingOutboundRef.current = false;
      setCallState('idle');
      toast.error('Could not start softphone call', {
        description: err instanceof Error ? err.message : '46elks call setup failed',
      });
    }
  };

  const startDirectSipCall = (target: string) => {
    if (!uaRef.current || sipState !== 'registered') return;
    const sipTarget = target.startsWith('sip:') || target.startsWith('sips:')
      ? target
      : `sip:${target}`;
    try {
      uaRef.current.call(sipTarget, {
        mediaConstraints: { audio: true, video: false },
        pcConfig: { iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }] },
      });
      setCallState('in-call');
      setRemoteParty(sipTarget);
    } catch (err) {
      logger.error('softphone direct SIP dial failed', err);
    }
  };

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

      if (isIncoming && pendingOutboundRef.current) {
        pendingOutboundRef.current = false;
        try {
          session.answer({
            mediaConstraints: { audio: true, video: false },
          });
          setCallState('in-call');
        } catch (err) {
          logger.error('softphone auto-answer failed', err);
        }
      }

      session.on('accepted', () => setCallState('in-call'));
      session.on('confirmed', () => setCallState('in-call'));
      session.on('ended', () => { setCallState('ended'); sessionRef.current = null; pendingOutboundRef.current = false; });
      session.on('failed', () => { setCallState('ended'); sessionRef.current = null; pendingOutboundRef.current = false; });

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

  const dial = () => {
    const target = dialTarget.trim();
    if (!target) return;
    if (target.startsWith('sip:') || target.startsWith('sips:')) startDirectSipCall(target);
    else void startProviderCall(target);
  };

  // Allow other panels (e.g. Callbacks) to initiate a call via the softphone.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<any>).detail;
      const number = typeof detail === 'string' ? detail : detail?.number;
      if (!number) return;
      if (number.startsWith('sip:') || number.startsWith('sips:')) startDirectSipCall(number);
      else void startProviderCall(number);
    };
    window.addEventListener('softphone:dial', handler as EventListener);
    return () => window.removeEventListener('softphone:dial', handler as EventListener);
  }, [sipState]);




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
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Waiting for incoming calls — or dial out:</p>
            <div className="flex gap-2">
              <Input
                type="tel"
                placeholder="+46701234567"
                value={dialTarget}
                onChange={(e) => setDialTarget(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') dial(); }}
                disabled={sipState !== 'registered'}
                className="font-mono"
              />
              <Button size="sm" onClick={dial} disabled={sipState !== 'registered' || !dialTarget.trim()}>
                <PhoneOutgoing className="h-4 w-4 mr-1" />Call
              </Button>
            </div>
          </div>
        )}

        {callState === 'dialing' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 animate-pulse">
              <PhoneOutgoing className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Calling</p>
                <p className="text-xs text-muted-foreground font-mono">{remoteParty}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              46elks is calling this browser first. Answer the incoming softphone call to connect the callback.
            </p>
          </div>
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
