import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Send, ExternalLink, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useIntegrationStatus } from '@/hooks/useIntegrationStatus';

/**
 * Channel-level status card for Telegram on the Live Support page.
 *
 * Pure status + deep link. All provider configuration (token, webhook
 * registration, connection test) lives in /admin/integrations via the
 * shared IntegrationTestPanel.
 */
export function TelegramChannelStatus() {
  const { data: status, isLoading } = useIntegrationStatus();
  const hasKey = !!status?.integrations?.telegram;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4 text-sky-500" />
            Telegram
          </CardTitle>
          <CardDescription>
            Two-way messaging via your Telegram bot.
          </CardDescription>
        </div>
        <Badge variant="outline" className="gap-1">
          {isLoading ? (
            <><Loader2 className="h-3 w-3 animate-spin" /> Checking</>
          ) : hasKey ? (
            <><CheckCircle2 className="h-3 w-3 text-green-500" /> Connected</>
          ) : (
            <><AlertCircle className="h-3 w-3 text-amber-500" /> Not configured</>
          )}
        </Badge>
      </CardHeader>
      <CardContent>
        <Button asChild size="sm" variant="outline">
          <Link to="/admin/integrations">
            Manage integration <ExternalLink className="h-3 w-3 ml-1" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
