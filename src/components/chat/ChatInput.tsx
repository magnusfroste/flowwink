import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Send, StopCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSend: (message: string) => void;
  onCancel?: () => void;
  isLoading?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

export function ChatInput({ 
  onSend, 
  onCancel, 
  isLoading, 
  placeholder = 'Skriv ditt meddelande...',
  disabled 
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [value]);

  const handleSend = () => {
    if (!value.trim() || isLoading || disabled) return;
    onSend(value.trim());
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="relative flex items-end gap-2 p-4 bg-background border-t">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled || isLoading}
        className={cn(
          'min-h-[44px] max-h-[150px] resize-none pr-12',
          'rounded-2xl border-muted-foreground/20',
          'focus-visible:ring-1 focus-visible:ring-primary'
        )}
        rows={1}
      />
      
      <div className="absolute right-6 bottom-6">
        {isLoading ? (
          <Button 
            size="icon" 
            variant="ghost"
            onClick={onCancel}
            className="h-8 w-8 rounded-full"
          >
            <StopCircle className="h-4 w-4 text-destructive" />
          </Button>
        ) : (
          <Button 
            size="icon"
            onClick={handleSend}
            disabled={!value.trim() || disabled}
            className="h-8 w-8 rounded-full"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
