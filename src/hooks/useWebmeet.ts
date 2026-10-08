/**
 * useWebmeet — mesh WebRTC over Supabase Realtime broadcast.
 *
 * Adapted from the chatsoap useWebRTC hook but stripped of simple-peer +
 * dedicated signaling tables. Pure browser RTCPeerConnection + Realtime
 * broadcast channel `webmeet:<slug>` for signaling and presence.
 *
 * ICE servers come from the `webmeet-ice` door (`fetchMeetAccess`): Cloudflare
 * Calls TURN when the instance has the key, public STUN otherwise. Without TURN
 * a call to someone behind a corporate firewall or symmetric NAT never
 * connects — the single most common "video does not work" in a sales call.
 *
 * Mesh: every browser sends one stream per other participant. Good to ~5;
 * `max_participants` is enforced at join (`room_full`). Above that → SFU.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export interface MeetAccess {
  iceServers: RTCIceServer[];
  provider: 'cloudflare' | 'stun';
  room: { id: string; slug: string; name: string | null; max_participants: number; is_locked: boolean; is_host: boolean };
}

export type MeetAccessError = 'room_not_found' | 'room_locked' | 'password_required' | 'password_wrong' | 'unavailable';

/**
 * Knock on the door: may I join, as whom, and through which relays. Sends the
 * visitor's JWT when there is one so a host is recognised; guests send none.
 */
export async function fetchMeetAccess(slug: string, password?: string): Promise<{ ok: true; access: MeetAccess } | { ok: false; error: MeetAccessError; message?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webmeet-ice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ slug, password: password || undefined }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const known: MeetAccessError[] = ['room_not_found', 'room_locked', 'password_required', 'password_wrong'];
    const err = known.includes(body?.error) ? (body.error as MeetAccessError) : 'unavailable';
    return { ok: false, error: err, message: body?.message };
  }
  return { ok: true, access: body as MeetAccess };
}

export interface JoinOptions {
  video: boolean;
  audio: boolean;
  /** From the pre-join screen: a specific camera / microphone. */
  videoDeviceId?: string;
  audioDeviceId?: string;
  /** From fetchMeetAccess. Falls back to public STUN when missing. */
  iceServers?: RTCIceServer[];
  /** From the room row; the join refuses with `room_full` when presence already holds this many. */
  maxParticipants?: number;
  /** A stream the pre-join screen already opened; reused instead of asking the browser twice. */
  previewStream?: MediaStream | null;
}

export interface RemoteParticipant {
  peerId: string;
  displayName: string;
  stream?: MediaStream;
  videoEnabled: boolean;
  audioEnabled: boolean;
}

interface SignalPayload {
  type: 'offer' | 'answer' | 'ice';
  from: string;
  to: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

/** Used only when the door did not answer — a same-network call still works. */
const STUN_ONLY: RTCIceServer[] = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
];

export function useWebmeet(roomSlug: string | undefined, displayName: string) {
  const peerIdRef = useRef<string>(
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
  );
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const iceServersRef = useRef<RTCIceServer[]>(STUN_ONLY);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [participants, setParticipants] = useState<Map<string, RemoteParticipant>>(new Map());
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [joined, setJoined] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const upsertParticipant = (peerId: string, patch: Partial<RemoteParticipant>) => {
    setParticipants((prev) => {
      const next = new Map(prev);
      const existing = next.get(peerId) ?? {
        peerId,
        displayName: 'Guest',
        videoEnabled: false,
        audioEnabled: false,
      };
      next.set(peerId, { ...existing, ...patch });
      return next;
    });
  };

  const removeParticipant = (peerId: string) => {
    setParticipants((prev) => {
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });
    const pc = peersRef.current.get(peerId);
    if (pc) {
      pc.close();
      peersRef.current.delete(peerId);
    }
  };

  const sendSignal = (payload: SignalPayload) => {
    channelRef.current?.send({ type: 'broadcast', event: 'signal', payload });
  };

  const createPeerConnection = useCallback((remotePeerId: string, initiator: boolean) => {
    if (peersRef.current.has(remotePeerId)) return peersRef.current.get(remotePeerId)!;

    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
    peersRef.current.set(remotePeerId, pc);

    // Add local tracks
    const stream = screenStreamRef.current ?? localStreamRef.current;
    stream?.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendSignal({
          type: 'ice',
          from: peerIdRef.current,
          to: remotePeerId,
          candidate: e.candidate.toJSON(),
        });
      }
    };

    pc.ontrack = (e) => {
      const [remoteStream] = e.streams;
      upsertParticipant(remotePeerId, { stream: remoteStream });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        removeParticipant(remotePeerId);
      }
    };

    if (initiator) {
      (async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sendSignal({ type: 'offer', from: peerIdRef.current, to: remotePeerId, sdp: offer });
        } catch (err) {
          logger.error('createOffer failed', err);
        }
      })();
    }

    return pc;
  }, []);

  const handleSignal = useCallback(
    async (payload: SignalPayload) => {
      if (payload.to !== peerIdRef.current) return;
      const from = payload.from;
      let pc = peersRef.current.get(from);

      if (payload.type === 'offer') {
        if (!pc) pc = createPeerConnection(from, false);
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp!));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal({ type: 'answer', from: peerIdRef.current, to: from, sdp: answer });
      } else if (payload.type === 'answer' && pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp!));
      } else if (payload.type === 'ice' && pc && payload.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch (err) {
          logger.error('addIceCandidate failed', err);
        }
      }
    },
    [createPeerConnection],
  );

  const broadcastPresence = useCallback(() => {
    channelRef.current?.track({
      peerId: peerIdRef.current,
      displayName,
      videoEnabled,
      audioEnabled,
    });
  }, [displayName, videoEnabled, audioEnabled]);

  // Re-track when local mute state changes so peers see it
  useEffect(() => {
    if (joined) broadcastPresence();
  }, [joined, broadcastPresence]);

  const join = useCallback(
    async (opts: JoinOptions) => {
      if (!roomSlug || joined) return;
      setConnecting(true);
      try {
        iceServersRef.current = opts.iceServers?.length ? opts.iceServers : STUN_ONLY;
        const stream = opts.previewStream ?? await navigator.mediaDevices.getUserMedia({
          video: opts.video ? { width: { ideal: 1280 }, height: { ideal: 720 }, ...(opts.videoDeviceId ? { deviceId: { exact: opts.videoDeviceId } } : {}) } : false,
          audio: opts.audio ? (opts.audioDeviceId ? { deviceId: { exact: opts.audioDeviceId } } : true) : false,
        });
        // A preview stream was opened with both kinds so the user could test them;
        // honour the switches they left in: a track off at join starts muted.
        stream.getVideoTracks().forEach((t) => { t.enabled = opts.video; });
        stream.getAudioTracks().forEach((t) => { t.enabled = opts.audio; });
        localStreamRef.current = stream;
        setLocalStream(stream);
        setVideoEnabled(opts.video && stream.getVideoTracks().length > 0);
        setAudioEnabled(opts.audio && stream.getAudioTracks().length > 0);

        const channel = supabase.channel(`webmeet:${roomSlug}`, {
          config: { presence: { key: peerIdRef.current }, broadcast: { self: false } },
        });
        channelRef.current = channel;

        channel.on('broadcast', { event: 'signal' }, ({ payload }) => {
          handleSignal(payload as SignalPayload);
        });

        channel.on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState<{
            peerId: string;
            displayName: string;
            videoEnabled: boolean;
            audioEnabled: boolean;
          }>();
          const seen = new Set<string>();
          Object.values(state).forEach((entries) => {
            entries.forEach((entry) => {
              if (entry.peerId === peerIdRef.current) return;
              seen.add(entry.peerId);
              upsertParticipant(entry.peerId, {
                displayName: entry.displayName,
                videoEnabled: entry.videoEnabled,
                audioEnabled: entry.audioEnabled,
              });
            });
          });
          // Remove participants that left
          setParticipants((prev) => {
            const next = new Map(prev);
            for (const id of next.keys()) {
              if (!seen.has(id)) {
                next.delete(id);
                const pc = peersRef.current.get(id);
                pc?.close();
                peersRef.current.delete(id);
              }
            }
            return next;
          });
        });

        channel.on('presence', { event: 'join' }, ({ newPresences }) => {
          (newPresences as Array<{ peerId?: string }>).forEach((p) => {
            if (!p.peerId || p.peerId === peerIdRef.current) return;
            // Deterministic initiator: lower id calls higher id
            if (peerIdRef.current < p.peerId) {
              createPeerConnection(p.peerId, true);
            }
          });
        });

        channel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
          (leftPresences as Array<{ peerId?: string }>).forEach((p) => {
            if (p.peerId) removeParticipant(p.peerId);
          });
        });

        await new Promise<void>((resolve, reject) => {
          channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') resolve();
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(status));
          });
        });

        // The cap is a promise to the people already in the call (mesh bandwidth
        // grows with every extra face). Count who is present before announcing
        // ourselves; a full room is left as quietly as it was entered.
        if (opts.maxParticipants) {
          const present = Object.values(channel.presenceState<{ peerId: string }>()).flat()
            .filter((e) => e.peerId && e.peerId !== peerIdRef.current).length;
          if (present >= opts.maxParticipants) {
            await supabase.removeChannel(channel);
            channelRef.current = null;
            stream.getTracks().forEach((t) => t.stop());
            localStreamRef.current = null;
            setLocalStream(null);
            throw new Error('room_full');
          }
        }

        await channel.track({
          peerId: peerIdRef.current,
          displayName,
          videoEnabled: opts.video,
          audioEnabled: opts.audio,
        });

        setJoined(true);
      } catch (err) {
        logger.error('Failed to join webmeet', err);
        throw err;
      } finally {
        setConnecting(false);
      }
    },
    [roomSlug, joined, displayName, handleSignal, createPeerConnection],
  );

  const leave = useCallback(async () => {
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    setParticipants(new Map());

    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    screenStreamRef.current = null;
    setLocalStream(null);
    setVideoEnabled(false);
    setAudioEnabled(false);
    setIsScreenSharing(false);

    if (channelRef.current) {
      await supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setJoined(false);
  }, []);

  const toggleVideo = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setVideoEnabled(track.enabled);
  }, []);

  /** Swap camera or microphone mid-call: new track to every peer, old one stopped. */
  const switchDevice = useCallback(async (kind: 'video' | 'audio', deviceId: string) => {
    const stream = localStreamRef.current;
    if (!stream) return;
    try {
      const fresh = await navigator.mediaDevices.getUserMedia(
        kind === 'video' ? { video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } } : { audio: { deviceId: { exact: deviceId } } },
      );
      const newTrack = kind === 'video' ? fresh.getVideoTracks()[0] : fresh.getAudioTracks()[0];
      const old = kind === 'video' ? stream.getVideoTracks()[0] : stream.getAudioTracks()[0];
      if (!newTrack) return;
      newTrack.enabled = old ? old.enabled : true;
      if (old) { stream.removeTrack(old); old.stop(); }
      stream.addTrack(newTrack);
      if (!(kind === 'video' && isScreenSharing)) {
        peersRef.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === kind);
          if (sender) sender.replaceTrack(newTrack);
        });
      }
      setLocalStream(new MediaStream(stream.getTracks()));
    } catch (err) {
      logger.error('switchDevice failed', err);
    }
  }, [isScreenSharing]);

  const toggleAudio = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setAudioEnabled(track.enabled);
  }, []);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      setIsScreenSharing(false);
      // restore camera track on all peers
      const camTrack = localStreamRef.current?.getVideoTracks()[0];
      peersRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender && camTrack) sender.replaceTrack(camTrack);
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      screenStreamRef.current = stream;
      setIsScreenSharing(true);
      const screenTrack = stream.getVideoTracks()[0];
      peersRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(screenTrack);
      });
      screenTrack.onended = () => {
        toggleScreenShare();
      };
    } catch (err) {
      logger.error('screen share failed', err);
    }
  }, [isScreenSharing]);

  useEffect(() => {
    return () => {
      // cleanup on unmount
      peersRef.current.forEach((pc) => pc.close());
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, []);

  return {
    peerId: peerIdRef.current,
    localStream,
    participants: Array.from(participants.values()),
    videoEnabled,
    audioEnabled,
    isScreenSharing,
    joined,
    connecting,
    join,
    leave,
    toggleVideo,
    toggleAudio,
    toggleScreenShare,
    switchDevice,
  };
}
