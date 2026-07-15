import { Card, CardContent } from '@/components/ui/card';
import { ChatConversation } from '@/components/chat/ChatConversation';
import { useCustomerAuth } from '@/hooks/useCustomerAuth';
import { Sparkles } from 'lucide-react';

// build-marker: 2026-07-15 redeploy trigger for /account/assistant route
/**
 * Authenticated portal assistant (identity ladder rung 2). Reuses the shared
 * ChatConversation but with `authenticated` on, so the request carries the
 * signed-in customer's JWT and chat-completion grounds on their own account
 * (orders, invoices, subscriptions, tickets, bookings). No new chat engine —
 * the same one engine, one rung up.
 */
export default function AccountAssistantPage() {
  const { profile } = useCustomerAuth();
  const firstName = profile?.full_name?.split(' ')[0];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Sparkles className="h-6 w-6 text-primary" />
          Assistant
        </h1>
        <p className="text-muted-foreground">
          {firstName ? `Hi ${firstName} — ask` : 'Ask'} about your orders, invoices, subscriptions or bookings.
          The assistant sees your own account and can help you get things done.
        </p>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="h-[60vh] min-h-[420px]">
            <ChatConversation mode="block" authenticated hideInternalTitle className="h-full" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
