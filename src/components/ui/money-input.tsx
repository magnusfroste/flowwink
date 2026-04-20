import { forwardRef, useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * MoneyInput
 *
 * Displays a money value in major units (kronor, euros, dollars) while
 * storing it in minor units (cents/öre) on the model.
 *
 * - Empty field shows nothing (placeholder), never "0".
 * - User types kronor; component emits cents via `onChange`.
 * - Value `0` renders as empty by default (use `showZero` to override).
 *
 * Replaces the repeated pattern:
 *   value={cents/100} onChange={e => setCents(Math.round(parseFloat(e.target.value||'0')*100))}
 */
interface MoneyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** Value in cents/öre (minor units). */
  value: number | null | undefined;
  /** Receives the new value in cents/öre. Emits 0 when cleared. */
  onChange: (cents: number) => void;
  /** Currency code shown as suffix, e.g. "SEK", "EUR". Optional. */
  currency?: string;
  /** Render 0 as "0" instead of empty. Default false. */
  showZero?: boolean;
  /** Decimal step in major units. Default 1. Use 0.01 for cents precision. */
  step?: number | string;
}

export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onChange, currency, showZero = false, step = 1, className, placeholder, ...rest }, ref) => {
    // Local string state lets the user type "12.5" without us reformatting mid-edit.
    const toDisplay = (cents: number | null | undefined): string => {
      if (cents === null || cents === undefined) return '';
      if (cents === 0 && !showZero) return '';
      return (cents / 100).toString();
    };

    const [text, setText] = useState<string>(() => toDisplay(value));

    // Sync from outside (e.g. form reset, async load) without clobbering user input.
    useEffect(() => {
      const next = toDisplay(value);
      setText((prev) => {
        const prevAsCents = prev === '' ? 0 : Math.round(Number(prev) * 100);
        if (prevAsCents === (value ?? 0)) return prev;
        return next;
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setText(v);
      if (v === '' || v === '-') {
        onChange(0);
        return;
      }
      const num = Number(v);
      if (Number.isFinite(num)) {
        onChange(Math.round(num * 100));
      }
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      // Normalize on blur: "12." -> "12", "" stays ""
      if (text === '' || text === '-') {
        setText('');
      } else {
        const num = Number(text);
        if (Number.isFinite(num)) {
          setText(num === 0 && !showZero ? '' : num.toString());
        }
      }
      rest.onBlur?.(e);
    };

    const input = (
      <Input
        ref={ref}
        type="number"
        inputMode="decimal"
        step={step}
        min={rest.min ?? 0}
        value={text}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder ?? '0'}
        className={cn(currency && 'pr-14', className)}
        {...rest}
      />
    );

    if (!currency) return input;

    return (
      <div className="relative">
        {input}
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
          {currency}
        </span>
      </div>
    );
  }
);

MoneyInput.displayName = 'MoneyInput';
