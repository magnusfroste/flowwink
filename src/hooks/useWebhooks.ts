import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type WebhookEvent = 
  | 'page.published'
  | 'page.updated'
  | 'page.deleted'
  | 'blog_post.published'
  | 'blog_post.updated'
  | 'blog_post.deleted'
  | 'form.submitted'
  | 'booking.submitted'
  | 'newsletter.subscribed'
  | 'newsletter.unsubscribed'
  | 'order.created'
  | 'order.paid'
  | 'order.cancelled'
  | 'order.refunded';

export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: WebhookEvent[];
  secret: string | null;
  is_active: boolean;
  headers: Record<string, string>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  last_triggered_at: string | null;
  failure_count: number;
}

export interface WebhookLog {
  id: string;
  webhook_id: string;
  event: WebhookEvent;
  payload: Record<string, unknown>;
  response_status: number | null;
  response_body: string | null;
  success: boolean;
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface CreateWebhookInput {
  name: string;
  url: string;
  events: WebhookEvent[];
  secret?: string;
  headers?: Record<string, string>;
}

export interface UpdateWebhookInput extends Partial<CreateWebhookInput> {
  is_active?: boolean;
}

export function useWebhooks() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const webhooksQuery = useQuery({
    queryKey: ['webhooks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webhooks')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Webhook[];
    },
  });

  const createWebhook = useMutation({
    mutationFn: async (input: CreateWebhookInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('webhooks')
        .insert({
          name: input.name,
          url: input.url,
          events: input.events,
          secret: input.secret || null,
          headers: input.headers || {},
          created_by: user?.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data as Webhook;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast({ title: 'Webhook created' });
    },
    onError: (error) => {
      toast({ 
        title: 'Error creating webhook', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const updateWebhook = useMutation({
    mutationFn: async ({ id, ...input }: UpdateWebhookInput & { id: string }) => {
      const { data, error } = await supabase
        .from('webhooks')
        .update(input)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data as Webhook;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast({ title: 'Webhook updated' });
    },
    onError: (error) => {
      toast({ 
        title: 'Error updating webhook', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const deleteWebhook = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('webhooks')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast({ title: 'Webhook deleted' });
    },
    onError: (error) => {
      toast({ 
        title: 'Error deleting webhook', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const toggleWebhook = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { data, error } = await supabase
        .from('webhooks')
        .update({ is_active })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data as Webhook;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast({ 
        title: data.is_active ? 'Webhook enabled' : 'Webhook disabled' 
      });
    },
    onError: (error) => {
      toast({ 
        title: 'Error', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const testWebhook = useMutation({
    mutationFn: async (webhook: Webhook) => {
      const testPayload = {
        event: webhook.events[0] || 'page.published',
        data: {
          id: 'test-id-123',
          title: 'Test Webhook',
          slug: 'test-webhook',
          status: 'published',
          timestamp: new Date().toISOString(),
          _test: true,
        },
      };

      const response = await supabase.functions.invoke('send-webhook', {
        body: testPayload,
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      queryClient.invalidateQueries({ queryKey: ['webhook-logs'] });
      toast({ title: 'Test sent', description: 'Check the logs for results' });
    },
    onError: (error) => {
      toast({ 
        title: 'Test failed', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const resendWebhook = useMutation({
    mutationFn: async ({ webhookId, payload }: { webhookId: string; payload: Record<string, unknown> }) => {
      // payload already contains event and data from the log
      const response = await supabase.functions.invoke('send-webhook', {
        body: payload,
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      queryClient.invalidateQueries({ queryKey: ['webhook-logs'] });
      toast({ title: 'Webhook resent', description: 'Check the logs for results' });
    },
    onError: (error) => {
      toast({ 
        title: 'Resend failed', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  return {
    webhooks: webhooksQuery.data || [],
    isLoading: webhooksQuery.isLoading,
    error: webhooksQuery.error,
    createWebhook,
    updateWebhook,
    deleteWebhook,
    toggleWebhook,
    testWebhook,
    resendWebhook,
  };
}

export function useWebhookLogs(webhookId: string | null) {
  return useQuery({
    queryKey: ['webhook-logs', webhookId],
    queryFn: async () => {
      if (!webhookId) return [];
      
      const { data, error } = await supabase
        .from('webhook_logs')
        .select('*')
        .eq('webhook_id', webhookId)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as WebhookLog[];
    },
    enabled: !!webhookId,
  });
}

// Event labels for UI
export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  'page.published': 'Page published',
  'page.updated': 'Page updated',
  'page.deleted': 'Page deleted',
  'blog_post.published': 'Blog post published',
  'blog_post.updated': 'Blog post updated',
  'blog_post.deleted': 'Blog post deleted',
  'form.submitted': 'Form submitted',
  'booking.submitted': 'Booking submitted',
  'newsletter.subscribed': 'Newsletter subscription',
  'newsletter.unsubscribed': 'Newsletter unsubscription',
  'order.created': 'Order created',
  'order.paid': 'Order paid',
  'order.cancelled': 'Order cancelled',
  'order.refunded': 'Order refunded',
};

export const WEBHOOK_EVENT_CATEGORIES = {
  'Pages': ['page.published', 'page.updated', 'page.deleted'] as WebhookEvent[],
  'Blog': ['blog_post.published', 'blog_post.updated', 'blog_post.deleted'] as WebhookEvent[],
  'Forms & Bookings': ['form.submitted', 'booking.submitted'] as WebhookEvent[],
  'Newsletter': ['newsletter.subscribed', 'newsletter.unsubscribed'] as WebhookEvent[],
  'Orders': ['order.created', 'order.paid', 'order.cancelled', 'order.refunded'] as WebhookEvent[],
};
