/**
 * 46elks voice provider adapter.
 *
 * Dokumentation: https://46elks.com/docs/webrtc-client-connect
 *
 * - WebRTC SIP-server: wss://voip.46elks.com/w1/websocket
 * - Inkommande callbacks: POST med application/x-www-form-urlencoded
 * - Actions: returneras som JSON ({ connect, play, record, ivr, hangup })
 */

import type { NormalizedIncomingCall, VoiceAction, VoiceProvider } from './types';

export const elks46Provider: VoiceProvider = {
  metadata: {
    id: 'elks46',
    name: '46elks',
    description:
      'Nordisk telecom-provider (SE/DK/FI/NO/UK). Native WebRTC-SIP, inspelning, IVR, realtime audio. Numren stödjer både SMS och röst.',
    docsUrl: 'https://46elks.com/docs/webrtc-client-connect',
    capabilities: {
      webrtc: true,
      sip: true,
      recording: true,
      ivr: true,
      realtimeStream: true,
      outboundCalls: true,
    },
    regions: ['SE', 'DK', 'FI', 'NO', 'GB'],
    requiredSecrets: ['ELKS46_API_USERNAME', 'ELKS46_API_PASSWORD'],
  },

  parseIncoming(request, body): NormalizedIncomingCall | null {
    const get = (k: string): string | undefined => {
      if (body instanceof FormData) return body.get(k)?.toString();
      const v = (body as Record<string, unknown>)[k];
      return typeof v === 'string' ? v : undefined;
    };

    const callid = get('callid');
    const from = get('from');
    const to = get('to');
    if (!callid || !from || !to) return null;

    // 46elks använder olika fält beroende på livscykel.
    // `direction=incoming` + ingen `result` → start
    // `result=hangup` → hangup
    // `result=recording` + `recording_url` → recording_ready
    let event: NormalizedIncomingCall['event'] = 'start';
    const result = get('result');
    const recordingUrl = get('recording_url') ?? get('recording');
    if (recordingUrl) event = 'recording_ready';
    else if (result === 'hangup' || result === 'failed') event = 'hangup';
    else if (result === 'noanswer' || result === 'busy') event = 'no_answer';
    else if (get('actions') || get('whenhangup')) event = 'start';
    else if (result === 'answered') event = 'answered';
    else if (get('dtmf') || get('digits')) event = 'dtmf';

    const raw: Record<string, unknown> = {};
    if (body instanceof FormData) {
      body.forEach((v, k) => {
        raw[k] = v.toString();
      });
    } else {
      Object.assign(raw, body);
    }

    return {
      provider: 'elks46',
      providerCallId: callid,
      from,
      to,
      event,
      recordingUrl,
      recordingDurationSeconds: get('duration')
        ? parseInt(get('duration')!, 10)
        : undefined,
      dtmf: get('dtmf') ?? get('digits'),
      raw,
    };
  },

  serializeAction(action: VoiceAction) {
    const payload = buildElks46Payload(action);
    return {
      body: JSON.stringify(payload),
      contentType: 'application/json',
    };
  },
};

function buildElks46Payload(action: VoiceAction): Record<string, unknown> {
  switch (action.type) {
    case 'connect':
      return {
        connect: action.target,
        ...(action.callerId ? { callerid: action.callerId } : {}),
        ...(action.timeoutSeconds ? { timeout: action.timeoutSeconds } : {}),
      };
    case 'sip':
      return {
        connect: action.target.startsWith('sip:') ? action.target : `sip:${action.target}`,
        ...(action.callerId ? { callerid: action.callerId } : {}),
        ...(action.timeoutSeconds ? { timeout: action.timeoutSeconds } : {}),
      };
    case 'play':
      return {
        play: action.url,
        ...(action.next ? { next: action.next } : {}),
      };
    case 'record':
      return {
        record: 'true',
        ...(action.maxLengthSeconds ? { maxlength: action.maxLengthSeconds } : {}),
        ...(action.next ? { next: action.next } : {}),
      };
    case 'ivr':
      return {
        ivr: action.promptUrl,
        digits: action.digits,
        next: action.next,
      };
    case 'hangup':
      return { hangup: 'true' };
  }
}
