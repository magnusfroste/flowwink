import { useState } from 'react';
import { CheckCircle2, AlertCircle, ChevronDown, ChevronRight, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SkillResultCardProps {
  skill: string;
  status: 'success' | 'pending_approval' | 'error';
  result?: unknown;
}

function summarizeValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return value.length > 120 ? value.slice(0, 120) + '…' : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return 'empty array';
    const first = typeof value[0] === 'object' && value[0] !== null
      ? `${value.length} items`
      : value.map(v => String(v)).slice(0, 3).join(', ');
    return first;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as object);
    const countable = (value as any).count ?? (value as any).total ?? (value as any).length;
    if (countable != null) return `${countable} items`;
    return keys.slice(0, 4).join(', ') + (keys.length > 4 ? ` (+${keys.length - 4})` : '');
  }
  return JSON.stringify(value).slice(0, 120);
}

export function SkillResultCard({ skill, status, result }: SkillResultCardProps) {
  const [expanded, setExpanded] = useState(false);

  const label = skill.replace(/_/g, ' ');

  const isError = status === 'error' || status === 'failed' || (result && typeof result === 'object' && 'error' in (result as object));
  const errorMessage = isError
    ? (typeof result === 'object' && result !== null && 'error' in result
        ? String((result as Record<string, string>).error)
        : typeof result === 'string' ? result : null)
    : null;

  const summary = result && !isError ? summarizeValue(result) : null;

  return (
    <div className="rounded-lg border bg-card/50 overflow-hidden">
      <button
        onClick={() => result && setExpanded(!expanded)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors',
          result ? 'cursor-pointer hover:bg-accent/50' : 'cursor-default',
          isError ? 'text-destructive' : 'text-foreground'
        )}
      >
        {isError ? (
          <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
        ) : status === 'pending_approval' ? (
          <AlertCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
        )}
        <span className="font-medium truncate">{label}</span>
        {summary && (
          <span className="text-muted-foreground truncate flex-1 text-left">{summary}</span>
        )}
        {errorMessage && (
          <span className="text-destructive/80 truncate flex-1 text-left">{errorMessage}</span>
        )}
        {result && (expanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />)}
      </button>
      {expanded && result && (
        <div className="border-t px-3 py-2">
          <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap overflow-auto max-h-48">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
