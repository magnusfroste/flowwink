import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BookOpen } from 'lucide-react';
import { KbPageSlugField } from './KbPageSlugField';
import type { KbHubBlockData } from '@/components/public/blocks/KbHubBlock';

interface KbHubBlockEditorProps {
  data: KbHubBlockData;
  onChange: (data: KbHubBlockData) => void;
  isEditing?: boolean;
}

export function KbHubBlockEditor({ data, onChange, isEditing }: KbHubBlockEditorProps) {
  // Preview mode
  if (!isEditing) {
    return (
      <div className="p-6 text-center border-2 border-dashed rounded-lg bg-muted/30">
        <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
        <h3 className="font-medium text-lg">{data.title || "Knowledge Hub"}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {data.layout || 'accordion'} layout
          {data.showSearch !== false && ' • with search'}
          {data.showContactCta !== false && ' • with CTA'}
        </p>
        <div className="mt-4 max-w-xs mx-auto space-y-2">
          {data.showSearch !== false && (
            <div className="h-10 rounded-md border bg-background" />
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="h-16 rounded border bg-background" />
            <div className="h-16 rounded border bg-background" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Rubrik</h4>
        
        <div className="space-y-2">
          <Label htmlFor="kb-hub-title">Titel</Label>
          <Input
            id="kb-hub-title"
            value={data.title || ''}
            onChange={(e) => onChange({ ...data, title: e.target.value })}
            placeholder="Hur kan vi hjälpa dig?"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="kb-hub-subtitle">Underrubrik</Label>
          <Textarea
            id="kb-hub-subtitle"
            value={data.subtitle || ''}
            onChange={(e) => onChange({ ...data, subtitle: e.target.value })}
            placeholder="Sök i vår kunskapsbas eller bläddra efter kategori"
            rows={2}
          />
        </div>
      </div>

      {/* Search Section */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Sök</h4>
        
        <div className="flex items-center justify-between">
          <Label htmlFor="kb-hub-show-search">Visa sökfält</Label>
          <Switch
            id="kb-hub-show-search"
            checked={data.showSearch !== false}
            onCheckedChange={(checked) => onChange({ ...data, showSearch: checked })}
          />
        </div>

        {data.showSearch !== false && (
          <div className="space-y-2">
            <Label htmlFor="kb-hub-search-placeholder">Sökfält placeholder</Label>
            <Input
              id="kb-hub-search-placeholder"
              value={data.searchPlaceholder || ''}
              onChange={(e) => onChange({ ...data, searchPlaceholder: e.target.value })}
              placeholder="Sök efter frågor eller svar..."
            />
          </div>
        )}
      </div>

      {/* Display Section */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Visning</h4>
        
        <div className="flex items-center justify-between">
          <Label htmlFor="kb-hub-show-categories">Visa kategorifilter</Label>
          <Switch
            id="kb-hub-show-categories"
            checked={data.showCategories !== false}
            onCheckedChange={(checked) => onChange({ ...data, showCategories: checked })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="kb-hub-layout">Layout</Label>
          <Select
            value={data.layout || 'accordion'}
            onValueChange={(value: 'accordion' | 'cards') => onChange({ ...data, layout: value })}
          >
            <SelectTrigger id="kb-hub-layout">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="accordion">Accordion (expanderbara frågor)</SelectItem>
              <SelectItem value="cards">Kort (klickbara länkar)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Empty State Section */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Tomt tillstånd</h4>
        
        <div className="space-y-2">
          <Label htmlFor="kb-hub-empty-title">Titel när inga resultat</Label>
          <Input
            id="kb-hub-empty-title"
            value={data.emptyStateTitle || ''}
            onChange={(e) => onChange({ ...data, emptyStateTitle: e.target.value })}
            placeholder="Inga resultat hittades"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="kb-hub-empty-subtitle">Text när inga resultat</Label>
          <Input
            id="kb-hub-empty-subtitle"
            value={data.emptyStateSubtitle || ''}
            onChange={(e) => onChange({ ...data, emptyStateSubtitle: e.target.value })}
            placeholder="Försök med andra söktermer..."
          />
        </div>
      </div>

      {/* KB Page Slug */}
      <KbPageSlugField
        id="kb-hub-page-slug"
        value={data.kbPageSlug || ''}
        onChange={(value) => onChange({ ...data, kbPageSlug: value })}
      />

      {/* Contact CTA Section */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Kontakt CTA</h4>
        
        <div className="flex items-center justify-between">
          <Label htmlFor="kb-hub-show-cta">Visa kontakt-sektion</Label>
          <Switch
            id="kb-hub-show-cta"
            checked={data.showContactCta !== false}
            onCheckedChange={(checked) => onChange({ ...data, showContactCta: checked })}
          />
        </div>

        {data.showContactCta !== false && (
          <>
            <div className="space-y-2">
              <Label htmlFor="kb-hub-contact-title">Kontakt titel</Label>
              <Input
                id="kb-hub-contact-title"
                value={data.contactTitle || ''}
                onChange={(e) => onChange({ ...data, contactTitle: e.target.value })}
                placeholder="Hittar du inte svaret?"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="kb-hub-contact-subtitle">Kontakt underrubrik</Label>
              <Input
                id="kb-hub-contact-subtitle"
                value={data.contactSubtitle || ''}
                onChange={(e) => onChange({ ...data, contactSubtitle: e.target.value })}
                placeholder="Vårt team hjälper dig gärna..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="kb-hub-contact-button">Knapptext</Label>
              <Input
                id="kb-hub-contact-button"
                value={data.contactButtonText || ''}
                onChange={(e) => onChange({ ...data, contactButtonText: e.target.value })}
                placeholder="Kontakta oss"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="kb-hub-contact-link">Kontaktlänk</Label>
              <Input
                id="kb-hub-contact-link"
                value={data.contactLink || ''}
                onChange={(e) => onChange({ ...data, contactLink: e.target.value })}
                placeholder="/kontakt"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
