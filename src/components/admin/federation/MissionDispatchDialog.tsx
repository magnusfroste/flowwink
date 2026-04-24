import { useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Send, Loader2, Eye, Wand2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

type MissionType = 'audit' | 'create_content' | 'analyze' | 'fix' | 'custom';
type Autonomy = 'silent' | 'report_back' | 'ask_first';
type Deliverable = 'draft' | 'published' | 'report_only' | 'pull_request';

interface Props {
  peer: { id: string; name: string } | null;
  onClose: () => void;
}

const MISSION_TYPES: { value: MissionType; label: string; hint: string }[] = [
  { value: 'audit', label: 'Audit', hint: 'Inspect and report findings' },
  { value: 'create_content', label: 'Create Content', hint: 'Produce a new artifact (post, page, copy)' },
  { value: 'analyze', label: 'Analyze', hint: 'Deep dive into data or behavior' },
  { value: 'fix', label: 'Fix / Improve', hint: 'Address an existing issue' },
  { value: 'custom', label: 'Custom', hint: 'Free-form mission' },
];

const AUTONOMY: { value: Autonomy; label: string; hint: string }[] = [
  { value: 'silent', label: 'Silent — execute and report when done', hint: 'No interim chatter' },
  { value: 'report_back', label: 'Report back via MCP', hint: 'Post each finding as it comes' },
  { value: 'ask_first', label: 'Ask before acting', hint: 'Wait for confirmation (low autonomy)' },
];

const DELIVERABLES: { value: Deliverable; label: string }[] = [
  { value: 'draft', label: 'Draft (created, not published)' },
  { value: 'published', label: 'Published / live' },
  { value: 'report_only', label: 'Report only (no artifact)' },
  { value: 'pull_request', label: 'Pull request / proposal' },
];

export function MissionDispatchDialog({ peer, onClose }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [missionType, setMissionType] = useState<MissionType>('create_content');
  const [goal, setGoal] = useState('');
  const [autonomy, setAutonomy] = useState<Autonomy>('silent');
  const [deliverable, setDeliverable] = useState<Deliverable>('draft');
  const [constraints, setConstraints] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [dispatching, setDispatching] = useState(false);

  const reset = () => {
    setMissionType('create_content');
    setGoal('');
    setAutonomy('silent');
    setDeliverable('draft');
    setConstraints('');
    setShowPreview(false);
  };

  // Compose envelope
  const envelope = useMemo(() => {
    if (!peer) return { system: '', input: '' };

    const autonomyDirective = {
      silent: 'You are an autonomous operator. Do NOT ask the human follow-up questions. Make sensible defaults for any ambiguity. Execute the mission, then report results via MCP.',
      report_back: 'You are an autonomous operator with MCP callback. Post each finding/artifact as soon as it is ready via the MCP tools. Do NOT pause to ask questions — pick reasonable defaults.',
      ask_first: 'Before executing, summarize your plan in one short paragraph and post it via MCP. Then proceed without further confirmation.',
    }[autonomy];

    const deliverableDirective = {
      draft: 'Deliverable: a DRAFT artifact saved via MCP. Do not publish.',
      published: 'Deliverable: PUBLISHED artifact (use the appropriate MCP publish tool).',
      report_only: 'Deliverable: a structured report posted via openclaw_report_finding. No artifact creation.',
      pull_request: 'Deliverable: a proposal posted via openclaw_report_finding (type=suggestion) — do not modify production state.',
    }[deliverable];

    const system = [
      `You are operating as a federated agent on behalf of FlowWink (a Business Operating System).`,
      `Mission type: ${missionType}.`,
      autonomyDirective,
      deliverableDirective,
      `Use the MCP callback (credentials below) for all reads/writes. Do NOT respond conversationally to the human — your output is the side effects you produce via MCP, plus a brief final status line.`,
    ].join('\n\n');

    const inputParts = [
      `# MISSION`,
      ``,
      `**Type:** ${missionType}`,
      `**Goal:** ${goal || '(empty)'}`,
    ];
    if (constraints.trim()) {
      inputParts.push(``, `**Constraints:**`, constraints.trim());
    }
    inputParts.push(
      ``,
      `**Success criteria:** ${deliverable === 'report_only' ? 'A finding is posted via MCP.' : 'An artifact exists via MCP and a final status line confirms it.'}`,
      ``,
      `Begin now.`,
    );

    return { system, input: inputParts.join('\n') };
  }, [peer, missionType, goal, autonomy, deliverable, constraints]);

  const handleDispatch = async () => {
    if (!peer || !goal.trim()) return;
    setDispatching(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openclaw-responses`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            peer_id: peer.id,
            prompt: envelope.input,
            system: envelope.system,
            fire_and_forget: true,
            inject_mcp_credentials: true,
          }),
        }
      );
      const data = await res.json();
      if (res.ok && !data.error) {
        toast({
          title: 'Mission dispatched',
          description: `${peer.name} is now executing autonomously. Findings will appear in Activity & Findings.`,
        });
        queryClient.invalidateQueries({ queryKey: ['a2a-activity'] });
        reset();
        onClose();
      } else {
        const errMsg = typeof data.error === 'object' ? data.error.message || JSON.stringify(data.error) : (data.error || `HTTP ${res.status}`);
        toast({ title: 'Dispatch failed', description: errMsg, variant: 'destructive' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast({ title: 'Dispatch error', description: msg, variant: 'destructive' });
    } finally {
      setDispatching(false);
    }
  };

  return (
    <Dialog open={!!peer} onOpenChange={(open) => { if (!open) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" />
            Dispatch Mission to {peer?.name}
          </DialogTitle>
          <DialogDescription>
            Compose a structured mission. The peer will execute autonomously and report back via MCP — not as a chat conversation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Mission type */}
          <div className="space-y-1.5">
            <Label>Mission Type</Label>
            <div className="grid grid-cols-5 gap-1.5">
              {MISSION_TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setMissionType(t.value)}
                  className={`text-[11px] rounded-md border px-2 py-2 text-center transition ${
                    missionType === t.value
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted/50'
                  }`}
                  title={t.hint}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {MISSION_TYPES.find(t => t.value === missionType)?.hint}
            </p>
          </div>

          {/* Goal */}
          <div className="space-y-1.5">
            <Label>Goal</Label>
            <Input
              placeholder="e.g. Create a blog post about Q1 product highlights"
              value={goal}
              onChange={e => setGoal(e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">One sentence. Be specific about what should exist when the mission is done.</p>
          </div>

          {/* Autonomy + Deliverable side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Autonomy</Label>
              <Select value={autonomy} onValueChange={(v: Autonomy) => setAutonomy(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AUTONOMY.map(a => (
                    <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Deliverable</Label>
              <Select value={deliverable} onValueChange={(v: Deliverable) => setDeliverable(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DELIVERABLES.map(d => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Constraints */}
          <div className="space-y-1.5">
            <Label>Constraints <span className="text-muted-foreground text-[10px]">(optional)</span></Label>
            <Textarea
              placeholder="e.g. Tone: confident but not salesy. Length: 600-800 words. Avoid mentioning competitors."
              value={constraints}
              onChange={e => setConstraints(e.target.value)}
              rows={3}
              className="text-xs"
            />
          </div>

          {/* Preview */}
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => setShowPreview(s => !s)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Eye className="h-3 w-3" />
              {showPreview ? 'Hide' : 'Show'} composed envelope
            </button>
            {showPreview && (
              <div className="rounded-md border bg-muted/40 p-3 space-y-2 text-[11px] font-mono">
                <div>
                  <Badge variant="outline" className="text-[9px] mb-1">SYSTEM</Badge>
                  <pre className="whitespace-pre-wrap text-muted-foreground">{envelope.system}</pre>
                </div>
                <div>
                  <Badge variant="outline" className="text-[9px] mb-1">INPUT</Badge>
                  <pre className="whitespace-pre-wrap text-muted-foreground">{envelope.input}</pre>
                </div>
                <p className="text-[10px] text-muted-foreground/70 italic pt-1 border-t">
                  + MCP callback credentials are auto-injected by the edge function.
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button onClick={handleDispatch} disabled={!goal.trim() || dispatching}>
            {dispatching ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Dispatching...</>
            ) : (
              <><Send className="h-4 w-4 mr-2" />Dispatch Mission</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
