import { Link } from 'react-router-dom';
import { Bot, FileText, Inbox, Mail, MessageSquare, Phone, UserRound } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { ProvenanceLine } from '@/components/ui/provenance-line';
import { InboundMailboxesSection } from '@/components/admin/email/InboundMailboxesSection';
import { useChatSettings, useUpdateChatSettings, defaultChatSettings, type ChatSettings } from '@/hooks/useSiteSettings';
import { useVoiceSettings, useUpdateVoiceSettings, defaultVoiceSettings } from '@/hooks/useVoice';
import { useIsIntegrationActive } from '@/hooks/useIntegrations';
import { useIsModuleEnabled } from '@/hooks/useModules';

/**
 * Routing — every inbound channel, the same three questions:
 *   1. where does it land (CRM record, ticket, lead)?
 *   2. who takes it first (FlowPilot or a person)?
 *   3. when does a person step in?
 *
 * This page owns NO setting. It is a set of lenses over the settings each
 * channel already keeps — inbound mailboxes (route_mode), the chat routing
 * mode that already governs web/Telegram/SMS/voice, the voice receptionist,
 * the form → lead ingest — put side by side so the routing of the company's
 * inbox can be read in one place, and each control writes exactly where the
 * channel's own page writes. One fact, one writer; several readers.
 */
export function RoutingLenses() {
  const { data: chat } = useChatSettings();
  const updateChat = useUpdateChatSettings();
  const { data: voice } = useVoiceSettings();
  const updateVoice = useUpdateVoiceSettings();
  const composio = useIsIntegrationActive('composio');
  const ticketsEnabled = useIsModuleEnabled('tickets');
  const voiceEnabled = useIsModuleEnabled('voice');
  const chatEnabled = useIsModuleEnabled('chat');

  const routingMode = chat?.routingMode ?? 'ai_first';
  const setRouting = (routingMode: ChatSettings['routingMode']) =>
    updateChat.mutate({ ...(chat ?? defaultChatSettings), routingMode });

  const v = voice ?? defaultVoiceSettings;
  const setVoice = (patch: Partial<typeof v>) => updateVoice.mutate({ ...v, ...patch });

  return (
    <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Email */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Mail className="h-4 w-4" /> Email</CardTitle>
              <CardDescription>
                Inbound mail lands on the contact or lead it belongs to. Per mailbox you decide whether FlowPilot
                also opens a ticket — always, only when no CRM record matches, or never.
                {!ticketsEnabled && ' (Ticket routing needs the Tickets module.)'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <InboundMailboxesSection emphasis="crm" isGmailConnected={composio.isActive} />
              <ProvenanceLine to="/admin/email?tab=sending" linkLabel="Email → Sending">
                Sending provider, from-address and tracking live with the mailboxes.
              </ProvenanceLine>
            </CardContent>
          </Card>

          {/* Chat, Telegram, SMS */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Chat, Telegram, SMS</CardTitle>
              <CardDescription>
                One policy for every conversational transport. It decides who answers first and whether a
                visitor can reach a person at all.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label>Who takes it first</Label>
                <Select value={routingMode} onValueChange={(m) => setRouting(m as ChatSettings['routingMode'])} disabled={!chatEnabled || updateChat.isPending}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ai_first">FlowPilot first — answers, escalates on demand</SelectItem>
                    <SelectItem value="human_first">Person first — straight to whoever is live, FlowPilot if nobody is</SelectItem>
                    <SelectItem value="ai_only">FlowPilot only — never escalates</SelectItem>
                    <SelectItem value="human_only">Person only — never FlowPilot, queues when nobody is live</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <UserRound className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                A person "is live" when they flip the toggle in the Inbox. Offline, the queue still fills — nothing is lost, nothing rings.
              </p>
              <ProvenanceLine to="/admin/chat?tab=advanced" linkLabel="AI Chat → Advanced">
                Same setting as the chat module's routing mode; sentiment hand-off and the live-teammate banner are configured there.
              </ProvenanceLine>
            </CardContent>
          </Card>

          {/* Voice */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Phone className="h-4 w-4" /> Calls</CardTitle>
              <CardDescription>
                Calls ring the people who are live. When nobody picks up, the receptionist can answer, take a
                message and book a callback — the same first-line FlowPilot gives every other channel.
                {!voiceEnabled && ' (Needs the Voice module.)'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label className="flex items-center gap-1.5"><Bot className="h-3.5 w-3.5" /> FlowPilot receptionist</Label>
                  <p className="text-xs text-muted-foreground">Answers when nobody is live or the ring times out.</p>
                </div>
                <Switch checked={!!v.aiReceptionistEnabled} onCheckedChange={(on) => setVoice({ aiReceptionistEnabled: on })} disabled={!voiceEnabled || updateVoice.isPending} />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label>Ring people for</Label>
                  <p className="text-xs text-muted-foreground">Seconds before the call falls through to the receptionist or voicemail.</p>
                </div>
                <Input
                  type="number" min={5} max={120} className="w-24"
                  value={v.ringTimeoutSeconds ?? 20}
                  onChange={(e) => setVoice({ ringTimeoutSeconds: Number(e.target.value) || 20 })}
                  disabled={!voiceEnabled || updateVoice.isPending}
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label>Book callbacks automatically</Label>
                  <p className="text-xs text-muted-foreground">A missed call becomes a scheduled callback in the Inbox.</p>
                </div>
                <Switch checked={!!v.autoScheduleCallbacks} onCheckedChange={(on) => setVoice({ autoScheduleCallbacks: on })} disabled={!voiceEnabled || updateVoice.isPending} />
              </div>
              <ProvenanceLine to="/admin/voice" linkLabel="Voice">
                Provider, greetings, callback windows and each person's softphone or mobile routing.
              </ProvenanceLine>
            </CardContent>
          </Card>

          {/* Forms */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Forms</CardTitle>
              <CardDescription>
                A submission that carries an email becomes a lead on the spot and appears in the Inbox as
                "needs a person" until someone marks it handled. FlowPilot's lead qualification picks it up from there.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                No policy to set here: the form block always ingests, and the notification address is configured per form.
              </p>
              <ProvenanceLine to="/admin/forms" linkLabel="Forms">
                Submissions and per-form notification addresses.
              </ProvenanceLine>
            </CardContent>
          </Card>
        </div>

        <Card className="border-dashed">
          <CardContent className="py-4 text-sm text-muted-foreground flex items-start gap-2">
            <Inbox className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Whatever these policies leave for a person shows up in one place — the{' '}
              <Link to="/admin/inbox" className="underline">Inbox</Link>, grouped as "needs a person". FlowPilot's own steps are always
              visible there too; routing decides who goes first, never who gets to see.
            </span>
          </CardContent>
        </Card>
    </div>
  );
}
