import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const VERSION = '1.0.0-beta.1';
const CHANGELOG_URL = 'https://github.com/magnusfroste/pezcms/blob/main/CHANGELOG.md';

export function VersionBadge() {
  return (
    <a
      href={CHANGELOG_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors group"
    >
      <Badge variant="outline" className="font-mono text-xs px-2 py-0.5 group-hover:border-primary/50">
        v{VERSION}
      </Badge>
      <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
    </a>
  );
}
