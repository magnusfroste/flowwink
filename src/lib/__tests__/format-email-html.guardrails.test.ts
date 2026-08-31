import { describe, expect, it } from 'vitest';
import { formatEmailHtml } from '../format-email-html';

// Renderingsekvivalens: samma dokument när formateringssömmar (radbrytningar
// mellan taggar) tas bort. Innehållssömmar — text och enkla mellanslag — ska
// överleva ordagrant.
const essence = (s: string) => s.replace(/>\s*\n\s*</g, '><').replace(/\n\s*/g, ' ').trim();

const SEED =
  '<h1 style="font-size:22px">Booking confirmation</h1><p>Hello {{customer_name}},</p>' +
  '<div style="background:#f9fafb"><p style="margin:4px 0"><strong>Service:</strong> {{service_name}}</p></div>' +
  '{{notes_block}}<p>If anything changes, just reply.</p>';

describe('formatEmailHtml', () => {
  it('bryter enradig HTML till indenterad struktur', () => {
    const out = formatEmailHtml(SEED);
    expect(out.split('\n').length).toBeGreaterThanOrEqual(5);
    expect(out).toContain('  <p style="margin:4px 0">');
  });

  it('är idempotent — formatera två gånger ger samma sak', () => {
    const once = formatEmailHtml(SEED);
    expect(formatEmailHtml(once)).toBe(once);
  });

  it('renderingsekvivalent: inga tecken utanför formateringssömmarna ändras', () => {
    expect(essence(formatEmailHtml(SEED))).toBe(essence(SEED));
  });

  it('rör inte {{variabler}} eller text som sitter ihop med sin tagg', () => {
    const out = formatEmailHtml(SEED);
    expect(out).toContain('<strong>Service:</strong> {{service_name}}');
    expect(out).toContain('Hello {{customer_name}},');
  });

  it('ett stycke med inline-innehåll hålls ihop på EN rad', () => {
    const out = formatEmailHtml(SEED);
    expect(out).toContain('<p style="margin:4px 0"><strong>Service:</strong> {{service_name}}</p>');
  });

  it('bryter INTE mellan två inline-taggar — det hade blivit ett synligt mellanslag', () => {
    const s = '<p><strong>A</strong><em>B</em></p>';
    expect(formatEmailHtml(s)).toContain('<strong>A</strong><em>B</em>');
  });

  it('ett medvetet mellanslag mellan taggar är innehåll och överlever', () => {
    const s = '<p><span>a</span> <span>b</span></p>';
    expect(formatEmailHtml(s)).toContain('</span> <span>');
  });

  it('style-kroppar passerar orörda — selektorer kan innehålla >', () => {
    const s = '<style>div > p { color: red; }</style><div><p>x</p></div>';
    expect(formatEmailHtml(s)).toContain('div > p { color: red; }');
  });

  it('tom sträng är tom sträng', () => {
    expect(formatEmailHtml('')).toBe('');
  });
});
