/**
 * Voice provider registry. Importera adapters här för att exponera dem
 * i admin-UI och edge-functions.
 */

import { elks46Provider } from './elks46';
import { twilioProvider } from './twilio';
import type { VoiceProvider, VoiceProviderId } from './types';

export const VOICE_PROVIDERS: Record<VoiceProviderId, VoiceProvider> = {
  elks46: elks46Provider,
  twilio: twilioProvider,
  telnyx: elks46Provider, // placeholder — byts ut vid full implementation
  vonage: elks46Provider, // placeholder
};

export function getVoiceProvider(id: VoiceProviderId | string | null | undefined): VoiceProvider | null {
  if (!id) return null;
  return (VOICE_PROVIDERS as Record<string, VoiceProvider>)[id] ?? null;
}

export function listVoiceProviders(): VoiceProvider[] {
  return [elks46Provider, twilioProvider];
}

export type { VoiceProvider, VoiceProviderId, VoiceCapabilities, VoiceAction, NormalizedIncomingCall, VoiceSettings } from './types';
