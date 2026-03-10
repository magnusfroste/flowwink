import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react';
import { ArrowUp, X, RotateCcw, Paperclip, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CommandPalette } from './CommandPalette';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { AgentSkill } from '@/types/agent';

const ACCEPTED_TYPES = '.md,.txt,.pdf,.csv,.json,.xml,.html,.css,.js,.ts,.tsx,.jsx,.yaml,.yml,.log,.doc,.docx';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

/** Upload file to cms-images/uploads/ and return public URL */
async function uploadToMediaHub(file: File): Promise<string | null> {
  try {
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `uploads/${timestamp}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from('cms-images')
      .upload(storagePath, file, {
        contentType: file.type || 'application/octet-stream',
      });

    if (uploadError) {
      console.warn('[ChatInput] Storage upload failed:', uploadError.message);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('cms-images')
      .getPublicUrl(storagePath);

    return publicUrl;
  } catch (err) {
    console.warn('[ChatInput] uploadToMediaHub error:', err);
    return null;
  }
}

interface AttachedFile {
  name: string;
  content: string;
  url?: string | null;
}

interface UnifiedChatInputProps {
  onSend: (message: string) => void;
  onCancel?: () => void;
  onReset?: () => void;
  isLoading?: boolean;
  placeholder?: string;
  disabled?: boolean;
  skills: AgentSkill[];
  scope: 'admin' | 'visitor';
}

export function UnifiedChatInput({
  onSend,
  onCancel,
  onReset,
  isLoading,
  placeholder = 'Message FlowPilot…',
  disabled,
  skills,
  scope,
}: UnifiedChatInputProps) {
  const [value, setValue] = useState('');
  const [showPalette, setShowPalette] = useState(false);
  const [commandFilter, setCommandFilter] = useState('');
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [value]);

  const handleSend = useCallback(() => {
    if ((!value.trim() && !attachedFile) || isLoading || disabled) return;

    let message = value.trim();
    if (attachedFile) {
      const fileBlock = `📎 **${attachedFile.name}**${attachedFile.url ? ` ([view](${attachedFile.url}))` : ''}\n\`\`\`\n${attachedFile.content.slice(0, 30000)}\n\`\`\``;
      message = message ? `${message}\n\n${fileBlock}` : fileBlock;
    }

    onSend(message);
    setValue('');
    setAttachedFile(null);
    setShowPalette(false);
    setCommandFilter('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, attachedFile, isLoading, disabled, onSend]);

  const handleCommandSelect = useCallback((command: string) => {
    const atIndex = value.lastIndexOf('@');
    const before = atIndex >= 0 ? value.slice(0, atIndex) : value;
    const newValue = `${before}@${command} `;
    setValue(newValue);
    setShowPalette(false);
    setCommandFilter('');
    textareaRef.current?.focus();
  }, [value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);

    if (atMatch) {
      setShowPalette(true);
      setCommandFilter(atMatch[1]);
    } else {
      setShowPalette(false);
      setCommandFilter('');
    }
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !showPalette) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape' && showPalette) {
      e.preventDefault();
      setShowPalette(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (file.size > MAX_FILE_SIZE) {
      toast({ title: 'File too large', description: 'Max 5 MB', variant: 'destructive' });
      return;
    }

    setIsReadingFile(true);
    try {
      const text = await readFileAsText(file);
      // Upload to MediaHub in background
      const url = await uploadToMediaHub(file);
      setAttachedFile({ name: file.name, content: text, url });
    } catch (err) {
      toast({
        title: 'Could not read file',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsReadingFile(false);
    }
  };

  return (
    <div className="relative border-t bg-background">
      {/* Command palette */}
      <CommandPalette
        open={showPalette}
        onSelect={handleCommandSelect}
        onClose={() => setShowPalette(false)}
        skills={skills}
        scope={scope}
        filter={commandFilter}
      />

      <div className="flex flex-col p-3">
        {/* Attached file pill */}
        {attachedFile && (
          <div className="px-1 pb-2">
            <div className="inline-flex items-center gap-2 text-xs bg-muted border border-border/50 rounded-lg px-2.5 py-1.5 text-muted-foreground">
              <FileText className="h-3.5 w-3.5 shrink-0 text-primary/70" />
              <span className="truncate max-w-[200px] font-medium">{attachedFile.name}</span>
              <button
                onClick={() => setAttachedFile(null)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-background hover:text-foreground transition-colors"
                aria-label="Remove file"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* Left buttons */}
          <div className="flex items-center gap-1 shrink-0">
            {onReset && scope === 'admin' && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onReset}
                className="h-9 w-9 rounded-full"
                title="Clear conversation"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}

            {scope === 'admin' && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading || isReadingFile || disabled}
                  className="h-9 w-9 rounded-full"
                  title="Attach file"
                >
                  {isReadingFile ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Paperclip className="h-4 w-4" />
                  )}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_TYPES}
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </>
            )}
          </div>

          {/* Textarea */}
          <div className="relative flex-1">
            <Textarea
              ref={textareaRef}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled || isLoading || isReadingFile}
              className={cn(
                'min-h-[40px] max-h-[150px] resize-none',
                'rounded-2xl border-muted-foreground/20 pr-12',
                'focus-visible:ring-1 focus-visible:ring-primary',
                'text-sm'
              )}
              rows={1}
            />

            <div className="absolute right-2 bottom-1.5">
              {isLoading && onCancel ? (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={onCancel}
                  className="h-8 w-8 rounded-full"
                  title="Cancel"
                >
                  <X className="h-4 w-4 text-destructive" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={(!value.trim() && !attachedFile) || disabled}
                  className="h-8 w-8 rounded-full"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* @ hint */}
        {scope === 'admin' && !showPalette && !value && (
          <div className="px-1 pt-1">
            <span className="text-[11px] text-muted-foreground/50">
              Type <kbd className="px-1 py-0.5 rounded bg-muted text-muted-foreground text-[10px] font-mono">@</kbd> for commands
            </span>
          </div>
        )}
      </div>
    </div>
  );
}