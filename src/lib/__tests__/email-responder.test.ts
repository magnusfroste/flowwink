import { describe, it, expect } from 'vitest';
import { parseSse, splitNeedsPerson, NEEDS_PERSON_MARKER } from '../../../supabase/functions/_shared/email/responder-client';

describe('email rides the chat responder', () => {
  it('reads the responder’s SSE into plain text, ignoring keepalives and [DONE]', () => {
    const raw = [
      ': keepalive',
      'data: {"choices":[{"delta":{"content":"Hej Anna,"}}]}',
      'data: {"choices":[{"delta":{"content":" tack för ditt mejl."}}]}',
      'data: {"usage":{"total_tokens":12}}',
      'data: [DONE]',
      '',
    ].join('\n');
    expect(parseSse(raw)).toBe('Hej Anna, tack för ditt mejl.');
  });

  it('the marker means a person: split off, body kept, never sent by the caller', () => {
    const r = splitNeedsPerson(`${NEEDS_PERSON_MARKER}\nHej Anna,\n\nEn kollega återkommer om priset.\n\nVänliga hälsningar\nAcme`);
    expect(r.needsPerson).toBe(true);
    expect(r.body.startsWith('Hej Anna,')).toBe(true);
    expect(r.body).not.toContain(NEEDS_PERSON_MARKER);
  });

  it('a marker deep inside the text is not a signal — only the opening counts', () => {
    const r = splitNeedsPerson('Hej! Svaret är ja.\n\nPS: vi skriver aldrig [NEEDS A PERSON] i ett mejl.');
    expect(r.needsPerson).toBe(false);
  });

  it('no marker: the body is the answer', () => {
    expect(splitNeedsPerson('  Hej Bo, ja det går bra.  ')).toEqual({ needsPerson: false, body: 'Hej Bo, ja det går bra.' });
  });
});
