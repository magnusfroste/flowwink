/**
 * Voice Provider Adapter Contract
 *
 * Voice-modulen är provider-agnostisk. Varje provider (46elks, Twilio, Telnyx, ...)
 * implementerar detta interface. UI, routing, voicemail-UI och callback-kö är
 * gemensamt; bara providerns transportlager skiljer sig.
 *
 * Samma mönster som accounting_export_adapters på locale-packs.
 */

export type VoiceProviderId = 'elks46' | 'twilio' | 'telnyx' | 'vonage';

export interface VoiceCapabilities {
  /** Browser WebRTC SIP-klient stöds (annars fallback till forward-to-mobile). */
  webrtc: boolean;
  /** Klassisk SIP-trunk (mjukvarutelefon). */
  sip: boolean;
  /** Inspelning av samtal / voicemail. */
  recording: boolean;
  /** DTMF / talstyrd IVR i provider. */
  ivr: boolean;
  /** Realtime audio-stream (WebSocket) för AI voice agents. */
  realtimeStream: boolean;
  /** Provider kan skicka utgående callback via API. */
  outboundCalls: boolean;
}

/** Vilka marknader providern stödjer (ISO-3166-1 alpha-2 eller `*` för globalt). */
export type RegionCode = string;

export interface VoiceProviderMetadata {
  id: VoiceProviderId;
  name: string;
  description: string;
  docsUrl: string;
  capabilities: VoiceCapabilities;
  regions: RegionCode[];
  /** Vilka secrets/integrationer providern behöver för att fungera. */
  requiredSecrets: string[];
}

/** Inkommande callback från providern, normaliserad till gemensam shape. */
export interface NormalizedIncomingCall {
  provider: VoiceProviderId;
  providerCallId: string;
  from: string;
  to: string;
  /** Vilken livscykelfas providern signalerar. */
  event: 'start' | 'answered' | 'hangup' | 'recording_ready' | 'dtmf' | 'no_answer';
  /** För `recording_ready`: URL till inspelningen. */
  recordingUrl?: string;
  recordingDurationSeconds?: number;
  /** För `dtmf`: vilken siffra som trycktes. */
  dtmf?: string;
  /** Råpayloaden för debug + provider-specifika fält. */
  raw: Record<string, unknown>;
}

/** Beslut som returneras till providern (samma form oavsett provider — JSON-actions). */
export type VoiceAction =
  | { type: 'connect'; target: string; callerId?: string; timeoutSeconds?: number }
  | { type: 'sip'; target: string; callerId?: string; timeoutSeconds?: number }
  | { type: 'play'; url: string; next?: string }
  | { type: 'record'; next?: string; maxLengthSeconds?: number }
  | { type: 'ivr'; promptUrl: string; digits: number; next: string }
  | { type: 'hangup' };

/** Den providern returnerar (provider-specifik JSON för 46elks/Twilio/...). */
export type ProviderActionResponse = Record<string, unknown>;

export interface VoiceProvider {
  metadata: VoiceProviderMetadata;

  /**
   * Tolka rå provider-callback (FormData/JSON) till normaliserat event.
   * Returnera null om payloaden inte är en känd voice-händelse.
   */
  parseIncoming(request: Request, body: FormData | Record<string, unknown>): NormalizedIncomingCall | null;

  /**
   * Serialisera en generisk VoiceAction till providerns format.
   * Ex: 46elks → `{ connect: "+46..." }`, Twilio → TwiML XML.
   */
  serializeAction(action: VoiceAction): { body: string; contentType: string };
}

export interface VoiceSettings {
  /** Vald providers id (eller null → modulen inaktiv). */
  provider: VoiceProviderId | null;
  /** URL till voicemail-greeting (default: provider-default). */
  voicemailGreetingUrl?: string;
  /** URL till välkomstmeddelande (UC4). */
  welcomeGreetingUrl?: string;
  /** Sekunder att ringa innan voicemail tar över. */
  ringTimeoutSeconds: number;
  /** UC4: föreslå booking-slot till uppringaren? */
  bookingIvrEnabled: boolean;
  /** Vilken booking_service som föreslås i UC4. */
  bookingServiceId?: string;
}
