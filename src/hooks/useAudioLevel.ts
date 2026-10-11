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
