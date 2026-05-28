import { Link } from 'react-router-dom';
import { Info, ExternalLink } from 'lucide-react';
import { useIntegrationStatus } from '@/hooks/useIntegrationStatus';
import { useIntegrations } from '@/hooks/useIntegrations';

/**
 * Sublimt diskret hint som visas när Unsplash-integrationen saknar API-nyckel
 * eller är explicit avstängd. Visas inline ovanför Unsplash-sökrutan så admin
 * förstår varför inga bilder kommer fram — utan att ta över UI:t.
 */
export function UnsplashConfigHint() {
  const { data: secretsStatus } = useIntegrationStatus();
  const { data: integrationSettings } = useIntegrations();

  const hasKey = secretsStatus?.integrations?.unsplash ?? false;
  // unsplash auto-enables when key exists unless explicitly disabled
  const explicitlyDisabled =
    (integrationSettings as { unsplash?: { enabled?: boolean } } | undefined)?.unsplash?.enabled === false;

  if (hasKey && !explicitlyDisabled) return null;
  // Wait until we actually have a response before nagging
  if (!secretsStatus) return null;

  const reason: 'not_configured' | 'disabled' = !hasKey ? 'not_configured' : 'disabled';

  return (
    <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      <Info className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1">
        {reason === 'not_configured'
          ? 'Unsplash is not configured yet — searches will return no results.'
          : 'Unsplash is disabled — enable it to search stock photos.'}
      </span>
      <Link
        to="/admin/integrations"
        className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary"
      >
        Configure
        <ExternalLink className="h-3 w-3" />
      </Link>
    </div>
  );
}
