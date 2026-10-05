import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useEinvoiceSettings, useUpdateEinvoiceSettings, type EinvoiceSettings } from '@/hooks/useEinvoice';

/**
 * What an e-invoice needs beyond the invoice itself: how the buyer pays
 * (bankgiro or IBAN+BIC — BG-16, required on any invoice with an amount due),
 * the instance's own Peppol id when it is not the organisationsnummer, and
 * the access point that carries the document. The legal identity (org number,
 * VAT id, address) is the company profile's — one fact, one home.
 */
export function EinvoiceSettingsCard() {
  const { data, isLoading } = useEinvoiceSettings();
  const save = useUpdateEinvoiceSettings();
  const [form, setForm] = useState<EinvoiceSettings>({});
  useEffect(() => { if (data) setForm(data); }, [data]);
  const set = <K extends keyof EinvoiceSettings>(k: K, v: string) => setForm((f) => ({ ...f, [k]: v }));

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment means</CardTitle>
          <CardDescription>A Peppol invoice with an amount due must say where to pay (BG-16). Bankgiro for Sweden; IBAN + BIC otherwise.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1"><Label>Bankgiro</Label><Input value={form.bankgiro ?? ''} onChange={(e) => set('bankgiro', e.target.value)} placeholder="123-4567" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>IBAN</Label><Input value={form.iban ?? ''} onChange={(e) => set('iban', e.target.value)} placeholder="SE35 5000 0000 0549 1000 0003" /></div>
            <div className="space-y-1"><Label>BIC</Label><Input value={form.bic ?? ''} onChange={(e) => set('bic', e.target.value)} placeholder="ESSESESS" /></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Peppol</CardTitle>
          <CardDescription>
            Your electronic address is derived from the company profile's organisationsnummer (0007) or VAT id (9955).
            Set it here only when it is something else (a GLN, 0088).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1"><Label>Own Peppol id</Label><Input value={form.peppol_id ?? ''} onChange={(e) => set('peppol_id', e.target.value)} placeholder="0007:5566778899" /></div>
          <div className="space-y-1">
            <Label>Access point URL</Label>
            <Input value={form.access_point_url ?? ''} onChange={(e) => set('access_point_url', e.target.value)} placeholder="https://ap.example.com/api/documents" />
            <p className="text-xs text-muted-foreground">
              The UBL document is POSTed here as application/xml with the secret <code>PEPPOL_AP_TOKEN</code> as bearer token.
              Empty = no access point: sends are recorded as <em>simulated</em>, never as sent.
            </p>
          </div>
          <div className="space-y-1"><Label>Access point name</Label><Input value={form.access_point_name ?? ''} onChange={(e) => set('access_point_name', e.target.value)} placeholder="e.g. Pagero, Unimaze, InExchange" /></div>
        </CardContent>
      </Card>

      <div className="lg:col-span-2">
        <Button onClick={() => save.mutate(form)} disabled={save.isPending}>Save e-invoice settings</Button>
      </div>
    </div>
  );
}
