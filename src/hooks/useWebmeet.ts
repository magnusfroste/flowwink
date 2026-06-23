/**
 * useWebmeet — mesh WebRTC over Supabase Realtime broadcast.
 *
 * Adapted from the chatsoap useWebRTC hook but stripped of simple-peer +
 * dedicated signaling tables. Pure browser RTCPeerConnection + Realtime
 * broadcast channel `webmeet:<slug>` for signaling and presence.
 *
 * Good for ~4-6 peers. Above that → use the (future) Webinars SFU runtime.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

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

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function useWebmeet(roomSlug: string | undefined, displayName: string) {
  const peerIdRef = useRef<string>(
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
  );
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

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

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
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
    async (opts: { video: boolean; audio: boolean }) => {
      if (!roomSlug || joined) return;
      setConnecting(true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: opts.video ? { width: 640, height: 480 } : false,
          audio: opts.audio,
        });
        localStreamRef.current = stream;
        setLocalStream(stream);
        setVideoEnabled(opts.video);
        setAudioEnabled(opts.audio);

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
  };
}
