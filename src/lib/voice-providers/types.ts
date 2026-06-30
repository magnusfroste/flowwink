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
  /**
   * Låt en agent svara på ett röstmeddelande med SMS till uppringaren
   * (t.ex. "Jag ringer upp dig 10:30"). Skickas bara till mobilnummer —
   * fasta nummer blockeras med en notis i tråden.
   */
  smsReplyEnabled?: boolean;

  // ── Callback auto-scheduler (opt-in) ───────────────────────────────────────
  /**
   * Boka automatiskt in en återuppringningstid (nästa lediga lucka som inte
   * krockar) när ett missat samtal/röstmeddelande kommer in. Av = manuell
   * bokning som idag.
   */
  autoScheduleCallbacks?: boolean;
  /** Skicka även ett SMS till uppringaren med den inbokade tiden (mobil-only). */
  autoScheduleSms?: boolean;
  /** IANA-tidszon för arbetstidsfönstret (default Europe/Stockholm). */
  callbackTimezone?: string;
  /** Arbetstidens start, "HH:MM" lokal tid (default 09:00). */
  callbackWindowStart?: string;
  /** Arbetstidens slut, "HH:MM" lokal tid (default 17:00). */
  callbackWindowEnd?: string;
  /** Minuter mellan callback-luckor (default 15). */
  callbackSlotMinutes?: number;

  // ── AI Receptionist (MVP) ──────────────────────────────────────────────────
  /**
   * Låt en realtids-AI (Gemini Live) svara när inga agenter är online.
   * Av = dagens flöde (voicemail). På = WebSocket-bryggning mellan
   * provider och Gemini Live, med tool-calling mot enabled moduler.
   */
  aiReceptionistEnabled?: boolean;
  /** Provider för AI-receptionisten. MVP: gemini-live. */
  aiReceptionistProvider?: 'gemini-live';
  /** Första hälsningen AI:n säger (text → TTS). Tom = härleds från business_identity. */
  aiReceptionistGreeting?: string;
  /** Extra system-prompt-instruktioner utöver business_identity + KB. */
  aiReceptionistSystemPromptExtra?: string;
  /** Använd FlowPilots objectives som extra context om modulen är på. Default false. */
  aiReceptionistUseFlowpilotContext?: boolean;
  /** Röst-namn för Gemini Live TTS (t.ex. "Aoede", "Charon", "Fenrir", "Kore", "Puck"). */
  aiReceptionistVoice?: string;
}
