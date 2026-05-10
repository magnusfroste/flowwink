/**
 * SkillTesterSheet
 *
 * Admin tester for `ai-task:` skills (Klass 2a — context-aware AI skills).
 *
 * - Pre-fills a JSON input form from the skill's tool_definition.parameters
 * - POSTs to the `ai-task` edge function with { task, input }
 * - Renders structured output, apply result, provider used, and duration
 *
 * For non-`ai-task:` handlers we surface a hint pointing the user to FlowChat /
 * agent-execute instead — keeps this sheet focused on Klass 2a.
 */

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Play, Cpu, Lock, ExternalLink, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import type { AgentSkill } from '@/types/agent';

interface Props {
  skill: AgentSkill | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface RunResult {
  success?: boolean;
  task?: string;
  result?: unknown;
  apply?: unknown;
  provider_used?: string;
  provider_fallback?: boolean;
  error?: string;
  details?: unknown;
  raw?: unknown;
}

function placeholderForString(key: string, schema: any): string {
  if (schema?.example) return String(schema.example);
  if (schema?.format === 'uuid' || /_id$|^id$/i.test(key)) return '<uuid>';
  if (schema?.format === 'uri' || schema?.format === 'url' || /url$/i.test(key)) return 'https://example.com/path';
  if (schema?.format === 'email' || /email/i.test(key)) return 'user@example.com';
  if (schema?.format === 'date') return new Date().toISOString().slice(0, 10);
  if (schema?.format === 'date-time') return new Date().toISOString();
  if (Array.isArray(schema?.enum) && schema.enum.length) return String(schema.enum[0]);
  return `<${key}>`;
}

function buildExampleInput(skill: AgentSkill): string {
  try {
    const params: any = (skill.tool_definition as any)?.parameters;
    const props = params?.properties ?? {};
    const required: string[] = Array.isArray(params?.required) ? params.required : [];
    const example: Record<string, unknown> = {};
    // Required first, then optional
    const orderedKeys = [
      ...required.filter((k) => k in props),
      ...Object.keys(props).filter((k) => !required.includes(k)),
    ];
    for (const key of orderedKeys) {
      const schema = props[key];
      if (key === 'action' && Array.isArray(schema?.enum) && schema.enum.length === 1) {
        example[key] = schema.enum[0];
        continue;
      }
      const t = schema?.type;
      if (t === 'string') example[key] = placeholderForString(key, schema);
      else if (t === 'number' || t === 'integer') example[key] = schema?.example ?? 0;
      else if (t === 'boolean') example[key] = schema?.example ?? false;
      else if (t === 'array') example[key] = [];
      else if (t === 'object') example[key] = {};
      else example[key] = null;
    }
    return JSON.stringify(example, null, 2);
  } catch {
    return '{}';
  }
}

export function SkillTesterSheet({ skill, open, onOpenChange }: Props) {
  const isAiTask = skill?.handler?.startsWith('ai-task:') ?? false;
  const taskName = isAiTask ? skill!.handler.slice('ai-task:'.length) : '';

  const [input, setInput] = useState('{}');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  useEffect(() => {
    if (skill && open) {
      setInput(buildExampleInput(skill));
      setResult(null);
      setParseError(null);
      setElapsedMs(null);
    }
  }, [skill, open]);

  const requiredKeys = useMemo<string[]>(() => {
    try {
      const req = (skill?.tool_definition as any)?.parameters?.required;
      return Array.isArray(req) ? req : [];
    } catch {
      return [];
    }
  }, [skill]);

  async function runTest() {
    if (!skill || !isAiTask) return;
    setParseError(null);
    setResult(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(input || '{}');
    } catch (err: any) {
      setParseError(`Invalid JSON: ${err.message}`);
      return;
    }

    setRunning(true);
    const t0 = performance.now();
    try {
      // Use raw fetch so we always get the JSON body even on non-2xx (supabase.functions.invoke
      // hides the body inside FunctionsHttpError.context as a Response).
      const session = (await supabase.auth.getSession()).data.session;
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-task`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ task: taskName, input: parsed }),
        },
      );
      const dt = performance.now() - t0;
      setElapsedMs(Math.round(dt));
      const data = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
      setResult(data as RunResult);
    } catch (err: any) {
      setElapsedMs(Math.round(performance.now() - t0));
      setResult({ error: err?.message ?? 'Unknown error' });
    } finally {
      setRunning(false);
    }
  }

  if (!skill) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 flex-wrap">
            <code className="text-base font-mono">{skill.name}</code>
            {skill.mcp_exposed && (
              <Badge variant="secondary" className="text-[10px] gap-0.5">
                <Cpu className="h-2.5 w-2.5" /> MCP
              </Badge>
            )}
            {!skill.enabled && (
              <Badge variant="outline" className="text-[10px] gap-0.5">
                <Lock className="h-2.5 w-2.5" /> Disabled
              </Badge>
            )}
            {skill.trust_level && (
              <Badge variant="outline" className="text-[10px]">{skill.trust_level}</Badge>
            )}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {skill.description ?? 'No description.'}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-5">
          {/* Metadata strip */}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <Meta label="Handler" value={skill.handler} mono />
            <Meta label="Category" value={skill.category ?? '—'} />
            <Meta label="Scope" value={(skill as any).scope ?? '—'} />
            <Meta label="Trust" value={skill.trust_level ?? 'auto'} />
          </div>

          {!isAiTask ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Not an ai-task skill</AlertTitle>
              <AlertDescription className="text-xs space-y-2">
                <p>
                  Handler <code>{skill.handler}</code> is not a Klass 2a AI task. This tester
                  only runs <code>ai-task:</code> handlers. Run other skills via FlowChat or
                  the MCP endpoint.
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link to="/admin/flowchat">
                    Open FlowChat <ExternalLink className="h-3 w-3 ml-1" />
                  </Link>
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">
                    Input JSON
                    {requiredKeys.length > 0 && (
                      <span className="text-muted-foreground font-normal ml-1.5">
                        (required: {requiredKeys.join(', ')})
                      </span>
                    )}
                  </Label>
                  <code className="text-[10px] text-muted-foreground">
                    POST /ai-task → task={taskName}
                  </code>
                </div>
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  rows={8}
                  className="font-mono text-xs"
                  spellCheck={false}
                />
                {parseError && (
                  <p className="text-xs text-destructive">{parseError}</p>
                )}
              </div>

              <Button onClick={runTest} disabled={running || !skill.enabled} className="w-full gap-2">
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {running ? 'Running…' : 'Run test'}
              </Button>

              {result && <ResultPanel result={result} elapsedMs={elapsedMs} />}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded border bg-muted/30 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-xs ${mono ? 'font-mono' : ''} truncate`} title={value}>{value}</div>
    </div>
  );
}

function ResultPanel({ result, elapsedMs }: { result: RunResult; elapsedMs: number | null }) {
  const isError = !!result.error || result.success === false;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs">
        {isError ? (
          <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> Failed</Badge>
        ) : (
          <Badge className="gap-1 bg-green-600 hover:bg-green-600"><CheckCircle2 className="h-3 w-3" /> Success</Badge>
        )}
        {result.provider_used && (
          <Badge variant="outline">provider: {result.provider_used}{result.provider_fallback ? ' (fallback)' : ''}</Badge>
        )}
        {elapsedMs != null && (
          <Badge variant="outline">{elapsedMs} ms</Badge>
        )}
      </div>

      {isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription className="text-xs">{result.error ?? 'Unknown error'}</AlertDescription>
        </Alert>
      )}

      {result.result !== undefined && (
        <Section title="Structured result (LLM tool-call)">
          <JsonView value={result.result} />
        </Section>
      )}

      {result.apply !== undefined && result.apply !== null && (
        <Section title="Apply result (DB writeback)">
          <JsonView value={result.apply} />
        </Section>
      )}

      {(result.details || result.raw) && (
        <Section title="Details">
          <JsonView value={result.details ?? result.raw} />
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{title}</div>
      {children}
    </div>
  );
}

function JsonView({ value }: { value: unknown }) {
  let text = '';
  try { text = JSON.stringify(value, null, 2); } catch { text = String(value); }
  return (
    <pre className="text-[11px] font-mono bg-muted/40 border rounded p-3 overflow-x-auto max-h-72 whitespace-pre-wrap break-words">
      {text}
    </pre>
  );
}
