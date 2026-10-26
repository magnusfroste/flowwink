import { logger } from '@/lib/logger';

/**
 * The speaker side of a call. A microphone can be watched (meter, ring); a speaker
 * cannot — the only proof is a sound you hear. So the pre-join screen plays one,
 * on the speaker the call will use, and both screens let you pick that speaker.
 *
 * Choosing the output needs `HTMLMediaElement.setSinkId` (Chrome, Edge, Firefox,
 * Safari 18.4+). Without it the system default plays and the picker is hidden.
 */
type SinkElement = HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };

export function canChooseSpeaker(): boolean {
  return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
}

/** Route an element's sound to the chosen speaker; '' (or no support) = system default. */
export async function applySpeaker(el: HTMLMediaElement, speakerId: string): Promise<void> {
  const sink = el as SinkElement;
  if (!speakerId || !sink.setSinkId) return;
  try {
    await sink.setSinkId(speakerId);
  } catch (err) {
    logger.warn('[meet] could not switch speaker', err);
  }
}

/** Two short notes on the chosen speaker. Resolves false when nothing could play. */
export async function playTestSound(speakerId: string): Promise<boolean> {
  const Ctx = typeof window !== 'undefined'
    ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
    : undefined;
  if (!Ctx) return false;
  const ctx = new Ctx();
  try {
    const dest = ctx.createMediaStreamDestination();
    const gain = ctx.createGain();
    gain.connect(dest);
    const at = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, at);
    [[660, 0], [880, 0.35]].forEach(([freq, offset]) => {
      const o = ctx.createOscillator();
      o.frequency.value = freq;
      o.connect(gain);
      gain.gain.exponentialRampToValueAtTime(0.25, at + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + offset + 0.32);
      o.start(at + offset);
      o.stop(at + offset + 0.34);
    });
    const el = new Audio();
    el.srcObject = dest.stream;
    await applySpeaker(el, speakerId);
    await el.play();
    window.setTimeout(() => { el.pause(); el.srcObject = null; ctx.close().catch(() => { /* already closed */ }); }, 900);
    return true;
  } catch (err) {
    logger.warn('[meet] test sound could not play', err);
    ctx.close().catch(() => { /* already closed */ });
    return false;
  }
}
