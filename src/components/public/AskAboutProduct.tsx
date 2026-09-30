import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIsModuleEnabled } from '@/hooks/useModules';
import { useUiText } from '@/lib/ui-text';

/**
 * The catalog's call to action: open the site chat with the question already
 * asked. The answer comes from FlowPilot, grounded in the product, the KB and
 * the pages (Law 3 — the button captures intent, it builds no pipeline).
 * Without the chat module there is nobody to ask, so the button is not drawn.
 */
export function AskAboutProduct({ productName, size = 'lg', className }: {
  productName: string;
  size?: 'sm' | 'lg' | 'default';
  className?: string;
}) {
  const chatEnabled = useIsModuleEnabled('chat');
  const t = useUiText();
  if (!chatEnabled) return null;
  const ask = () => {
    const message = t('shop.askAboutMessage', 'Tell me about {name}').replace('{name}', productName);
    window.dispatchEvent(new CustomEvent('open-chat-widget', { detail: { message } }));
  };
  return (
    <Button size={size} onClick={ask} className={className}>
      <MessageCircle className="h-4 w-4 mr-2" />
      {t('shop.askAbout', 'Ask about this product')}
    </Button>
  );
}
