import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react';
import { ArrowUp, X, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CommandPalette } from './CommandPalette';
import { cn } from '@/lib/utils';
import type { AgentSkill } from '@/types/agent';

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [value]);

  const handleSend = useCallback(() => {
    if (!value.trim() || isLoading || disabled) return;
    onSend(value.trim());
    setValue('');
    setShowPalette(false);
    setCommandFilter('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, isLoading, disabled, onSend]);

  const handleCommandSelect = useCallback((command: string) => {
    // Replace the @... portion with the selected command
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

    // Detect @ command trigger
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

      <div className="flex items-end gap-2 p-3">
        {onReset && scope === 'admin' && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onReset}
            className="shrink-0 h-9 w-9 rounded-full"
            title="Clear conversation"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}

        <Textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isLoading}
          className={cn(
            'min-h-[40px] max-h-[150px] resize-none',
            'rounded-2xl border-muted-foreground/20 pr-12',
            'focus-visible:ring-1 focus-visible:ring-primary',
            'text-sm'
          )}
          rows={1}
        />

        <div className="absolute right-5 bottom-5">
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
              disabled={!value.trim() || disabled}
              className="h-8 w-8 rounded-full"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* @ hint */}
      {scope === 'admin' && !showPalette && !value && (
        <div className="px-4 pb-2 -mt-1">
          <span className="text-[11px] text-muted-foreground/50">
            Type <kbd className="px-1 py-0.5 rounded bg-muted text-muted-foreground text-[10px] font-mono">@</kbd> for commands
          </span>
        </div>
      )}
    </div>
  );
}
