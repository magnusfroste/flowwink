import { Link } from 'react-router-dom';
import { Info, ExternalLink } from 'lucide-react';
import { useIntegrationWarningStatus } from './IntegrationWarning';

/**
 * Sublimt diskret hint som visas när Unsplash-integration saknar API-nyckel
 * eller är avstängd. Visas inline ovanför Unsplash-sökrutan så admin förstår
 * varför inga bilder kommer fram — utan att ta över UI:t.
 */
export function UnsplashConfigHint() {
  const { shouldShowWarning, reason } = useIntegrationWarningStatus('unsplash' as never);
  // 'unsplash' isn't in the typed integration list — fall back via direct hook below.
  return shouldShowWarning ? (
    <UnsplashConfigHintInner reason={reason} />
  ) : null;
}

function UnsplashConfigHintInner({ reason }: { reason: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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
