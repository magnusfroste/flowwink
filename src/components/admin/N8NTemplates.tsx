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
    description: 'Publicera automatiskt till Twitter/X och LinkedIn när ett blogginlägg publiceras.',
    events: ['blog_post.published'],
    icon: <Share2 className="h-5 w-5" />,
    workflow: {
      name: 'Blog to Social Media',
      nodes: [
        { type: 'Webhook', name: 'Webhook Trigger', description: 'Tar emot blog_post.published event' },
        { type: 'Set', name: 'Format Content', description: 'Formaterar titel och excerpt för social media' },
        { type: 'Twitter', name: 'Post to Twitter', description: 'Postar till Twitter/X' },
        { type: 'LinkedIn', name: 'Post to LinkedIn', description: 'Postar till LinkedIn' },
      ],
      webhookPath: '/webhook/blog-social',
    },
  },
  {
    id: 'slack-notify',
    title: 'Slack/Discord Notifieringar',
    description: 'Skicka notifieringar till Slack eller Discord när innehåll ändras.',
    events: ['page.published', 'blog_post.published', 'form.submitted'],
    icon: <MessageSquare className="h-5 w-5" />,
    workflow: {
      name: 'CMS to Slack',
      nodes: [
        { type: 'Webhook', name: 'Webhook Trigger', description: 'Tar emot CMS events' },
        { type: 'Switch', name: 'Route by Event', description: 'Dirigerar baserat på event-typ' },
        { type: 'Slack', name: 'Send to Slack', description: 'Skickar formaterat meddelande till kanal' },
      ],
      webhookPath: '/webhook/slack-notify',
    },
  },
  {
    id: 'crm-sync',
    title: 'CRM-integration',
    description: 'Synka formulärinlämningar till CRM-system som HubSpot eller Pipedrive.',
    events: ['form.submitted'],
    icon: <Database className="h-5 w-5" />,
    workflow: {
      name: 'Form to CRM',
      nodes: [
        { type: 'Webhook', name: 'Webhook Trigger', description: 'Tar emot form.submitted event' },
        { type: 'Set', name: 'Map Fields', description: 'Mappar formulärfält till CRM-fält' },
        { type: 'HubSpot', name: 'Create Contact', description: 'Skapar eller uppdaterar kontakt i CRM' },
      ],
      webhookPath: '/webhook/form-crm',
    },
  },
  {
    id: 'email-notify',
    title: 'E-postnotifieringar',
    description: 'Skicka e-post när nya prenumeranter anmäler sig eller formulär skickas in.',
    events: ['newsletter.subscribed', 'form.submitted'],
    icon: <Mail className="h-5 w-5" />,
    workflow: {
      name: 'CMS to Email',
      nodes: [
        { type: 'Webhook', name: 'Webhook Trigger', description: 'Tar emot subscription/form events' },
        { type: 'Gmail/SMTP', name: 'Send Email', description: 'Skickar e-post till admin' },
      ],
      webhookPath: '/webhook/email-notify',
    },
  },
  {
    id: 'content-backup',
    title: 'Innehållsbackup',
    description: 'Spara publicerat innehåll till Google Drive eller Notion automatiskt.',
    events: ['page.published', 'blog_post.published'],
    icon: <FileText className="h-5 w-5" />,
    workflow: {
      name: 'Content Backup',
      nodes: [
        { type: 'Webhook', name: 'Webhook Trigger', description: 'Tar emot publish events' },
        { type: 'Google Drive', name: 'Save to Drive', description: 'Sparar innehåll som dokument' },
        { type: 'Notion', name: 'Create Page', description: 'Alternativ: Skapa sida i Notion' },
      ],
      webhookPath: '/webhook/content-backup',
    },
  },
  {
    id: 'push-notify',
    title: 'Push-notifieringar',
    description: 'Skicka push-notifieringar via OneSignal när nytt innehåll publiceras.',
    events: ['blog_post.published'],
    icon: <Bell className="h-5 w-5" />,
    workflow: {
      name: 'Blog to Push',
      nodes: [
        { type: 'Webhook', name: 'Webhook Trigger', description: 'Tar emot blog_post.published event' },
        { type: 'HTTP Request', name: 'OneSignal API', description: 'Anropar OneSignal för push-notis' },
      ],
      webhookPath: '/webhook/push-notify',
    },
  },
  {
    id: 'order-automation',
    title: 'Orderbekräftelse & CRM',
    description: 'Automatisera orderbekräftelser, logga till kalkylblad och notifiera teamet vid nya beställningar.',
    events: ['order.created', 'order.paid'],
    icon: <ShoppingCart className="h-5 w-5" />,
    workflow: {
      name: 'Order to Automation',
      nodes: [
        { type: 'Webhook', name: 'Webhook Trigger', description: 'Tar emot order.paid event' },
        { type: 'Gmail/SMTP', name: 'Send Confirmation', description: 'Skickar orderbekräftelse till kund' },
        { type: 'Google Sheets', name: 'Log Order', description: 'Loggar order till kalkylblad' },
        { type: 'Slack', name: 'Notify Team', description: 'Notifierar teamet om ny order' },
      ],
      webhookPath: '/webhook/order-automation',
    },
  },
  {
    id: 'order-fulfillment',
    title: 'Orderfullfilment',
    description: 'Integrera med lager- och fraktsystem vid betalda ordrar för automatisk leverans.',
    events: ['order.paid'],
    icon: <Package className="h-5 w-5" />,
    workflow: {
      name: 'Order Fulfillment',
      nodes: [
        { type: 'Webhook', name: 'Webhook Trigger', description: 'Tar emot order.paid event' },
        { type: 'HTTP Request', name: 'Update Inventory', description: 'Uppdaterar lagersaldo i externt system' },
        { type: 'Shippo/Sendcloud', name: 'Create Shipment', description: 'Skapar fraktsedel' },
        { type: 'Email', name: 'Track Notification', description: 'Skickar spårningslänk till kund' },
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
    toast({ title: 'Kopierat till urklipp', description: 'Webhook-konfiguration kopierad' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">N8N Workflow-mallar</h3>
          <p className="text-sm text-muted-foreground">
            Färdiga mallar för vanliga automationer med N8N
          </p>
        </div>
        <Button variant="outline" asChild>
          <a 
            href="https://docs.n8n.io/workflows/build-workflows/" 
            target="_blank" 
            rel="noopener noreferrer"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            N8N Dokumentation
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
                <p className="text-xs font-medium text-muted-foreground">Workflow-steg:</p>
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
                  Kopiera config
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
                    Hitta liknande
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-muted/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Så här använder du mallarna</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          <ol className="list-decimal list-inside space-y-2">
            <li>Skapa ett nytt workflow i N8N</li>
            <li>Lägg till en <strong>Webhook</strong>-nod som trigger</li>
            <li>Kopiera webhook-URL:en från N8N</li>
            <li>Skapa en ny webhook här i admin med den URL:en</li>
            <li>Välj rätt events (t.ex. <code>blog_post.published</code>)</li>
            <li>Bygg ut ditt N8N-workflow med önskade noder</li>
          </ol>
          <p className="text-muted-foreground">
            Tips: Använd "Test"-knappen för att verifiera att kopplingen fungerar innan du går live.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}