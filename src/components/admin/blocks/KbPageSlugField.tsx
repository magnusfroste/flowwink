import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface KbPageSlugFieldProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  description?: string;
}

export function KbPageSlugField({ 
  value, 
  onChange, 
  id = 'kbPageSlug',
  description = 'The slug of the KB page for article links (e.g., "help" → /help/article-slug)'
}: KbPageSlugFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>KB Page Slug</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="help"
      />
      <p className="text-xs text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
