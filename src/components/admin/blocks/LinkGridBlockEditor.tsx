import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconPicker } from '@/components/admin/IconPicker';
import { LinkGridBlockData } from '@/types/cms';
import { Plus, Trash2, ExternalLink, icons } from 'lucide-react';

interface LinkGridBlockEditorProps {
  data: LinkGridBlockData;
  isEditing: boolean;
  onChange: (data: LinkGridBlockData) => void;
}

export function LinkGridBlockEditor({ data, isEditing, onChange }: LinkGridBlockEditorProps) {
  const [links, setLinks] = useState(data.links || []);
  const [columns, setColumns] = useState(data.columns || 3);

  const handleAddLink = () => {
    const newLinks = [...links, { icon: 'ArrowRight', title: '', description: '', url: '' }];
    setLinks(newLinks);
    onChange({ ...data, links: newLinks, columns });
  };

  const handleRemoveLink = (index: number) => {
    const newLinks = links.filter((_, i) => i !== index);
    setLinks(newLinks);
    onChange({ ...data, links: newLinks, columns });
  };

  const handleLinkChange = (index: number, field: keyof typeof links[0], value: string) => {
    const newLinks = links.map((link, i) => 
      i === index ? { ...link, [field]: value } : link
    );
    setLinks(newLinks);
    onChange({ ...data, links: newLinks, columns });
  };

  const handleColumnsChange = (value: string) => {
    const cols = parseInt(value) as 2 | 3 | 4;
    setColumns(cols);
    onChange({ ...data, links, columns: cols });
  };

  const renderIcon = (iconName: string) => {
    const LucideIcon = icons[iconName as keyof typeof icons];
    if (LucideIcon && typeof LucideIcon === 'function') {
      return <LucideIcon className="h-6 w-6" />;
    }
    return <ExternalLink className="h-6 w-6" />;
  };

  if (isEditing) {
    return (
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <Label>Antal kolumner</Label>
            <Select value={columns.toString()} onValueChange={handleColumnsChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2">2 kolumner</SelectItem>
                <SelectItem value="3">3 kolumner</SelectItem>
                <SelectItem value="4">4 kolumner</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-4">
          {links.map((link, index) => (
            <div key={index} className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Länk {index + 1}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveLink(index)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Ikon</Label>
                  <IconPicker
                    value={link.icon}
                    onChange={(v) => handleLinkChange(index, 'icon', v)}
                  />
                </div>
                <div>
                  <Label>Rubrik</Label>
                  <Input
                    value={link.title}
                    onChange={(e) => handleLinkChange(index, 'title', e.target.value)}
                    placeholder="Hitta hit"
                  />
                </div>
              </div>
              
              <div>
                <Label>Beskrivning (valfritt)</Label>
                <Input
                  value={link.description || ''}
                  onChange={(e) => handleLinkChange(index, 'description', e.target.value)}
                  placeholder="Kort beskrivning..."
                />
              </div>
              
              <div>
                <Label>URL</Label>
                <Input
                  value={link.url}
                  onChange={(e) => handleLinkChange(index, 'url', e.target.value)}
                  placeholder="/kontakt"
                />
              </div>
            </div>
          ))}
        </div>

        <Button variant="outline" onClick={handleAddLink} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Lägg till länk
        </Button>
      </div>
    );
  }

  // Preview mode
  const gridCols = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  };

  return (
    <div className={`grid ${gridCols[columns]} gap-4 p-6`}>
      {links.length === 0 ? (
        <div className="col-span-full text-center text-muted-foreground py-8">
          Inga länkar tillagda
        </div>
      ) : (
        links.map((link, index) => (
          <a
            key={index}
            href={link.url || '#'}
            className="group flex flex-col items-center p-6 bg-card border rounded-lg hover:border-primary hover:shadow-md transition-all text-center"
          >
            <div className="text-primary mb-3">
              {renderIcon(link.icon)}
            </div>
            <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
              {link.title || 'Rubrik'}
            </h3>
            {link.description && (
              <p className="text-sm text-muted-foreground mt-1">
                {link.description}
              </p>
            )}
          </a>
        ))
      )}
    </div>
  );
}
