import { describe, it, expect } from 'vitest';
import { winAnsi } from '../../../supabase/functions/_shared/invoices/winansi';

/**
 * One character outside Windows-1252 failed the whole invoice PDF, and the
 * invoice mail went out without it (2026-11-17: a line reading "A → B").
 */
describe('text the invoice PDF can draw', () => {
  it('leaves what the font carries untouched', () => {
    for (const s of ['Rådgivning, 2 dagar à 1 000,00 kr', 'Müller & Søn — “offert” … 10 € ™', 'Línea 1\nLínea 2']) {
      expect(winAnsi(s)).toBe(s);
    }
  });

  it('spells a sign the font lacks', () => {
    expect(winAnsi('2026-11-01 → 2026-12-01')).toBe('2026-11-01 -> 2026-12-01');
    expect(winAnsi('a ≤ b − c')).toBe('a <= b - c');
    expect(winAnsi('1 234,50')).toBe('1 234,50');
  });

  it('drops the accent of a letter outside the set, and never throws on the rest', () => {
    expect(winAnsi('Łódź, Dvořák')).toBe('Lódz, Dvorák');
    expect(winAnsi('Klart ✅ 🎉')).toBe('Klart ? ?');
    expect(winAnsi('Ελλάδα')).toBe('??????');
    expect(winAnsi(null)).toBe('');
  });

  it('answers only characters the font carries, whatever it is handed', () => {
    const out = winAnsi('→←↔⇒≤≥≠✓✔×​﻿日本語 emoji 👍🏽 Ł ő ș');
    for (const ch of out) {
      const cp = ch.codePointAt(0)!;
      const ok = (cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff) || [0x0a, 0x0d, 0x09].includes(cp);
      expect(ok, `U+${cp.toString(16)}`).toBe(true);
    }
  });
});
