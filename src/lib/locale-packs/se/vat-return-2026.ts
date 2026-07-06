/**
 * Swedish VAT return (Momsdeklaration) — SKV 4700, valid for 2026.
 *
 * Declarative mapping: box code → BAS 2024 account ranges + how to derive
 * the amount. Kept as versioned data in the locale pack so the engine
 * (edge function `accounting-vat-return-se`) contains no year-specific logic.
 *
 * Only the core boxes a Swedish SMB actually uses are covered:
 *   05, 10, 11, 12, 20, 21, 22, 30, 31, 32, 35, 39, 41, 48, 49.
 *
 * Public reference: Skatteverket SKV 4700 (Momsdeklaration).
 */

export type VatBoxKind =
  | 'output_vat'    // Utgående moms — sum of (credit - debit) on account range
  | 'input_vat'     // Ingående moms — sum of (debit - credit) on account range
  | 'base_from_vat' // Beskattningsunderlag härlett från momsen (base = vat / rate)
  | 'base_credit'   // Base — sum of (credit - debit) on account range (sales bases)
  | 'base_debit'    // Base — sum of (debit - credit) on account range (purchase bases)
  | 'computed';     // Derived from other boxes (formula)

export interface VatBoxDefinition {
  code: string;                 // '05', '10', '48', '49' …
  label: string;
  kind: VatBoxKind;
  /** Account codes (BAS 2024) to include for account-based boxes. */
  accounts?: string[];
  /** For base_from_vat: which output-VAT box(es) to derive the base from + rate. */
  derive_from?: { box: string; rate: number }[];
  /** For computed: formula {box: sign}. Sum(sign * box_amount). */
  formula?: Record<string, 1 | -1>;
  /** Marker so consumers can render notes. */
  note?: string;
}

export const SE_VAT_RETURN_2026: {
  version: string;
  form: string;
  boxes: VatBoxDefinition[];
} = {
  version: '2026',
  form: 'SKV 4700',
  boxes: [
    // ─── Sales base (ex VAT) ──────────────────────────────────────────────
    {
      code: '05',
      label: 'Momspliktig försäljning ex moms',
      kind: 'base_from_vat',
      derive_from: [
        { box: '10', rate: 0.25 },
        { box: '11', rate: 0.12 },
        { box: '12', rate: 0.06 },
      ],
      note: 'Härlett = utgående moms / sats för respektive sats.',
    },

    // ─── EU purchases / imports (base) ────────────────────────────────────
    {
      code: '20',
      label: 'Inköp av varor från annat EU-land',
      kind: 'base_debit',
      accounts: ['4515', '4516', '4517', '4518'],
    },
    {
      code: '21',
      label: 'Inköp av tjänster från annat EU-land',
      kind: 'base_debit',
      accounts: ['4531', '4532', '4535', '4536'],
    },
    {
      code: '22',
      label: 'Import av varor (beskattningsunderlag)',
      kind: 'base_debit',
      accounts: ['4545', '4546', '4547'],
    },

    // ─── EU/export sales (base) ───────────────────────────────────────────
    {
      code: '35',
      label: 'Försäljning av varor till annat EU-land',
      kind: 'base_credit',
      accounts: ['3105', '3106', '3108'],
    },
    {
      code: '39',
      label: 'Försäljning av tjänster till annat EU-land',
      kind: 'base_credit',
      accounts: ['3308'],
    },
    {
      code: '41',
      label: 'Försäljning utanför EU (export)',
      kind: 'base_credit',
      accounts: ['3305', '3306'],
    },

    // ─── Output VAT ───────────────────────────────────────────────────────
    {
      code: '10',
      label: 'Utgående moms 25%',
      kind: 'output_vat',
      accounts: ['2610', '2611', '2612', '2613', '2616', '2617', '2618', '2619'],
    },
    {
      code: '11',
      label: 'Utgående moms 12%',
      kind: 'output_vat',
      accounts: ['2620', '2621', '2622', '2623', '2626', '2627', '2628', '2629'],
    },
    {
      code: '12',
      label: 'Utgående moms 6%',
      kind: 'output_vat',
      accounts: ['2630', '2631', '2632', '2633', '2636', '2637', '2638', '2639'],
    },

    // ─── Reverse-charge / EU acquisitions output VAT ──────────────────────
    {
      code: '30',
      label: 'Utgående moms 25% på EU-förvärv / omvänd skattskyldighet',
      kind: 'output_vat',
      accounts: ['2614', '2615'],
    },
    {
      code: '31',
      label: 'Utgående moms 12% på EU-förvärv / omvänd skattskyldighet',
      kind: 'output_vat',
      accounts: ['2624', '2625'],
    },
    {
      code: '32',
      label: 'Utgående moms 6% på EU-förvärv / omvänd skattskyldighet',
      kind: 'output_vat',
      accounts: ['2634', '2635'],
    },

    // ─── Input VAT ────────────────────────────────────────────────────────
    {
      code: '48',
      label: 'Ingående moms att dra av',
      kind: 'input_vat',
      accounts: ['2640', '2641', '2642', '2643', '2644', '2645', '2646', '2647', '2648', '2649'],
    },

    // ─── Net ──────────────────────────────────────────────────────────────
    {
      code: '49',
      label: 'Moms att betala (+) / få tillbaka (−)',
      kind: 'computed',
      formula: { '10': 1, '11': 1, '12': 1, '30': 1, '31': 1, '32': 1, '48': -1 },
      note: '(10 + 11 + 12 + 30 + 31 + 32) − 48',
    },
  ],
};
