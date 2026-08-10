import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShieldCheck, ShieldOff, Ban } from 'lucide-react';
import {
  useEmailAllowlist, useUpdateEmailAllowlist, useWithheldEmails, type EmailAllowlist,
} from '@/hooks/useEmailAllowlist';

/**
 * "Not live yet" — the outbound guard, shown as a state the instance is in
 * rather than as a settings checkbox.
 *
 * The panel deliberately leads with CONSEQUENCE, not configuration: how many
 * sends were held and which ones. The anxiety this answers is not "is it on?"
 * but "what did it stop, and am I still hiding?". And the dangerous mistake is
 * the opposite of the one the guard prevents — going live with it still on, so
 * invoices quietly never arrive — which is why the count is the loudest thing
 * here and "Go live" is a single obvious action.
 */
const EMPTY: EmailAllowlist = { enabled: false, domains: [], addresses: [], scope: 'customer_facing' };

export function OutboundGuardPanel() {
  const { data, isLoading } = useEmailAllowlist();
  const { data: withheld } = useWithheldEmails();
  const save = useUpdateEmailAllowlist();

  const [draft, setDraft] = useState<EmailAllowlist>(EMPTY);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (data) { setDraft(data); setDirty(false); } }, [data]);

  if (isLoading) return null;

  const on = draft.enabled;
  const list = [...draft.domains.map((d) => `*@${d}`), ...draft.addresses];
  const edit = (patch: Partial<EmailAllowlist>) => { setDraft({ ...draft, ...patch }); setDirty(true); };

  return (
    <Card className={on ? 'border-warning/40' : undefined}>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {on ? <ShieldCheck className="h-4 w-4 text-warning" /> : <ShieldOff className="h-4 w-4 text-muted-foreground" />}
          {on ? 'This instance is not live yet' : 'Outbound guard'}
          {on && <Badge variant="outline" className="text-warning border-warning/40">holding mail</Badge>}
        </CardTitle>
        <CardDescription>
          {on
            ? 'Mail to anyone outside the list below is withheld, so you can rehearse a real process on real data without reaching a customer. Turn this off when you go live.'
            : 'Off. Every outbound mail leaves this instance normally. Turn it on while rehearsing on real data so a test cannot reach a customer.'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Consequence first: what the guard actually stopped. */}
        {(withheld?.total ?? 0) > 0 && (
          <div className="rounded-md border bg-muted/40 p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Ban className="h-4 w-4 text-muted-foreground" />
              {withheld!.total} {withheld!.total === 1 ? 'send was' : 'sends were'} held back
            </div>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {withheld!.rows.map((r) => (
                <li key={r.id} className="flex gap-2">
                  <span className="font-mono shrink-0">{new Date(r.created_at).toISOString().slice(0, 10)}</span>
                  <span className="truncate">{r.recipient}</span>
                  <span className="ml-auto shrink-0 opacity-70">{r.source ?? '—'}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              These were never sent. Nothing is queued — they are not delivered when the guard is turned off.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
          <div>
            <Label className="text-sm">Hold outbound mail</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {on ? 'On — only the recipients below receive mail.' : 'Off — this instance mails anyone.'}
            </p>
          </div>
          <Switch checked={on} onCheckedChange={(v) => edit({ enabled: v })} />
        </div>

        {on && (
          <>
            <div className="space-y-1.5">
              <Label className="text-sm">What it covers</Label>
              <Select value={draft.scope ?? 'all'} onValueChange={(v) => edit({ scope: v as EmailAllowlist['scope'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer_facing">Customer mail only</SelectItem>
                  <SelectItem value="all">Everything</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {(draft.scope ?? 'all') === 'customer_facing'
                  ? 'Invoices, quotes, reminders and anything else aimed at a customer. Colleague invitations still go out — the risk this guard exists for is mailing a customer, and blocking your own team trains people to switch it off.'
                  : 'Every send, including invitations to your own colleagues.'}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Who may receive</Label>
              <Input
                value={draft.domains.join(', ')}
                placeholder="yourcompany.com, yourcompany.eu"
                onChange={(e) => edit({
                  domains: e.target.value.split(',').map((d) => d.trim().replace(/^@/, '')).filter(Boolean),
                })}
              />
              <Input
                value={draft.addresses.join(', ')}
                placeholder="one.person@example.com (optional)"
                onChange={(e) => edit({
                  addresses: e.target.value.split(',').map((a) => a.trim()).filter(Boolean),
                })}
              />
              <p className="text-xs text-muted-foreground">
                A domain you own with catch-all is the best target: address a test customer at
                anything@yourdomain and the mail lands in your own inbox. A subdomain is not the
                domain — mail.example.com and example.com are different mailboxes.
              </p>
              {list.length === 0 && (
                <p className="text-xs text-destructive">
                  Nobody is listed, so every send is withheld. That is a valid setting — and rarely what anyone means.
                </p>
              )}
            </div>
          </>
        )}

        <div className="flex items-center gap-2">
          <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate(draft)}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
          {on && (
            <Button
              size="sm"
              variant="outline"
              disabled={save.isPending}
              onClick={() => save.mutate({ ...draft, enabled: false })}
            >
              Go live — stop holding mail
            </Button>
          )}
          {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
        </div>
      </CardContent>
    </Card>
  );
}
