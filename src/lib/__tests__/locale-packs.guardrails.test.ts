import { describe, it, expect } from 'vitest';
import { LOCALE_PACKS, listPacks, getPack, DEFAULT_LOCALE_ID } from '@/lib/locale-packs';

/**
 * Locale-pack contract guardrail.
 * Locks the plugin shape so accidentally registering an incomplete pack
 * (missing chart, payroll adapter, AI instructions, etc.) breaks CI rather
 * than silently degrading accounting at runtime.
 */
describe('Accounting locale-pack contract', () => {
  it('exposes at least the default Swedish pack and a generic IFRS pack', () => {
    expect(LOCALE_PACKS[DEFAULT_LOCALE_ID]).toBeDefined();
    expect(LOCALE_PACKS['ifrs-generic']).toBeDefined();
  });

  it('every registered pack satisfies the AccountingLocalePack contract', () => {
    for (const pack of listPacks()) {
      expect(pack.id, 'id').toBeTruthy();
      expect(pack.label, 'label').toBeTruthy();
      expect(pack.description, 'description').toBeTruthy();
      expect(Array.isArray(pack.countries) && pack.countries.length > 0, 'countries').toBe(true);

      // Currency
      expect(pack.currency.code).toMatch(/^[A-Z]{3}$/);
      expect(pack.currency.decimals).toBeGreaterThanOrEqual(0);
      expect(pack.currency.intl_locale).toBeTruthy();

      // VAT
      expect(pack.vat.default_rate).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(pack.vat.rates) && pack.vat.rates.length > 0).toBe(true);

      // Chart + templates
      expect(pack.chart.length, `${pack.id} chart must not be empty`).toBeGreaterThan(0);
      expect(Array.isArray(pack.templates)).toBe(true);

      // At least one payroll adapter and one bank-import adapter
      expect(pack.payroll_adapters.length, `${pack.id} payroll`).toBeGreaterThan(0);
      expect(pack.bank_import_adapters.length, `${pack.id} bank import`).toBeGreaterThan(0);

      // Every pack must expose at least one standardised accounting export
      // (SIE in SE, DATEV in DE, FEC in FR, SAF-T in NO/PT, OECD SAF-T as
      // generic baseline) so auditors / migrations always have a path out.
      expect(
        pack.accounting_export_adapters.length,
        `${pack.id} accounting export`,
      ).toBeGreaterThan(0);

      // AI instructions cover the three modules that ask the agent to book
      expect(pack.ai_instructions.journal_entry).toBeTruthy();
      expect(pack.ai_instructions.invoicing).toBeTruthy();
      expect(pack.ai_instructions.purchasing).toBeTruthy();
    }
  });

  it('getPack falls back to default for unknown ids', () => {
    expect(getPack('does-not-exist').id).toBe(DEFAULT_LOCALE_ID);
    expect(getPack(null).id).toBe(DEFAULT_LOCALE_ID);
  });

  it('SE pack exposes PAXml, SIE bank import, SIE 4 export and a year_end_proposals callback', async () => {
    const se = getPack('se-bas2024');
    expect(se.payroll_adapters.find((a) => a.id === 'paxml')).toBeDefined();
    expect(se.bank_import_adapters.find((a) => a.id === 'sie')).toBeDefined();
    expect(se.accounting_export_adapters.find((a) => a.id === 'sie4')).toBeDefined();
    expect(se.currency.code).toBe('SEK');
    expect(se.vat.default_rate).toBe(0.25);

    // Year-end proposals — SE-specific dispositions (periodiseringsfond etc.)
    expect(typeof se.year_end_proposals).toBe('function');
    const proposals = await se.year_end_proposals!(new Date().getFullYear());
    expect(Array.isArray(proposals)).toBe(true);
    expect(proposals.length).toBeGreaterThan(0);
    for (const p of proposals) {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(Array.isArray(p.lines) && p.lines.length > 0).toBe(true);
    }
  });

  it('Generic IFRS pack does NOT assume Swedish-specific formats but offers OECD SAF-T', () => {
    const generic = getPack('ifrs-generic');
    expect(generic.payroll_adapters.find((a) => a.id === 'paxml')).toBeUndefined();
    expect(generic.bank_import_adapters.find((a) => a.id === 'sie')).toBeUndefined();
    expect(generic.accounting_export_adapters.find((a) => a.id === 'sie4')).toBeUndefined();
    expect(generic.accounting_export_adapters.find((a) => a.id === 'saft-oecd')).toBeDefined();
    expect(generic.vat.default_rate).toBe(0);
  });
});
