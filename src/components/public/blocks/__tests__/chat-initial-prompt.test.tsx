import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatBlock } from '../ChatBlock';
import type { ChatBlockData } from '@/types/cms';

/**
 * chat.initialPrompt was advertised ("Initial bot message"), editable, and shown
 * in the admin preview as the assistant's first bubble, but the public block
 * never passed it on: every visitor got the site-wide welcome message instead.
 * The block's own opening message now wins in that block, and only there.
 */

const SITE_WELCOME = 'Välkommen till sajten!';

vi.mock('@/hooks/useSiteSettings', async (importActual) => ({
  ...(await importActual<typeof import('@/hooks/useSiteSettings')>()),
  useChatSettings: () => ({ data: { blockEnabled: true, welcomeMessage: SITE_WELCOME }, isLoading: false }),
}));
vi.mock('@/hooks/useModules', () => ({ useIsModuleEnabled: () => true }));
vi.mock('@/hooks/useChat', () => ({
  useChat: () => ({
    messages: [], isLoading: false, error: null, conversationId: undefined, isWithLiveAgent: false,
    isClosed: false, agentInfo: null, sendMessage: vi.fn(), cancelRequest: vi.fn(), clearMessages: vi.fn(),
  }),
}));
vi.mock('@/lib/ui-text', () => ({
  useUiText: () => (_k: string, fallback: string) => fallback,
  useUiTextLanguage: () => ({ lang: 'sv', siteLang: 'sv' }),
}));
vi.mock('@/components/chat/UnifiedChat', () => ({
  UnifiedChat: ({ visitorSettings }: { visitorSettings?: { welcomeMessage?: string } }) => (
    <p data-testid="welcome">{visitorSettings?.welcomeMessage}</p>
  ),
}));
vi.mock('@/components/chat/LiveAgentIndicator', () => ({ LiveAgentIndicator: () => null }));
vi.mock('@/components/chat/ChatLeadCapture', () => ({ ChatLeadCapture: () => null }));

const block = (data: Partial<ChatBlockData>) => ({ height: 'md', variant: 'card', ...data }) as ChatBlockData;

describe('chat block opening message', () => {
  it("the block's initialPrompt is the first thing the visitor reads", () => {
    render(<ChatBlock data={block({ initialPrompt: 'Hej! Fråga mig om våra tjänster.' })} />);
    expect(screen.getByTestId('welcome').textContent).toBe('Hej! Fråga mig om våra tjänster.');
  });

  it('without one, the site-wide welcome message stands', () => {
    render(<ChatBlock data={block({ initialPrompt: '   ' })} />);
    expect(screen.getByTestId('welcome').textContent).toBe(SITE_WELCOME);
  });
});
