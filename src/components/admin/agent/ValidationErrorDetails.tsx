import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Renders structured validation feedback returned by `agent-execute` skills.
 *
 * Skills like `log_time` return a payload of the shape:
 *   {
 *     status: "failed",
 *     error: "log_time validation failed",
 *     missing_fields: ["hours", "project_id or project_name"],
 *     invalid_fields: [{ field: "hours", reason: "must be > 0", got: 0 }],
 *     hint: "log_time create requires: action=\"create\", hours (>0, <=24), ..."
 *   }
 *
 * This component surfaces those fields in a human-friendly way so users
 * (and operators inspecting the activity feed) immediately see what to fix
 * instead of just a generic "Failed" badge.
 */

interface InvalidField {
  field: string;
  reason: string;
  got?: unknown;
}

interface AgentFailurePayload {
  status?: string;
  error?: string;
  missing_fields?: string[];
  invalid_fields?: InvalidField[];
  hint?: string;
  [k: string]: unknown;
}

interface ValidationErrorDetailsProps {
  output?: Record<string, unknown> | null;
  errorMessage?: string | null;
  className?: string;
  /** Compact mode: smaller text, no hint block. Used in dense feeds. */
  compact?: boolean;
}

function isInvalidField(v: unknown): v is InvalidField {
  return !!v && typeof v === 'object' && 'field' in (v as Record<string, unknown>) && 'reason' in (v as Record<string, unknown>);
}

function formatGot(got: unknown): string {
  if (got === undefined) return 'undefined';
  if (got === null) return 'null';
  if (got === '') return '""';
  if (typeof got === 'string') return `"${got}"`;
  try {
    return JSON.stringify(got);
  } catch {
    return String(got);
  }
}

export function hasValidationDetails(output?: Record<string, unknown> | null): boolean {
  if (!output) return false;
  const p = output as AgentFailurePayload;
  return (
    (Array.isArray(p.missing_fields) && p.missing_fields.length > 0) ||
    (Array.isArray(p.invalid_fields) && p.invalid_fields.length > 0)
  );
}

export function ValidationErrorDetails({
  output,
  errorMessage,
  className,
  compact = false,
}: ValidationErrorDetailsProps) {
  const payload = (output ?? {}) as AgentFailurePayload;
  const missing = Array.isArray(payload.missing_fields) ? payload.missing_fields : [];
  const invalid = Array.isArray(payload.invalid_fields)
    ? payload.invalid_fields.filter(isInvalidField)
    : [];
  const hint = typeof payload.hint === 'string' ? payload.hint : null;
  const headline =
    (typeof payload.error === 'string' && payload.error) ||
    errorMessage ||
    'Validation failed';

  if (!missing.length && !invalid.length && !hint) {
    // Nothing structured to show — fall back to plain error message if any.
    if (!errorMessage) return null;
    return (
      <div
        className={cn(
          'mt-1 flex items-start gap-1.5 text-xs text-destructive',
          className,
        )}
      >
        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
        <span className="break-words">{errorMessage}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'mt-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5 space-y-2',
        compact ? 'text-[11px]' : 'text-xs',
        className,
      )}
    >
      <div className="flex items-start gap-1.5 text-destructive font-medium">
        <AlertTriangle className={cn('mt-0.5 shrink-0', compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
        <span className="break-words">{headline}</span>
      </div>

      {missing.length > 0 && (
        <div>
          <p className="text-muted-foreground mb-1">Missing required:</p>
          <div className="flex flex-wrap gap-1">
            {missing.map((field) => (
              <Badge
                key={field}
                variant="outline"
                className="border-destructive/40 text-destructive font-mono text-[10px]"
              >
                {field}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {invalid.length > 0 && (
        <div>
          <p className="text-muted-foreground mb-1">Invalid values:</p>
          <ul className="space-y-1">
            {invalid.map((item, idx) => (
              <li
                key={`${item.field}-${idx}`}
                className="flex flex-wrap items-baseline gap-1.5"
              >
                <Badge
                  variant="outline"
                  className="border-destructive/40 text-destructive font-mono text-[10px]"
                >
                  {item.field}
                </Badge>
                <span className="text-foreground">{item.reason}</span>
                {'got' in item && (
                  <span className="text-muted-foreground font-mono">
                    (got <span className="text-foreground/80">{formatGot(item.got)}</span>)
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {hint && !compact && (
        <p className="text-muted-foreground italic border-t border-destructive/20 pt-1.5">
          💡 {hint}
        </p>
      )}
    </div>
  );
}
