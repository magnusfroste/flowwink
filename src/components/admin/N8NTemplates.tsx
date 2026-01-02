import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Copy, 
  ExternalLink, 
  MessageSquare, 
  Share2, 
  Mail, 
  Database,
  Bell,
  FileText,
  ShoppingCart,
  Package
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface N8NTemplate {
  id: string;
  title: string;
  description: string;
  events: string[];
  icon: React.ReactNode;
  workflow: {
    name: string;
    nodes: Array<{
      type: string;
      name: string;
      description: string;
    }>;
    webhookPath: string;
  };
}

const templates: N8NTemplate[] = [
  {
    id: 'social-media',
    title: 'Social Media Autoposter',
    description: 'Automatically publish to Twitter/X and LinkedIn when a blog post is published.',
    events: ['blog_post.published'],
    icon: <Share2 className="h-5 w-5" />,
    workflow: {
      name: 'Blog to Social Media',
      nodes: [
        { type: 'Webhook', name: 'Webhook Trigger', description: 'Receives blog_post.published event' },
        { type: 'Set', name: 'Format Content', description: 'Formats title and excerpt for social media' },
        { type: 'Twitter', name: 'Post to Twitter', description: 'Posts to Twitter/X' },
        { type: 'LinkedIn', name: 'Post to LinkedIn', description: 'Posts to LinkedIn' },
      ],
      webhookPath: '/webhook/blog-social',
    },
  },
  {
    id: 'slack-notify',
    title: 'Slack/Discord Notifications',
    description: 'Send notifications to Slack or Discord when content changes.',
    events: ['page.published', 'blog_post.published', 'form.submitted'],
    icon: <MessageSquare className="h-5 w-5" />,
    workflow: {
      name: 'CMS to Slack',
      nodes: [
        { type: 'Webhook', name: 'Webhook Trigger', description: 'Receives CMS events' },
        { type: 'Switch', name: 'Route by Event', description: 'Routes based on event type' },
        { type: 'Slack', name: 'Send to Slack', description: 'Sends formatted message to channel' },
      ],
      webhookPath: '/webhook/slack-notify',
    },
  },
  {
    id: 'crm-sync',
    title: 'CRM Integration',
    description: 'Sync form submissions to CRM systems like HubSpot or Pipedrive.',
    events: ['form.submitted'],
    icon: <Database className="h-5 w-5" />,
    workflow: {
      name: 'Form to CRM',
      nodes: [
        { type: 'Webhook', name: 'Webhook Trigger', description: 'Receives form.submitted event' },
        { type: 'Set', name: 'Map Fields', description: 'Maps form fields to CRM fields' },
        { type: 'HubSpot', name: 'Create Contact', description: 'Creates or updates contact in CRM' },
      ],
      webhookPath: '/webhook/form-crm',
    },
  },
  {
    id: 'email-notify',
    title: 'Email Notifications',
    description: 'Send emails when new subscribers sign up or forms are submitted.',
    events: ['newsletter.subscribed', 'form.submitted'],
    icon: <Mail className="h-5 w-5" />,
    workflow: {
      name: 'CMS to Email',
      nodes: [
        { type: 'Webhook', name: 'Webhook Trigger', description: 'Receives subscription/form events' },
        { type: 'Gmail/SMTP', name: 'Send Email', description: 'Sends email to admin' },
      ],
      webhookPath: '/webhook/email-notify',
    },
  },
  {
    id: 'content-backup',
    title: 'Content Backup',
    description: 'Save published content to Google Drive or Notion automatically.',
    events: ['page.published', 'blog_post.published'],
    icon: <FileText className="h-5 w-5" />,
    workflow: {
      name: 'Content Backup',
      nodes: [
        { type: 'Webhook', name: 'Webhook Trigger', description: 'Receives publish events' },
        { type: 'Google Drive', name: 'Save to Drive', description: 'Saves content as document' },
        { type: 'Notion', name: 'Create Page', description: 'Alternative: Create page in Notion' },
      ],
      webhookPath: '/webhook/content-backup',
    },
  },
  {
    id: 'push-notify',
    title: 'Push Notifications',
    description: 'Send push notifications via OneSignal when new content is published.',
    events: ['blog_post.published'],
    icon: <Bell className="h-5 w-5" />,
    workflow: {
      name: 'Blog to Push',
      nodes: [
        { type: 'Webhook', name: 'Webhook Trigger', description: 'Receives blog_post.published event' },
        { type: 'HTTP Request', name: 'OneSignal API', description: 'Calls OneSignal for push notification' },
      ],
      webhookPath: '/webhook/push-notify',
    },
  },
  {
    id: 'order-automation',
    title: 'Order Confirmation & CRM',
    description: 'Automate order confirmations, log to spreadsheet, and notify the team on new orders.',
    events: ['order.created', 'order.paid'],
    icon: <ShoppingCart className="h-5 w-5" />,
    workflow: {
      name: 'Order to Automation',
      nodes: [
        { type: 'Webhook', name: 'Webhook Trigger', description: 'Receives order.paid event' },
        { type: 'Gmail/SMTP', name: 'Send Confirmation', description: 'Sends order confirmation to customer' },
        { type: 'Google Sheets', name: 'Log Order', description: 'Logs order to spreadsheet' },
        { type: 'Slack', name: 'Notify Team', description: 'Notifies team of new order' },
      ],
      webhookPath: '/webhook/order-automation',
    },
  },
  {
    id: 'order-fulfillment',
    title: 'Order Fulfillment',
    description: 'Integrate with inventory and shipping systems for automatic delivery on paid orders.',
    events: ['order.paid'],
    icon: <Package className="h-5 w-5" />,
    workflow: {
      name: 'Order Fulfillment',
      nodes: [
        { type: 'Webhook', name: 'Webhook Trigger', description: 'Receives order.paid event' },
        { type: 'HTTP Request', name: 'Update Inventory', description: 'Updates stock in external system' },
        { type: 'Shippo/Sendcloud', name: 'Create Shipment', description: 'Creates shipping label' },
        { type: 'Email', name: 'Track Notification', description: 'Sends tracking link to customer' },
      ],
      webhookPath: '/webhook/order-fulfillment',
    },
  },
];

export function N8NTemplates() {
  const { toast } = useToast();

  const copyWebhookExample = (template: N8NTemplate) => {
    const example = {
      name: template.workflow.name,
      trigger: {
        type: 'Webhook',
        path: template.workflow.webhookPath,
        httpMethod: 'POST',
      },
      description: template.description,
      events: template.events,
    };
    
    navigator.clipboard.writeText(JSON.stringify(example, null, 2));
    toast({ title: 'Copied to clipboard', description: 'Webhook configuration copied' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">N8N Workflow Templates</h3>
          <p className="text-sm text-muted-foreground">
            Ready-made templates for common automations with N8N
          </p>
        </div>
        <Button variant="outline" asChild>
          <a 
            href="https://docs.n8n.io/workflows/build-workflows/" 
            target="_blank" 
            rel="noopener noreferrer"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            N8N Documentation
          </a>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {templates.map(template => (
          <Card key={template.id} className="flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                  {template.icon}
                </div>
                <div className="flex-1">
                  <CardTitle className="text-base">{template.title}</CardTitle>
                  <CardDescription className="mt-1">
                    {template.description}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <div className="flex flex-wrap gap-1 mb-4">
                {template.events.map(event => (
                  <Badge key={event} variant="secondary" className="text-xs">
                    {event}
                  </Badge>
                ))}
              </div>
              
              <div className="space-y-2 mb-4 flex-1">
                <p className="text-xs font-medium text-muted-foreground">Workflow steps:</p>
                <ol className="text-xs space-y-1">
                  {template.workflow.nodes.map((node, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="bg-muted rounded-full w-4 h-4 flex items-center justify-center flex-shrink-0 text-[10px]">
                        {i + 1}
                      </span>
                      <span>
                        <strong>{node.name}</strong>
                        <span className="text-muted-foreground"> - {node.description}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="pt-3 border-t flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1"
                  onClick={() => copyWebhookExample(template)}
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copy config
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  asChild
                >
                  <a 
                    href={`https://n8n.io/workflows/?search=${encodeURIComponent(template.workflow.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Find similar
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-muted/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">How to use the templates</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          <ol className="list-decimal list-inside space-y-2">
            <li>Create a new workflow in N8N</li>
            <li>Add a <strong>Webhook</strong> node as trigger</li>
            <li>Copy the webhook URL from N8N</li>
            <li>Create a new webhook here in admin with that URL</li>
            <li>Select the appropriate events (e.g. <code>blog_post.published</code>)</li>
            <li>Build out your N8N workflow with the desired nodes</li>
          </ol>
          <p className="text-muted-foreground">
            Tip: Use the "Test" button to verify the connection works before going live.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}