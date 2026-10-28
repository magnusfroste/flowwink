import { useEffect, useState } from 'react';

/**
 * How loud a stream is right now, 0..1. Drives the microphone meter on the
 * pre-join screen (the quickest proof that the mic works) and the ring around
 * whoever is speaking in the call.
 *
 * One AudioContext per stream, sampled ~10 times a second — cheap enough for a
 * handful of tiles. Returns 0 when there is no audio track, or the browser has
 * no Web Audio.
 */
export function useAudioLevel(stream: MediaStream | null | undefined, enabled = true): number {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    const track = stream?.getAudioTracks()[0];
    const Ctx = typeof window !== 'undefined'
      ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
      : undefined;
    if (!enabled || !stream || !track || !Ctx) { setLevel(0); return; }

    const ctx = new Ctx();
    const source = ctx.createMediaStreamSource(new MediaStream([track]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);

    const timer = window.setInterval(() => {
      if (!track.enabled) { setLevel(0); return; }
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      // RMS of speech sits around 0.02–0.2; scale so normal talk fills most of the bar.
      setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 6));
    }, 100);

    return () => {
      window.clearInterval(timer);
      source.disconnect();
      ctx.close().catch(() => { /* already closed */ });
    };
  }, [stream, enabled]);

  return level;
}

/** Above this the tile shows the speaking ring. */
export const SPEAKING_LEVEL = 0.12;

/**
 * Is the microphone the browser gave us actually delivering sound? A real mic always
 * has a noise floor; a muted headset, a virtual device nothing feeds, or a mic the
 * operating system holds back gives exact digital silence — and the person on the
 * other end hears nothing while this side's switch says "on".
 *
 *   'muted'  — the track itself is muted by the browser or the OS (`track.muted`)
 *   'silent' — every sample exactly zero for `SILENCE_MS` (float data: an 8-bit
 *              read rounds a quiet room down to zero and would cry wolf)
 *   'ended'  — the device went away (unplugged, taken by another app)
 *
 * Judged only while the AudioContext runs: a suspended context also reads zeros.
 */
export type MicProblem = 'muted' | 'silent' | 'ended' | null;
const SILENCE_MS = 4000;

export function useMicCheck(stream: MediaStream | null | undefined, enabled = true): MicProblem {
  const [problem, setProblem] = useState<MicProblem>(null);

  useEffect(() => {
    const track = stream?.getAudioTracks()[0];
    const Ctx = typeof window !== 'undefined'
      ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
      : undefined;
    if (!enabled || !stream || !track || !Ctx) { setProblem(null); return; }

    const ctx = new Ctx();
    const source = ctx.createMediaStreamSource(new MediaStream([track]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let silentSince: number | null = null;

    const timer = window.setInterval(() => {
      if (track.readyState === 'ended') { setProblem('ended'); return; }
      if (!track.enabled) { silentSince = null; setProblem(null); return; }
      if (track.muted) { setProblem('muted'); return; }
      if (ctx.state !== 'running') { ctx.resume().catch(() => { /* needs a gesture; judged later */ }); silentSince = null; return; }
      analyser.getFloatTimeDomainData(buf);
      const digitalSilence = buf.every((v) => v === 0);
      const now = Date.now();
      if (!digitalSilence) { silentSince = null; setProblem(null); return; }
      silentSince ??= now;
      setProblem(now - silentSince >= SILENCE_MS ? 'silent' : null);
    }, 250);

    return () => {
      window.clearInterval(timer);
      source.disconnect();
      ctx.close().catch(() => { /* already closed */ });
    };
  }, [stream, enabled]);

  return problem;
}
