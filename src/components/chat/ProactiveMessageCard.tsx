/**
 * ProactiveMessageCard
 * 
 * Renders rich cards for FlowPilot proactive messages in the chat stream.
 * Supports briefings, HIL approvals, and general notifications with
 * deep-link action buttons.
 */

import { useState } from 'react';
import { Bot, Sparkles, ArrowRight, Check, X, Loader2, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { safeHref } from '@/lib/safe-url';
import ReactMarkdown from 'react-markdown';

export interface ActionButton {
  label: string;
  link?: string;
  action?: 'approve' | 'reject' | 'preview' | 'navigate';
  variant?: 'default' | 'outline' | 'ghost' | 'destructive';
  skill?: string;
  skillArgs?: Record<string, unknown>;
  activityId?: string;
}

export interface ProactivePayload {
  type: 'briefing' | 'approval' | 'alert' | 'update';
  title?: string;
  healthScore?: number;
  metrics?: Array<{ label: string; value: string | number }>;
  actions?: ActionButton[];
  activityId?: string;
  skillName?: string;
  previewLink?: string;
}

interface ProactiveMessageCardProps {
  content: string;
  payload: ProactivePayload;
  createdAt?: string;
  onAction?: (action: ActionButton) => void;
  onApprove?: (activityId: string) => Promise<void>;
  onReject?: (activityId: string) => Promise<void>;
}

function HealthBadge({ score }: { score: number }) {
  const color = score >= 75 ? 'text-emerald-500' : score >= 50 ? 'text-amber-500' : 'text-destructive';
  const bg = score >= 75 ? 'bg-emerald-500/10' : score >= 50 ? 'bg-amber-500/10' : 'bg-destructive/10';
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', bg, color)}>
      <Sparkles className="h-3 w-3" />
      {score}/100
    </span>
  );
}

const typeConfig = {
  briefing: { emoji: '☀️', label: 'Briefing', badgeVariant: 'secondary' as const },
  approval: { emoji: '📝', label: 'Needs Approval', badgeVariant: 'default' as const },
  alert: { emoji: '⚠️', label: 'Alert', badgeVariant: 'destructive' as const },
  update: { emoji: '🤖', label: 'Update', badgeVariant: 'secondary' as const },
};

export function ProactiveMessageCard({ content, payload, createdAt, onAction, onApprove, onReject }: ProactiveMessageCardProps) {
  const navigate = useNavigate();
  const [actionState, setActionState] = useState<'idle' | 'approving' | 'rejecting' | 'approved' | 'rejected'>('idle');

  const config = typeConfig[payload.type] || typeConfig.update;

  const handleAction = async (btn: ActionButton) => {
    // HIL approve/reject
    if (btn.action === 'approve' && (btn.activityId || payload.activityId)) {
      setActionState('approving');
      try {
        await onApprove?.(btn.activityId || payload.activityId!);
        setActionState('approved');
      } catch {
        setActionState('idle');
      }
      return;
    }

    if (btn.action === 'reject' && (btn.activityId || payload.activityId)) {
      setActionState('rejecting');
      try {
        await onReject?.(btn.activityId || payload.activityId!);
        setActionState('rejected');
      } catch {
        setActionState('idle');
      }
      return;
    }

    // Preview — navigate
    if (btn.action === 'preview' && (btn.link || payload.previewLink)) {
      const link = safeHref(btn.link || payload.previewLink!);
      if (!link) return;
      if (link.startsWith('/')) navigate(link);
      else window.open(link, '_blank', 'noopener,noreferrer');
      return;
    }

    // Generic action callback
    if (onAction) {
      onAction(btn);
      return;
    }

    // Default: navigate
    const link = safeHref(btn.link);
    if (link) {
      if (link.startsWith('/')) navigate(link);
      else window.open(link, '_blank', 'noopener,noreferrer');
    }
  };

  const isResolved = actionState === 'approved' || actionState === 'rejected';
  const isProcessing = actionState === 'approving' || actionState === 'rejecting';

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Bot className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="text-xs font-medium text-muted-foreground">FlowPilot</span>
          {createdAt && (
            <span className="text-[10px] text-muted-foreground/60">
              {new Date(createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {payload.healthScore != null && <HealthBadge score={payload.healthScore} />}
          <Badge variant={config.badgeVariant} className="text-[10px] px-1.5 py-0">
            {config.emoji} {config.label}
          </Badge>
        </div>

        {/* Content card */}
        <div className={cn(
          'rounded-2xl bg-muted border overflow-hidden transition-colors',
          payload.type === 'approval' && !isResolved ? 'border-primary/30' : 'border-border/50',
          isResolved && 'opacity-80',
        )}>
          {payload.title && (
            <div className="px-4 pt-3 pb-1">
              <h4 className="text-sm font-semibold text-foreground">{payload.title}</h4>
            </div>
          )}

          {/* Markdown body */}
          <div className="px-4 py-2">
            <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          </div>

          {/* Inline metrics */}
          {payload.metrics && payload.metrics.length > 0 && (
            <>
              <Separator />
              <div className="px-4 py-2 flex flex-wrap gap-4">
                {payload.metrics.map((m, i) => (
                  <div key={i} className="text-center">
                    <p className="text-base font-bold text-foreground">{m.value}</p>
                    <p className="text-[10px] text-muted-foreground">{m.label}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Action buttons */}
          {!isResolved && payload.actions && payload.actions.length > 0 && (
            <>
              <Separator />
              <div className="px-4 py-2.5 flex flex-wrap gap-2">
                {payload.actions.map((btn, i) => {
                  const isApproveBtn = btn.action === 'approve';
                  const isRejectBtn = btn.action === 'reject';
                  const isPreviewBtn = btn.action === 'preview';

                  return (
                    <Button
                      key={i}
                      variant={btn.variant || (isApproveBtn ? 'default' : isRejectBtn ? 'destructive' : i === 0 ? 'default' : 'outline')}
                      size="sm"
                      className="text-xs gap-1.5"
                      disabled={isProcessing}
                      onClick={() => handleAction(btn)}
                    >
                      {isProcessing && (isApproveBtn && actionState === 'approving' || isRejectBtn && actionState === 'rejecting') ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : isApproveBtn ? (
                        <Check className="h-3 w-3" />
                      ) : isRejectBtn ? (
                        <X className="h-3 w-3" />
                      ) : isPreviewBtn ? (
                        <Eye className="h-3 w-3" />
                      ) : null}
                      {btn.label}
                      {btn.link && !isApproveBtn && !isRejectBtn && <ArrowRight className="h-3 w-3" />}
                    </Button>
                  );
                })}
              </div>
            </>
          )}

          {/* Resolved state */}
          {isResolved && (
            <>
              <Separator />
              <div className="px-4 py-2.5 flex items-center gap-2">
                {actionState === 'approved' ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-500" />
                    <span className="text-xs font-medium text-emerald-600">Approved & executed</span>
                  </>
                ) : (
                  <>
                    <X className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">Rejected</span>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
