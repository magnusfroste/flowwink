import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LatestPostsBlock } from '@/components/public/blocks/LatestPostsBlock';
import type { LatestPostsBlockData } from '@/types/cms';

interface Props {
  data: LatestPostsBlockData;
  onChange: (data: LatestPostsBlockData) => void;
  canEdit: boolean;
}

export function LatestPostsBlockEditor({ data, onChange, canEdit }: Props) {
  if (!canEdit) {
    return <LatestPostsBlock data={data} />;
  }

  const update = (patch: Partial<LatestPostsBlockData>) => onChange({ ...data, ...patch });

  return (
    <div className="space-y-4 p-4 border border-dashed border-border rounded-lg bg-muted/30">
      <div className="text-sm font-medium text-muted-foreground">
        Latest Posts — auto-pulls newest published blog posts
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="lp-title">Title</Label>
          <Input
            id="lp-title"
            value={data.title || ''}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="From the blog"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lp-subtitle">Subtitle</Label>
          <Input
            id="lp-subtitle"
            value={data.subtitle || ''}
            onChange={(e) => update({ subtitle: e.target.value })}
            placeholder="Latest news and insights"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="space-y-1.5">
          <Label>Posts to show</Label>
          <Select
            value={String(data.count ?? 3)}
            onValueChange={(v) => update({ count: Number(v) as LatestPostsBlockData['count'] })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5, 6].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Columns</Label>
          <Select
            value={String(data.columns ?? 3)}
            onValueChange={(v) => update({ columns: Number(v) as LatestPostsBlockData['columns'] })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lp-cat">Category (optional)</Label>
          <Input
            id="lp-cat"
            value={data.category || ''}
            onChange={(e) => update({ category: e.target.value || undefined })}
            placeholder="news"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="lp-cta">CTA text (optional)</Label>
          <Input
            id="lp-cta"
            value={data.ctaText || ''}
            onChange={(e) => update({ ctaText: e.target.value })}
            placeholder="View all posts"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lp-cta-url">CTA URL</Label>
          <Input
            id="lp-cta-url"
            value={data.ctaUrl || ''}
            onChange={(e) => update({ ctaUrl: e.target.value })}
            placeholder="/blog"
          />
        </div>
      </div>

      <div className="flex items-center gap-6 pt-2">
        <div className="flex items-center gap-2">
          <Switch
            id="lp-excerpt"
            checked={data.showExcerpt ?? true}
            onCheckedChange={(c) => update({ showExcerpt: c })}
          />
          <Label htmlFor="lp-excerpt">Show excerpt</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="lp-date"
            checked={data.showDate ?? true}
            onCheckedChange={(c) => update({ showDate: c })}
          />
          <Label htmlFor="lp-date">Show date</Label>
        </div>
      </div>

      <div className="pt-4 border-t border-border">
        <div className="text-xs uppercase text-muted-foreground mb-2">Preview</div>
        <LatestPostsBlock data={data} />
      </div>
    </div>
  );
}
