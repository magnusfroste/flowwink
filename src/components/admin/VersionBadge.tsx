import { ExternalLink, ArrowUpCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useVersionCheck } from '@/hooks/useVersionCheck';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const CHANGELOG_URL = 'https://github.com/magnusfroste/pezcms/blob/main/CHANGELOG.md';

export function VersionBadge() {
  const { currentVersion, latestVersion, latestReleaseUrl, hasUpdate } = useVersionCheck();

  if (hasUpdate && latestVersion) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={latestReleaseUrl || CHANGELOG_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-warning hover:text-warning/80 transition-colors group"
            >
              <ArrowUpCircle className="h-4 w-4 animate-pulse" />
              <Badge 
                variant="outline" 
                className="font-mono text-xs px-2 py-0.5 border-warning/50 text-warning group-hover:border-warning"
              >
                v{currentVersion} → v{latestVersion}
              </Badge>
              <span className="text-xs">Update available</span>
            </a>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Click to view release notes and upgrade instructions</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <a
      href={CHANGELOG_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors group"
    >
      <Badge variant="outline" className="font-mono text-xs px-2 py-0.5 group-hover:border-primary/50">
        v{currentVersion}
      </Badge>
      <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
    </a>
  );
}
