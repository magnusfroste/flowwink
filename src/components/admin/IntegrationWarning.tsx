import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

interface IntegrationWarningProps {
  integration: 'resend' | 'stripe' | 'lovable_ai';
  title?: string;
  description?: string;
}

const defaultMessages = {
  resend: {
    title: 'Email integration not configured',
    description: 'Resend API key is missing. Newsletter emails, order confirmations, and booking emails will not be sent.',
  },
  stripe: {
    title: 'Payment integration not configured',
    description: 'Stripe is not configured. Payment processing and checkout functionality will not work.',
  },
  lovable_ai: {
    title: 'AI integration not configured',
    description: 'Lovable AI key is missing. AI chat functionality will not work with the cloud provider.',
  },
};

export function IntegrationWarning({ integration, title, description }: IntegrationWarningProps) {
  const defaults = defaultMessages[integration];

  return (
    <Alert variant="destructive" className="mb-6">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{title || defaults.title}</AlertTitle>
      <AlertDescription className="flex items-center justify-between">
        <span>{description || defaults.description}</span>
        <Button variant="outline" size="sm" asChild className="ml-4 shrink-0">
          <Link to="/admin/integrations">
            <ExternalLink className="h-3 w-3 mr-1" />
            Configure
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
