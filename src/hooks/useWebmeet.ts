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

export interface MeetRoomInfo { id: string; slug: string; name: string | null; max_participants: number; is_locked: boolean; waiting_room: boolean; is_host: boolean }

export interface MeetAccess {
  iceServers: RTCIceServer[];
  provider: 'cloudflare' | 'stun';
  room: MeetRoomInfo;
}

export type MeetAccessError = 'room_not_found' | 'room_locked' | 'password_required' | 'password_wrong' | 'knock_denied' | 'knock_expired' | 'unavailable';

export type MeetDoorAnswer =
  | { ok: true; access: MeetAccess }
  /** The room has a waiting room: this is your place in the queue. Ask again with it when the host answers. */
  | { ok: 'waiting'; knockId: string; room: MeetRoomInfo }
  | { ok: false; error: MeetAccessError; message?: string };

export interface KnockOptions {
  password?: string;
  /** Shown to the host while you wait. */
  name?: string;
  /** Your place in the queue from an earlier 'waiting' answer. */
  knockId?: string;
}

/**
 * Knock on the door: may I join, as whom, and through which relays. Sends the
 * visitor's JWT when there is one so a host is recognised; guests send none.
 */
export async function fetchMeetAccess(slug: string, opts: KnockOptions = {}): Promise<MeetDoorAnswer> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webmeet-ice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ slug, password: opts.password || undefined, name: opts.name || undefined, knock_id: opts.knockId || undefined }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const known: MeetAccessError[] = ['room_not_found', 'room_locked', 'password_required', 'password_wrong', 'knock_denied', 'knock_expired'];
    const err = known.includes(body?.error) ? (body.error as MeetAccessError) : 'unavailable';
    return { ok: false, error: err, message: body?.message };
  }
  if (res.status === 202 && body?.waiting && body?.knock_id) {
    return { ok: 'waiting', knockId: String(body.knock_id), room: body.room as MeetRoomInfo };
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
  /** The peer connection's state, so the tile can say "Reconnecting…" instead of staying black. */
  connection?: RTCPeerConnectionState;
  /**
   * Is sound actually moving between us, measured on the wire (RTP packet counters),
   * not on the switches? `incoming`: their audio reaches me. `outgoing`: mine leaves
   * for them. Undefined until the connection has been up long enough to judge.
   */
  audioFlow?: { incoming: boolean; outgoing: boolean };
}

/**
 * A line typed during the call. Ephemeral by design: it rides the same Realtime
 * channel as the signalling, lives in memory only and is gone when the call ends —
 * nothing is stored. Persistent conversation belongs where the team already talks
 * (FlowWork, River); a consultation's words are not ours to keep.
 */
export interface MeetMessage {
  id: string;
  from: string;
  name: string;
  text: string;
  at: number;
  mine: boolean;
}

interface SignalPayload {
  type: 'offer' | 'answer' | 'ice';
  from: string;
  to: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

/**
 * The sender for one kind of media on a connection, whether or not a device is on it.
 * Found through the transceiver (whose receiver always has a track), not through
 * `sender.track` — a sender with no device has `track === null`.
 */
function senderFor(pc: RTCPeerConnection, kind: 'audio' | 'video'): RTCRtpSender | undefined {
  return pc.getTransceivers().find((t) => t.receiver.track?.kind === kind && t.direction !== 'stopped')?.sender;
}

/** How long the wire must be quiet before a tile says sound is not getting through. */
const AUDIO_FLOW_GRACE_MS = 6000;
const AUDIO_FLOW_POLL_MS = 2000;

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
  /** One stream per person, built from the tracks that arrived — see `pc.ontrack`. */
  const remoteTracksRef = useRef<Map<string, Map<string, MediaStreamTrack>>>(new Map());

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [participants, setParticipants] = useState<Map<string, RemoteParticipant>>(new Map());
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [joined, setJoined] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [messages, setMessages] = useState<MeetMessage[]>([]);
  const facingRef = useRef<'user' | 'environment'>('user');

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
    remoteTracksRef.current.delete(peerId);
  };

  const sendSignal = (payload: SignalPayload) => {
    channelRef.current?.send({ type: 'broadcast', event: 'signal', payload });
  };

  const createPeerConnection = useCallback((remotePeerId: string, initiator: boolean) => {
    if (peersRef.current.has(remotePeerId)) return peersRef.current.get(remotePeerId)!;

    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
    peersRef.current.set(remotePeerId, pc);

    // One sender per kind, always — with a device on it or not. The microphone goes
    // even while a screen is shared (the screen replaces the camera, never the mic:
    // a connection made mid-share used to carry the screen and no sound at all). A
    // kind with no device still gets its line, so turning the mic on later is a
    // replaceTrack, and the other person's media has a line to arrive on.
    // All tracks ride ONE stream id, so the far side sees one person, not two.
    const local = localStreamRef.current ?? new MediaStream();
    const outgoing: Record<'audio' | 'video', MediaStreamTrack | undefined> = {
      audio: local.getAudioTracks()[0],
      video: screenStreamRef.current?.getVideoTracks()[0] ?? local.getVideoTracks()[0],
    };
    for (const kind of ['audio', 'video'] as const) {
      const track = outgoing[kind];
      if (track) pc.addTrack(track, local);
      else if (initiator) pc.addTransceiver(kind, { direction: 'sendrecv', streams: [local] });
      // The answerer opens the line when the offer arrives (handleSignal): a
      // transceiver added here would not be matched to the offer's m-line.
    }

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

    // One stream per person, whatever stream ids the other browser used: a track that
    // arrives on its own id must join the person's stream, not replace it (a
    // replaced stream is a face with no voice, or a voice with no face).
    pc.ontrack = (e) => {
      const tracks = remoteTracksRef.current.get(remotePeerId) ?? new Map<string, MediaStreamTrack>();
      tracks.set(e.track.kind, e.track);
      remoteTracksRef.current.set(remotePeerId, tracks);
      upsertParticipant(remotePeerId, { stream: new MediaStream([...tracks.values()]) });
    };

    // Keep the tile and say what is happening; presence (not the connection) decides
    // when someone has left. A failed connection is usually a firewall, and the
    // person is still in the room — removing them hid exactly the case to explain.
    upsertParticipant(remotePeerId, { connection: pc.connectionState });
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'closed') return;
      upsertParticipant(remotePeerId, { connection: pc.connectionState });
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
        // A kind I have no device for: answer sendrecv anyway, so turning the mic or
        // camera on later reaches them without a new offer.
        const local = localStreamRef.current;
        pc.getTransceivers().forEach((tr) => {
          if (tr.sender.track || tr.direction !== 'recvonly') return;
          tr.direction = 'sendrecv';
          if (local) tr.sender.setStreams?.(local);
        });
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
        // Neither camera nor mic is still a seat in the call (listen, read the chat,
        // turn the mic on later); getUserMedia refuses an all-false request.
        const stream = opts.previewStream ?? (!opts.video && !opts.audio ? new MediaStream() : await navigator.mediaDevices.getUserMedia({
          video: opts.video ? { width: { ideal: 1280 }, height: { ideal: 720 }, ...(opts.videoDeviceId ? { deviceId: { exact: opts.videoDeviceId } } : {}) } : false,
          audio: opts.audio ? (opts.audioDeviceId ? { deviceId: { exact: opts.audioDeviceId } } : true) : false,
        }));
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

        channel.on('broadcast', { event: 'message' }, ({ payload }) => {
          const m = payload as { id?: string; from?: string; name?: string; text?: string; at?: number };
          const text = String(m.text ?? '').slice(0, 2000);
          if (!text.trim() || m.from === peerIdRef.current) return;
          setMessages((prev) => [...prev.slice(-199), { id: String(m.id ?? Math.random()), from: String(m.from ?? ''), name: String(m.name ?? 'Guest').slice(0, 80), text, at: Number(m.at) || Date.now(), mine: false }]);
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
                remoteTracksRef.current.delete(id);
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
    remoteTracksRef.current.clear();
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
    setMessages([]);
    setJoined(false);
  }, []);

  /** Say something to everyone in the call. Not stored anywhere. */
  const sendMessage = useCallback((text: string) => {
    const clean = text.trim().slice(0, 2000);
    if (!clean || !channelRef.current) return;
    const msg = { id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), from: peerIdRef.current, name: displayName, text: clean, at: Date.now() };
    channelRef.current.send({ type: 'broadcast', event: 'message', payload: msg });
    setMessages((prev) => [...prev.slice(-199), { ...msg, mine: true }]);
  }, [displayName]);

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
          const sender = senderFor(pc, kind);
          if (sender) sender.replaceTrack(newTrack);
        });
      }
      setLocalStream(new MediaStream(stream.getTracks()));
    } catch (err) {
      logger.error('switchDevice failed', err);
    }
  }, [isScreenSharing]);

  /** Phones: front ↔ back camera. Same track swap as switchDevice, chosen by facing mode. */
  const flipCamera = useCallback(async () => {
    const stream = localStreamRef.current;
    const old = stream?.getVideoTracks()[0];
    if (!stream || !old) return;
    const next = facingRef.current === 'user' ? 'environment' : 'user';
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: next } } });
      const newTrack = fresh.getVideoTracks()[0];
      if (!newTrack) return;
      newTrack.enabled = old.enabled;
      stream.removeTrack(old); old.stop();
      stream.addTrack(newTrack);
      facingRef.current = next;
      if (!isScreenSharing) {
        peersRef.current.forEach((pc) => {
          const sender = senderFor(pc, 'video');
          if (sender) sender.replaceTrack(newTrack);
        });
      }
      setLocalStream(new MediaStream(stream.getTracks()));
    } catch (err) {
      logger.warn('flipCamera: no other camera to switch to', err);
    }
  }, [isScreenSharing]);

  /**
   * Mic or camera on/off. With no device behind the switch — blocked at the preview,
   * unplugged, or never asked for — "on" asks the browser for one and puts it on
   * every connection's waiting sender. The switch used to do nothing in that case,
   * and the only way out was to leave and join again. Resolves false when the
   * browser said no, so the page can say so.
   */
  const toggleKind = useCallback(async (kind: 'audio' | 'video'): Promise<boolean> => {
    const stream = localStreamRef.current;
    if (!stream) return false;
    const setOn = kind === 'audio' ? setAudioEnabled : setVideoEnabled;
    const existing = kind === 'audio' ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];
    if (existing && existing.readyState === 'live') {
      existing.enabled = !existing.enabled;
      setOn(existing.enabled);
      return true;
    }
    try {
      const fresh = await navigator.mediaDevices.getUserMedia(
        kind === 'audio' ? { audio: true } : { video: { width: { ideal: 1280 }, height: { ideal: 720 } } },
      );
      const track = kind === 'audio' ? fresh.getAudioTracks()[0] : fresh.getVideoTracks()[0];
      if (!track) return false;
      if (existing) stream.removeTrack(existing);
      stream.addTrack(track);
      // A shared screen keeps the video sender; the camera waits in the stream.
      if (!(kind === 'video' && screenStreamRef.current)) {
        peersRef.current.forEach((pc) => { senderFor(pc, kind)?.replaceTrack(track); });
      }
      setLocalStream(new MediaStream(stream.getTracks()));
      setOn(true);
      return true;
    } catch (err) {
      logger.warn(`[meet] the browser gave no ${kind === 'audio' ? 'microphone' : 'camera'}`, err);
      return false;
    }
  }, []);
  const toggleAudio = useCallback(() => toggleKind('audio'), [toggleKind]);
  const toggleVideo = useCallback(() => toggleKind('video'), [toggleKind]);

  const stopScreenShare = useCallback(() => {
    if (!screenStreamRef.current) return;
    screenStreamRef.current.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    setIsScreenSharing(false);
    // restore camera track on all peers
    const camTrack = localStreamRef.current?.getVideoTracks()[0];
    peersRef.current.forEach((pc) => {
      // No camera behind it: the sender goes quiet rather than keep a stopped screen.
      senderFor(pc, 'video')?.replaceTrack(camTrack ?? null);
    });
  }, []);

  const toggleScreenShare = useCallback(async () => {
    // Decided on the ref, not on state: the browser's own "Stop sharing" bar calls
    // back through `onended`, whose closure saw isScreenSharing === false and so
    // started a NEW share instead of ending this one.
    if (screenStreamRef.current) { stopScreenShare(); return; }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      screenStreamRef.current = stream;
      setIsScreenSharing(true);
      const screenTrack = stream.getVideoTracks()[0];
      peersRef.current.forEach((pc) => {
        const sender = senderFor(pc, 'video');
        if (sender) sender.replaceTrack(screenTrack);
      });
      screenTrack.onended = () => {
        if (screenStreamRef.current === stream) stopScreenShare();
      };
    } catch (err) {
      logger.error('screen share failed', err);
    }
  }, [stopScreenShare]);

  // Sound on the wire, per person. The switches say what everyone MEANS to send;
  // the RTP packet counters say what moves. A face with no voice used to leave both
  // people guessing whose end it was — now each tile says which way is quiet.
  useEffect(() => {
    if (!joined) return;
    const reported = new Map<string, string>();
    type Mark = { inPackets: number; outPackets: number; inAt: number; outAt: number; since: number };
    const marks = new Map<string, Mark>();
    const timer = window.setInterval(async () => {
      const now = Date.now();
      for (const [peerId, pc] of peersRef.current) {
        if (pc.connectionState !== 'connected') { marks.delete(peerId); continue; }
        let inPackets = 0;
        let outPackets = 0;
        try {
          (await pc.getStats()).forEach((r: RTCStats & { kind?: string; packetsReceived?: number; packetsSent?: number }) => {
            if (r.kind !== 'audio') return;
            if (r.type === 'inbound-rtp') inPackets += r.packetsReceived ?? 0;
            if (r.type === 'outbound-rtp') outPackets += r.packetsSent ?? 0;
          });
        } catch (err) {
          logger.warn('[meet] getStats failed', err);
          continue;
        }
        const prev = marks.get(peerId) ?? { inPackets, outPackets, inAt: now, outAt: now, since: now };
        const mark: Mark = {
          inPackets,
          outPackets,
          since: prev.since,
          inAt: inPackets > prev.inPackets ? now : prev.inAt,
          outAt: outPackets > prev.outPackets ? now : prev.outAt,
        };
        marks.set(peerId, mark);
        if (now - mark.since < AUDIO_FLOW_GRACE_MS) continue;
        const audioFlow = { incoming: now - mark.inAt < AUDIO_FLOW_GRACE_MS, outgoing: now - mark.outAt < AUDIO_FLOW_GRACE_MS };
        const key = `${audioFlow.incoming}/${audioFlow.outgoing}`;
        if (reported.get(peerId) === key) continue;
        reported.set(peerId, key);
        upsertParticipant(peerId, { audioFlow });
      }
    }, AUDIO_FLOW_POLL_MS);
    return () => window.clearInterval(timer);
  }, [joined]);

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
    flipCamera,
    /** True while the front camera is in use — the local tile mirrors only then. */
    facingUser: facingRef.current === 'user',
    messages,
    sendMessage,
  };
}
