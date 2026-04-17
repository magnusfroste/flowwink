import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  DUNNING_TEMPLATES,
  renderDunningEmail,
  type DunningTemplateKey,
} from '@/lib/email/templates';

const SAMPLE = {
  customerName: 'Alex Rivera',
  productName: 'Pro Plan',
  amountCents: 4900,
  currency: 'usd',
  failureReason: 'insufficient_funds',
  attemptCount: 3,
  updatePaymentUrl: 'https://example.com/billing',
  brandName: 'FlowWink',
  supportEmail: 'support@example.com',
};

export function DunningPreview() {
  const [active, setActive] = useState<DunningTemplateKey>('reminder');

  const rendered = useMemo(() => renderDunningEmail(active, SAMPLE), [active]);
  const meta = DUNNING_TEMPLATES.find((t) => t.key === active)!;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dunning email preview</CardTitle>
        <CardDescription>
          Preview the three templates the dunning processor sends with sample data.
          Final HTML is brand-neutral and works in all major email clients.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={active} onValueChange={(v) => setActive(v as DunningTemplateKey)}>
          <TabsList className="grid w-full grid-cols-3">
            {DUNNING_TEMPLATES.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {DUNNING_TEMPLATES.map((t) => (
            <TabsContent key={t.key} value={t.key} className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{t.description}</p>
                  <p className="mt-2 text-sm">
                    <span className="text-muted-foreground">Subject: </span>
                    <span className="font-medium">{rendered.subject}</span>
                  </p>
                </div>
                <Badge variant="outline">{meta.steps}</Badge>
              </div>
              <div className="rounded-lg border bg-muted/30 overflow-hidden">
                <iframe
                  title={`Dunning preview ${t.key}`}
                  srcDoc={rendered.html}
                  className="w-full h-[640px] bg-background"
                  sandbox=""
                />
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
