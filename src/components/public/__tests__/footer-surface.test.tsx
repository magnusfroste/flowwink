import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PublicFooter } from '../PublicFooter';

/**
 * The footer's surface is a dial. It was bg-primary unconditionally: on a
 * dark site whose dark primary is the accent (Synclair, yellow) the whole
 * footer turned yellow — the one thing the manual forbids (2026-10-22).
 */
let footer: Record<string, unknown> = {};
vi.mock('@/hooks/useGlobalBlocks', () => ({
  useFooterBlock: () => ({ data: { data: footer } }),
  useHeaderBlock: () => ({ data: { data: { customNavItems: [] } } }),
  defaultFooterData: {},
}));
vi.mock('@/providers/BrandingProvider', () => ({ useBranding: () => ({ branding: { organizationName: 'Synclair' } }) }));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'dark' }) }));
vi.mock('@/lib/ui-text', () => ({ useUiText: () => (_k: string, f: string) => f, useUiTextLanguage: () => ({ lang: 'sv', siteLang: 'sv' }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ order: () => ({ order: async () => ({ data: [], error: null }) }) }) }) }) }) }) } }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: [] }) }));

const base = { variant: 'minimal', phone: '', email: '', address: '', postalCode: '', weekdayHours: '', weekendHours: '' };
const footerEl = () => render(<MemoryRouter><PublicFooter /></MemoryRouter>).container.querySelector('footer')!;

describe('footer surface', () => {
  it('unset and primary paint the brand colour, as before', () => {
    footer = { ...base };
    expect(footerEl().className).toMatch(/\bbg-primary\b/);
    footer = { ...base, surface: 'primary' };
    expect(footerEl().getAttribute('data-footer-surface')).toBe('primary');
  });
  it('ground sits on the page ground with a hairline; inverse takes the opposite surface; muted the tint — never bg-primary', () => {
    for (const [surface, cls] of [['ground', /\bbg-background\b.*border-t/], ['inverse', /surface-inverse bg-background/], ['muted', /\bbg-muted\b/]] as const) {
      footer = { ...base, surface };
      const el = footerEl();
      expect(el.className, surface).toMatch(cls);
      expect(el.className, surface).not.toMatch(/\bbg-primary\b/);
      expect(el.className, surface).toMatch(/--primary-foreground:var\(--foreground\)/);
    }
  });
});
