import { useNavigate } from 'react-router-dom';
import { Rocket, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SeoHead } from '@/components/public/SeoHead';
import { useBrandingSettings } from '@/hooks/useSiteSettings';

export function ComingSoonPage() {
  const navigate = useNavigate();
  const { data: branding } = useBrandingSettings();
  
  const siteName = branding?.organizationName || 'Our Website';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <SeoHead title="Coming Soon" noIndex />
      <div className="text-center max-w-md px-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6">
          <Rocket className="h-8 w-8 text-primary" />
        </div>
        <h1 className="font-serif text-3xl font-bold mb-4">
          {siteName}
        </h1>
        <p className="text-muted-foreground mb-2">
          Coming Soon
        </p>
        <p className="text-sm text-muted-foreground mb-8">
          We're working on something great. Check back soon!
        </p>
        <Button 
          variant="outline" 
          onClick={() => navigate('/auth')} 
          size="sm"
          className="gap-2"
        >
          Administrator Login
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
