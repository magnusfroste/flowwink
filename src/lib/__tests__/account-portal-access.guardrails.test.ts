import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrail: the account portal is cross-functional, not an ecommerce feature.
 *
 * Magnus, 2026-07-22: employees must reach the portal without e-commerce —
 * an HR-only site (leave, payslips, expenses) had NO visible way in, because
 * the header's AccountIndicator was gated on the ecommerce module alone.
 *
 * The rules:
 *   • header entrance   → ecommerce OR hr
 *   • cart              → ecommerce only
 *   • portal nav        → commerce sections (Orders/Addresses/Wishlist) follow
 *     the ecommerce module; employee sections follow the caller's identity
 *     (isEmployee), which is a different axis on purpose
 */

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('account portal access', () => {
  it('the header entrance follows (ecommerce OR hr) AND the portal dial; the cart follows the storefront dial', () => {
    const nav = read('src/components/public/PublicNavigation.tsx');
    // The module opens the door; the operator's customer_portal.enabled dial
    // decides whether it is public (default true — a shop sees no change).
    expect(nav).toMatch(/accountEnabled = \(ecommerceEnabled \|\| hrEnabled\) && \(portalSettings\?\.enabled \?\? true\)/);
    expect(nav.match(/\{accountEnabled && <AccountIndicator \/>\}/g)?.length).toBe(2);
    // The cart is storefront chrome, not module identity: it follows the
    // store.storefront dial so a service business can run ecommerce for its
    // catalog with the shop hidden. The dial has one reader (useStorefront),
    // shared with /shop, the product page and the product blocks.
    expect(nav).toMatch(/const \{ selling: cartEnabled \} = useStorefront\(\);/);
    expect(read('src/hooks/useStorefront.ts')).toMatch(/selling: ecommerceEnabled && !catalogOnly/);
    expect(nav.match(/\{cartEnabled && <CartIndicator \/>\}/g)?.length).toBe(2);
    expect(nav).not.toMatch(/accountEnabled && <CartIndicator/);
  });

  it('commerce portal sections follow the ecommerce module, not identity', () => {
    const layout = read('src/pages/account/AccountLayout.tsx');
    expect(layout).toMatch(/\.\.\.\(ecommerceEnabled \? commerceNav : \[\]\)/);
    // Employee self-service stays identity-gated — modules and identity are
    // different axes.
    expect(layout).toMatch(/\.\.\.\(isEmployee \? employeeNav : \[\]\)/);
  });

  it('with ecommerce off, the portal index does not land on the Orders page', () => {
    const layout = read('src/pages/account/AccountLayout.tsx');
    expect(layout).toMatch(/!ecommerceEnabled && location\.pathname === '\/account'/);
    // A service business (subscriptions on) lands on My services; otherwise
    // the assistant. Never the empty Orders page.
    expect(layout).toMatch(/subscriptionsEnabled \? '\/account\/services' : '\/account\/assistant'/);
  });

  it('the account header icon sends staff to /admin, customers to /account', () => {
    // Hiding is not routing: a salesperson clicking the icon belongs in admin,
    // not among order history and wishlists.
    const ind = read('src/components/public/AccountIndicator.tsx');
    expect(ind).toMatch(/isStaff \? '\/admin' : '\/account'/);
  });
});
