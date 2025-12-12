import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { ArticleGridBlockData } from '@/types/cms';
import { ImageUploader } from '../ImageUploader';

interface ArticleGridBlockEditorProps {
  data: ArticleGridBlockData;
  onChange: (data: ArticleGridBlockData) => void;
  canEdit: boolean;
}

export function ArticleGridBlockEditor({ data, onChange, canEdit }: ArticleGridBlockEditorProps) {
  const updateArticle = (index: number, field: keyof ArticleGridBlockData['articles'][0], value: string) => {
    const newArticles = [...data.articles];
    newArticles[index] = { ...newArticles[index], [field]: value };
    onChange({ ...data, articles: newArticles });
  };

  const addArticle = () => {
    onChange({
      ...data,
      articles: [...data.articles, { title: '', excerpt: '', url: '' }]
    });
  };

  const removeArticle = (index: number) => {
    onChange({
      ...data,
      articles: data.articles.filter((_, i) => i !== index)
    });
  };

  if (!canEdit) {
    return (
      <div className="space-y-4">
        {data.title && <h3 className="font-semibold text-lg">{data.title}</h3>}
        <div className={`grid gap-4 grid-cols-${data.columns}`}>
          {data.articles.map((article, index) => (
            <div key={index} className="border border-border rounded-lg overflow-hidden">
              {article.image && (
                <div className="aspect-video bg-muted">
                  <img src={article.image} alt={article.title} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-3">
                <p className="font-medium">{article.title || 'Ingen titel'}</p>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {article.excerpt || 'Ingen beskrivning'}
                </p>
              </div>
            </div>
          ))}
        </div>
        {data.articles.length === 0 && (
          <p className="text-muted-foreground text-sm">Inga artiklar tillagda</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="grid-title">Rubrik (valfritt)</Label>
          <Input
            id="grid-title"
            value={data.title || ''}
            onChange={(e) => onChange({ ...data, title: e.target.value })}
            placeholder="T.ex. Aktuella artiklar"
          />
        </div>
        <div>
          <Label htmlFor="grid-columns">Antal kolumner</Label>
          <Select
            value={data.columns.toString()}
            onValueChange={(value) => onChange({ ...data, columns: parseInt(value) as 2 | 3 | 4 })}
          >
            <SelectTrigger id="grid-columns">
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
        <Label>Artiklar</Label>
        {data.articles.map((article, index) => (
          <div key={index} className="border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Artikel {index + 1}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeArticle(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Titel</Label>
                <Input
                  value={article.title}
                  onChange={(e) => updateArticle(index, 'title', e.target.value)}
                  placeholder="Artikelns titel"
                />
              </div>
              <div className="col-span-2">
                <Label>Beskrivning</Label>
                <Textarea
                  value={article.excerpt}
                  onChange={(e) => updateArticle(index, 'excerpt', e.target.value)}
                  placeholder="Kort beskrivning..."
                  rows={2}
                />
              </div>
              <div>
                <Label>Länk (URL)</Label>
                <Input
                  value={article.url}
                  onChange={(e) => updateArticle(index, 'url', e.target.value)}
                  placeholder="/artiklar/min-artikel"
                />
              </div>
              <div>
                <Label>Bild</Label>
                <ImageUploader
                  value={article.image || ''}
                  onChange={(value) => updateArticle(index, 'image', value)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" onClick={addArticle} className="w-full">
        <Plus className="h-4 w-4 mr-2" />
        Lägg till artikel
      </Button>
    </div>
  );
}
