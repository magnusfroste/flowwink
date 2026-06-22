/**
 * Twilio voice provider adapter (STUB).
 *
 * Twilio är den globala motsvarigheten till 46elks. Dokumentation:
 * https://www.twilio.com/docs/voice/twiml
 *
 * Detta är ett kontrakt-stub som bevisar att voice-modulens arkitektur
 * INTE är 46elks-specifik. Full implementation följer när första
 * Twilio-baserade kunden dyker upp.
 *
 * Skillnader att hantera vid full implementation:
 * - Actions serialiseras som TwiML (XML), inte JSON
 * - Browser-klient via Twilio Voice JS SDK (Access Tokens), inte SIP-WebSocket
 * - Inkommande callbacks är `application/x-www-form-urlencoded` med Twilio-fält
 * - Inspelning hämtas från `/Recordings/{Sid}.mp3` via Basic Auth
 */

import type { NormalizedIncomingCall, VoiceAction, VoiceProvider } from './types';

export const twilioProvider: VoiceProvider = {
  metadata: {
    id: 'twilio',
    name: 'Twilio (planned)',
    description:
      'Global telecom-provider med stöd för 150+ länder. Browser-WebRTC via Voice JS SDK, TwiML för logik. Adapter är ett kontrakt-stub — full implementation följer.',
    docsUrl: 'https://www.twilio.com/docs/voice',
    capabilities: {
      webrtc: true,
      sip: true,
      recording: true,
      ivr: true,
      realtimeStream: true,
      outboundCalls: true,
    },
    regions: ['*'],
    requiredSecrets: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET'],
  },

  parseIncoming(_request, body): NormalizedIncomingCall | null {
    const get = (k: string): string | undefined => {
      if (body instanceof FormData) return body.get(k)?.toString();
      const v = (body as Record<string, unknown>)[k];
      return typeof v === 'string' ? v : undefined;
    };

    const sid = get('CallSid');
    const from = get('From');
    const to = get('To');
    if (!sid || !from || !to) return null;

    const status = get('CallStatus');
    let event: NormalizedIncomingCall['event'] = 'start';
    if (get('RecordingUrl')) event = 'recording_ready';
    else if (status === 'completed' || status === 'failed') event = 'hangup';
    else if (status === 'no-answer' || status === 'busy') event = 'no_answer';
    else if (status === 'in-progress') event = 'answered';
    else if (get('Digits')) event = 'dtmf';

    const raw: Record<string, unknown> = {};
    if (body instanceof FormData) {
      body.forEach((v, k) => {
        raw[k] = v.toString();
      });
    } else {
      Object.assign(raw, body);
    }

    return {
      provider: 'twilio',
      providerCallId: sid,
      from,
      to,
      event,
      recordingUrl: get('RecordingUrl'),
      recordingDurationSeconds: get('RecordingDuration')
        ? parseInt(get('RecordingDuration')!, 10)
        : undefined,
      dtmf: get('Digits'),
      raw,
    };
  },

  serializeAction(action: VoiceAction) {
    // TwiML — minimal stub. Full implementation följer.
    const xml = buildTwiML(action);
    return {
      body: `<?xml version="1.0" encoding="UTF-8"?><Response>${xml}</Response>`,
      contentType: 'application/xml',
    };
  },
};

function buildTwiML(action: VoiceAction): string {
  switch (action.type) {
    case 'connect':
      return `<Dial${action.timeoutSeconds ? ` timeout="${action.timeoutSeconds}"` : ''}${
        action.callerId ? ` callerId="${escape(action.callerId)}"` : ''
      }>${escape(action.target)}</Dial>`;
    case 'sip':
      return `<Dial><Sip>${escape(action.target)}</Sip></Dial>`;
    case 'play':
      return `<Play>${escape(action.url)}</Play>`;
    case 'record':
      return `<Record${action.maxLengthSeconds ? ` maxLength="${action.maxLengthSeconds}"` : ''}${
        action.next ? ` action="${escape(action.next)}"` : ''
      } />`;
    case 'ivr':
      return `<Gather numDigits="${action.digits}" action="${escape(action.next)}"><Play>${escape(action.promptUrl)}</Play></Gather>`;
    case 'hangup':
      return '<Hangup/>';
  }
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
