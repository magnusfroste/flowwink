import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

/**
 * A catalog site (store.storefront: false) shows its products — name,
 * description, "ask about this product" — and never a price or a cart action.
 * MJP's waterjets have no public price; before this they would have sold for
 * 0 kr on /shop.
 */
let storefront: boolean | undefined = false;
vi.mock('@/hooks/useSiteSettings', () => ({
  useStoreSettings: () => ({ data: { storefront }, isLoading: false }),
  useSeoSettings: () => ({ data: { siteTitle: 'Marine Jet Power' } }),
}));
vi.mock('@/hooks/useModules', () => ({ useIsModuleEnabled: () => true }));
vi.mock('@/hooks/useProducts', () => ({
  useProducts: () => ({ data: [{ id: 'p1', name: 'X series', description: 'High-speed mixed flow, 12–40 m', price_cents: 0, currency: 'SEK', image_url: null, type: 'one_time' }], isLoading: false }),
  formatPrice: (c: number, cur: string) => `${c / 100} ${cur}`,
}));
vi.mock('@/hooks/useProductVariants', () => ({ useVariantProductIds: () => ({ data: new Set() }) }));
vi.mock('@/contexts/CartContext', () => ({ useCart: () => ({ addItem: vi.fn(), items: [] }) }));
vi.mock('@/lib/ui-text', () => ({ useUiText: () => (_k: string, f: string) => f }));
vi.mock('@/components/public/PublicNavigation', () => ({ PublicNavigation: () => null }));
vi.mock('@/components/public/PublicFooter', () => ({ PublicFooter: () => null }));

import ShopPage from '../ShopPage';

const renderShop = () => render(<HelmetProvider><MemoryRouter><ShopPage /></MemoryRouter></HelmetProvider>);

describe('shop in catalog mode', () => {
  beforeEach(() => { storefront = false; });

  it('shows the product without a price or an Add button', () => {
    renderShop();
    expect(screen.getByRole('heading', { level: 1, name: 'Products' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'X series' })).toHaveAttribute('href', '/shop/p1');
    expect(screen.queryByText('0 SEK')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add/i })).not.toBeInTheDocument();
  });

  it('asks the chat about the product', () => {
    const heard: string[] = [];
    window.addEventListener('open-chat-widget', (e) => heard.push((e as CustomEvent).detail.message));
    renderShop();
    fireEvent.click(screen.getByRole('button', { name: 'Ask about this product' }));
    expect(heard).toEqual(['Tell me about X series']);
  });

  it('a shop that sells is unchanged', () => {
    storefront = true;
    renderShop();
    expect(screen.getByRole('heading', { level: 1, name: 'Shop' })).toBeInTheDocument();
    expect(screen.getByText('0 SEK')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
  });
});
