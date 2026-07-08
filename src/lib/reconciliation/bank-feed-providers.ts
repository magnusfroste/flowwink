/**
 * Bank feed provider adapter interface.
 *
 * FlowWink's working ingestion path is CSV / CAMT.053 / MT940 / OFX / SIE
 * imports + the Stripe payout sync (see `reconciliation/import-file` and
 * `reconciliation/sync-stripe`). Aggregators like Plaid / Tink / GoCardless
 * are scaffolded here as a placeholder — no live integration ships yet.
 *
 * To add a real provider:
 *  1. Implement the interface in `supabase/functions/bank-feed-<provider>/index.ts`.
 *  2. Store credentials in `bank_feed_connections.config` (never in the repo).
 *  3. Register the adapter below and expose a `Connect` flow in the UI.
 */

export type BankFeedProviderId = 'plaid' | 'tink' | 'gocardless' | 'csv' | 'manual' | 'stripe';

export interface BankFeedProvider {
  id: BankFeedProviderId;
  label: string;
  description: string;
  status: 'live' | 'scaffold';
  supportsLiveSync: boolean;
}

export const BANK_FEED_PROVIDERS: BankFeedProvider[] = [
  {
    id: 'csv',
    label: 'CSV / CAMT / MT940 / OFX / SIE',
    description: 'Upload a statement file from your bank or accounting system.',
    status: 'live',
    supportsLiveSync: false,
  },
  {
    id: 'stripe',
    label: 'Stripe payouts',
    description: 'Pull recent Stripe payouts and balance transactions automatically.',
    status: 'live',
    supportsLiveSync: true,
  },
  {
    id: 'plaid',
    label: 'Plaid',
    description: 'Live bank connectivity via Plaid (US / CA / UK / EU). Requires Plaid credentials.',
    status: 'scaffold',
    supportsLiveSync: true,
  },
  {
    id: 'tink',
    label: 'Tink (Visa)',
    description: 'Nordic + European bank feeds via Tink. Requires Tink credentials.',
    status: 'scaffold',
    supportsLiveSync: true,
  },
  {
    id: 'gocardless',
    label: 'GoCardless Bank Account Data',
    description: 'PSD2 bank data across the EU / UK. Requires GoCardless credentials.',
    status: 'scaffold',
    supportsLiveSync: true,
  },
];

/**
 * Contract every real provider adapter must implement.
 * Kept minimal — enough to plug an aggregator into the existing
 * `bank_transactions` + `bank_import_batches` pipeline.
 */
export interface BankFeedAdapter {
  id: BankFeedProviderId;
  /** Kick off the OAuth / API-key handshake. Returns a redirect URL if needed. */
  connect(input: { bankAccountId: string }): Promise<{ redirectUrl?: string; connectionId: string }>;
  /** Pull new transactions since the last sync into `bank_transactions`. */
  sync(input: { connectionId: string }): Promise<{ imported: number; skipped: number }>;
  /** Optional disconnect / revoke. */
  disconnect?(input: { connectionId: string }): Promise<void>;
}
