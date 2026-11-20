import { CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { useUiText } from '@/lib/ui-text';

export default function NewsletterConfirmedPage() {
  const t = useUiText();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center max-w-md">
        <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-6">
          <CheckCircle className="h-8 w-8 text-success" />
        </div>
        <h1 className="text-2xl font-bold mb-2">{t('newsletter.confirmed.title', 'Subscription confirmed!')}</h1>
        <p className="text-muted-foreground mb-6">
          {t('newsletter.confirmed.body', 'Thank you for confirming your email. You are now subscribed to our newsletter.')}
        </p>
        <Button asChild>
          <Link to="/">{t('newsletter.confirmed.home', 'Back to the homepage')}</Link>
        </Button>
      </div>
    </div>
  );
}
