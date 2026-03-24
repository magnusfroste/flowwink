import { useState, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import JSON5 from 'json5';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { EditorView } from '@codemirror/view';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Settings2,
  Code2,
  List,
  Save,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  History,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

// ── CodeMirror theme (reused from CodeEditor) ────────────────────────────────

const cmTheme = EditorView.theme({
  '&': {
    fontSize: '12px',
    border: '1px solid hsl(var(--border))',
    borderRadius: 'calc(var(--radius) - 2px)',
  },
  '.cm-content': {
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    padding: '8px 0',
  },
  '.cm-line': { padding: '0 12px' },
  '&.cm-focused': {
    outline: '2px solid hsl(var(--ring))',
    outlineOffset: '-1px',
  },
  '.cm-gutters': {
    backgroundColor: 'hsl(var(--muted))',
    borderRight: '1px solid hsl(var(--border))',
    color: 'hsl(var(--muted-foreground))',
  },
  '.cm-activeLineGutter': { backgroundColor: 'hsl(var(--accent))' },
  '.cm-activeLine': { backgroundColor: 'hsl(var(--accent) / 0.3)' },
});

// ── Types ────────────────────────────────────────────────────────────────────

interface ConfigRow {
  id: string;
  key: string;
  value: Record<string, unknown>;
  updated_at: string;
}

// ── Form View (readonly key-cards) ───────────────────────────────────────────

function ConfigKeyCard({ row }: { row: ConfigRow }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center gap-2 rounded-md bg-background/60 px-3 py-2 text-left hover:bg-accent/40 transition-colors">
          {open ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
          )}
          <span className="text-xs font-mono font-medium truncate flex-1">{row.key}</span>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {Object.keys(row.value).length} keys
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="text-[11px] font-mono text-muted-foreground bg-muted/30 rounded-b-md px-3 py-2 overflow-x-auto max-h-48 whitespace-pre-wrap">
          {JSON.stringify(row.value, null, 2)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function ConfigRawEditor() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'form' | 'raw'>('form');
  const [editorValue, setEditorValue] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const { data: configRows, isLoading, refetch } = useQuery({
    queryKey: ['flowpilot-config-memory'],
    queryFn: async (): Promise<ConfigRow[]> => {
      const { data, error } = await supabase
        .from('agent_memory')
        .select('id, key, value, updated_at')
        .eq('category', 'config' as any)
        .order('key');
      if (error) throw error;
      return (data ?? []).map(row => ({
        ...row,
        value: (typeof row.value === 'object' && row.value !== null ? row.value : {}) as Record<string, unknown>,
      }));
    },
  });

  // Build the merged JSON5 blob from config rows
  const json5Blob = useMemo(() => {
    if (!configRows?.length) return '{\n  // No config keys found\n}';
    const merged: Record<string, unknown> = {};
    for (const row of configRows) {
      merged[row.key] = row.value;
    }
    return JSON5.stringify(merged, { space: 2 });
  }, [configRows]);

  // When switching to raw mode, seed the editor with current data
  const switchToRaw = useCallback(() => {
    setEditorValue(json5Blob);
    setParseError(null);
    setIsDirty(false);
    setMode('raw');
  }, [json5Blob]);

  const switchToForm = useCallback(() => {
    if (isDirty) {
      const ok = window.confirm('You have unsaved changes. Discard?');
      if (!ok) return;
    }
    setMode('form');
    setParseError(null);
    setIsDirty(false);
  }, [isDirty]);

  const handleEditorChange = useCallback((val: string) => {
    setEditorValue(val);
    setIsDirty(true);
    // Live validation
    try {
      JSON5.parse(val);
      setParseError(null);
    } catch (e: any) {
      setParseError(e.message ?? 'Invalid JSON5');
    }
  }, []);

  const handleSave = async () => {
    if (!configRows) return;

    // Parse
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON5.parse(editorValue);
    } catch (e: any) {
      setParseError(e.message ?? 'Invalid JSON5');
      toast.error('Fix syntax errors before saving');
      return;
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      setParseError('Top-level value must be an object');
      toast.error('Config must be a JSON object');
      return;
    }

    setIsSaving(true);
    try {
      // 1. Snapshot backup
      const snapshot: Record<string, unknown> = {};
      for (const row of configRows) {
        snapshot[row.key] = row.value;
      }
      const snapshotKey = `config_snapshot_${new Date().toISOString().replace(/[:.]/g, '-')}`;
      await supabase.from('agent_memory').insert({
        key: snapshotKey,
        value: snapshot as any,
        category: 'snapshot' as any,
        created_by: 'flowpilot',
      });
      logger.log('[ConfigEditor] Snapshot saved:', snapshotKey);

      // 2. Upsert each top-level key
      const existingKeys = new Set(configRows.map(r => r.key));
      const entries = Object.entries(parsed);

      for (const [key, value] of entries) {
        if (existingKeys.has(key)) {
          await supabase
            .from('agent_memory')
            .update({ value: value as any, updated_at: new Date().toISOString() })
            .eq('key', key)
            .eq('category', 'config' as any);
        } else {
          await supabase.from('agent_memory').insert({
            key,
            value: value as any,
            category: 'config' as any,
            created_by: 'flowpilot',
          });
        }
      }

      // 3. Keys removed from the blob → delete them
      for (const row of configRows) {
        if (!(row.key in parsed)) {
          await supabase.from('agent_memory').delete().eq('id', row.id);
        }
      }

      toast.success('Config saved');
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ['flowpilot-config-memory'] });
      refetch();
    } catch (err: any) {
      logger.error('[ConfigEditor] Save failed:', err);
      toast.error('Save failed: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border p-3 bg-muted/20">
        <div className="h-24 rounded bg-muted/50 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-3 bg-muted/20">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Settings2 className="h-4 w-4 text-primary" />
          Pilot Config
        </div>
        <div className="flex items-center gap-1">
          <Badge variant="outline" className="text-[10px] gap-1">
            {configRows?.length ?? 0} keys
          </Badge>
          {/* Toggle */}
          <div className="flex rounded-md border overflow-hidden ml-1">
            <button
              onClick={switchToForm}
              className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                mode === 'form'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-accent'
              }`}
            >
              <List className="h-3 w-3 inline mr-0.5" />
              Form
            </button>
            <button
              onClick={switchToRaw}
              className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                mode === 'raw'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-accent'
              }`}
            >
              <Code2 className="h-3 w-3 inline mr-0.5" />
              Raw
            </button>
          </div>
        </div>
      </div>

      {/* Form mode */}
      {mode === 'form' && (
        <div className="space-y-1">
          {configRows && configRows.length > 0 ? (
            configRows.map(row => <ConfigKeyCard key={row.id} row={row} />)
          ) : (
            <p className="text-[11px] text-muted-foreground text-center py-4">
              No config keys found. Switch to Raw mode to create configuration.
            </p>
          )}
        </div>
      )}

      {/* Raw mode */}
      {mode === 'raw' && (
        <div className="space-y-2">
          <CodeMirror
            value={editorValue}
            onChange={handleEditorChange}
            extensions={[json(), EditorView.lineWrapping]}
            theme={cmTheme}
            minHeight="200px"
            maxHeight="400px"
            basicSetup={{
              lineNumbers: true,
              highlightActiveLineGutter: true,
              highlightActiveLine: true,
              foldGutter: true,
              bracketMatching: true,
              closeBrackets: true,
              autocompletion: false,
              searchKeymap: false,
            }}
          />

          {/* Parse error */}
          {parseError && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
              <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
              <p className="text-[11px] text-destructive font-mono break-all">{parseError}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSave}
              disabled={isSaving || !!parseError || !isDirty}
              size="sm"
              className="h-7 text-xs flex-1"
            >
              {isSaving ? (
                <><RefreshCw className="h-3 w-3 mr-1.5 animate-spin" /> Saving…</>
              ) : (
                <><Save className="h-3 w-3 mr-1.5" /> Save Config</>
              )}
            </Button>
            <Button
              onClick={() => {
                setEditorValue(json5Blob);
                setParseError(null);
                setIsDirty(false);
              }}
              disabled={!isDirty}
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
            >
              Reset
            </Button>
          </div>

          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <History className="h-3 w-3" />
            A snapshot backup is created automatically before each save.
          </p>
        </div>
      )}
    </div>
  );
}
