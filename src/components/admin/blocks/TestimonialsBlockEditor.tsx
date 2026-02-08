import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import { TestimonialsBlockData, Testimonial } from '@/types/cms';
import { MessageSquareQuote, Plus, Trash2, GripVertical, Star, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ImagePickerField } from '../ImagePickerField';

interface TestimonialsBlockEditorProps {
  data: TestimonialsBlockData;
  onChange: (data: TestimonialsBlockData) => void;
  isEditing: boolean;
}

export function TestimonialsBlockEditor({ data, onChange, isEditing }: TestimonialsBlockEditorProps) {
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const updateData = (updates: Partial<TestimonialsBlockData>) => {
    onChange({ ...data, ...updates });
  };

  const addTestimonial = () => {
    const newTestimonial: Testimonial = {
      id: `testimonial-${Date.now()}`,
      content: 'This is an amazing product! I highly recommend it.',
      author: 'John Doe',
      role: 'CEO',
      company: 'Company Inc.',
      rating: 5,
    };
    updateData({ testimonials: [...(data.testimonials || []), newTestimonial] });
    setExpandedItem(newTestimonial.id);
  };

  const updateTestimonial = (id: string, updates: Partial<Testimonial>) => {
    updateData({
      testimonials: (data.testimonials || []).map(t =>
        t.id === id ? { ...t, ...updates } : t
      ),
    });
  };

  const removeTestimonial = (id: string) => {
    updateData({
      testimonials: (data.testimonials || []).filter(t => t.id !== id),
    });
  };

  // Preview for non-editing mode
  if (!isEditing) {
    const testimonials = data.testimonials || [];
    const variant = data.variant || 'default';

    if (testimonials.length === 0) {
      return (
        <div className="p-6 text-center border-2 border-dashed rounded-lg bg-muted/30">
          <MessageSquareQuote className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No testimonials added yet</p>
        </div>
      );
    }

    return (
      <div className="py-6">
        {(data.title || data.subtitle) && (
          <div className="text-center mb-6">
            {data.title && <h3 className="text-xl font-bold">{data.title}</h3>}
            {data.subtitle && <p className="mt-1 text-sm text-muted-foreground">{data.subtitle}</p>}
          </div>
        )}
        <div className={cn(
          'grid gap-4',
          testimonials.length === 1 ? 'grid-cols-1 max-w-lg mx-auto' :
          testimonials.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
        )}>
          {testimonials.slice(0, 3).map((t) => {
            const initials = t.author?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
            return (
              <div key={t.id} className={cn(
                'p-4 rounded-lg',
                variant === 'cards' ? 'border bg-card shadow-sm' : 'bg-muted/30'
              )}>
                <MessageSquareQuote className="h-5 w-5 text-accent-foreground/20 mb-2" />
                <p className="text-xs text-muted-foreground line-clamp-3 mb-3">"{t.content}"</p>
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-accent/50 flex items-center justify-center text-[10px] font-medium text-accent-foreground">
                    {initials}
                  </div>
                  <div>
                    <p className="text-xs font-medium">{t.author}</p>
                    {t.role && <p className="text-[10px] text-muted-foreground">{t.role}</p>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {testimonials.length > 3 && (
          <p className="text-xs text-muted-foreground text-center mt-3">+{testimonials.length - 3} more</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 border rounded-lg bg-card">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <MessageSquareQuote className="h-4 w-4" />
        Testimonials Block Settings
      </div>

      {/* Header Settings */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Title</Label>
          <Input
            value={data.title || ''}
            onChange={(e) => updateData({ title: e.target.value })}
            placeholder="What Our Customers Say"
          />
        </div>

        <div className="space-y-2">
          <Label>Subtitle</Label>
          <Textarea
            value={data.subtitle || ''}
            onChange={(e) => updateData({ subtitle: e.target.value })}
            placeholder="Real feedback from real customers"
            rows={2}
          />
        </div>
      </div>

      {/* Layout Settings */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Layout</Label>
          <Select
            value={data.layout || 'grid'}
            onValueChange={(value: 'grid' | 'carousel' | 'single') => updateData({ layout: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="grid">Grid</SelectItem>
              <SelectItem value="carousel">Carousel</SelectItem>
              <SelectItem value="single">Single (Large)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {data.layout === 'grid' && (
          <div className="space-y-2">
            <Label>Columns</Label>
            <Select
              value={String(data.columns || 3)}
              onValueChange={(value) => updateData({ columns: parseInt(value) as 2 | 3 })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2">2 Columns</SelectItem>
                <SelectItem value="3">3 Columns</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label>Style</Label>
          <Select
            value={data.variant || 'cards'}
            onValueChange={(value: 'default' | 'cards' | 'minimal') => updateData({ variant: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default</SelectItem>
              <SelectItem value="cards">Cards with shadow</SelectItem>
              <SelectItem value="minimal">Minimal</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Display Options */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center justify-between p-3 border rounded-lg">
          <Label>Show Ratings</Label>
          <Switch
            checked={data.showRating !== false}
            onCheckedChange={(checked) => updateData({ showRating: checked })}
          />
        </div>
        <div className="flex items-center justify-between p-3 border rounded-lg">
          <Label>Show Avatars</Label>
          <Switch
            checked={data.showAvatar !== false}
            onCheckedChange={(checked) => updateData({ showAvatar: checked })}
          />
        </div>
      </div>

      {/* Carousel Options */}
      {data.layout === 'carousel' && (
        <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Autoplay</Label>
              <p className="text-xs text-muted-foreground">Automatically cycle through testimonials</p>
            </div>
            <Switch
              checked={data.autoplay !== false}
              onCheckedChange={(checked) => updateData({ autoplay: checked })}
            />
          </div>
          {data.autoplay !== false && (
            <div className="space-y-2">
              <Label>Autoplay Speed (seconds)</Label>
              <Input
                type="number"
                min={2}
                max={15}
                value={data.autoplaySpeed || 5}
                onChange={(e) => updateData({ autoplaySpeed: parseInt(e.target.value) || 5 })}
              />
            </div>
          )}
        </div>
      )}

      {/* Testimonials */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Testimonials</Label>
          <Button variant="outline" size="sm" onClick={addTestimonial}>
            <Plus className="h-4 w-4 mr-1" />
            Add Testimonial
          </Button>
        </div>

        <div className="space-y-3">
          {(data.testimonials || []).map((testimonial) => (
            <Card
              key={testimonial.id}
              className={cn(
                'p-4 transition-all',
                expandedItem === testimonial.id && 'bg-muted/30'
              )}
            >
              <div className="flex items-center gap-3">
                <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                <div className="flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => setExpandedItem(expandedItem === testimonial.id ? null : testimonial.id)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{testimonial.author}</span>
                      {testimonial.company && (
                        <span className="text-muted-foreground text-sm">• {testimonial.company}</span>
                      )}
                      {testimonial.rating && (
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: testimonial.rating }).map((_, i) => (
                            <Star key={i} className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => removeTestimonial(testimonial.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {expandedItem === testimonial.id && (
                <div className="mt-4 pt-4 border-t space-y-4">
                  <div className="space-y-2">
                    <Label>Testimonial Content</Label>
                    <Textarea
                      value={testimonial.content}
                      onChange={(e) => updateTestimonial(testimonial.id, { content: e.target.value })}
                      placeholder="What the customer said..."
                      rows={3}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Author Name</Label>
                      <Input
                        value={testimonial.author}
                        onChange={(e) => updateTestimonial(testimonial.id, { author: e.target.value })}
                        placeholder="John Doe"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Role/Title</Label>
                      <Input
                        value={testimonial.role || ''}
                        onChange={(e) => updateTestimonial(testimonial.id, { role: e.target.value })}
                        placeholder="CEO"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Company</Label>
                    <Input
                      value={testimonial.company || ''}
                      onChange={(e) => updateTestimonial(testimonial.id, { company: e.target.value })}
                      placeholder="Company Inc."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Rating (1-5 stars)</Label>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => updateTestimonial(testimonial.id, { rating: star })}
                          className="p-1 hover:scale-110 transition-transform"
                        >
                          <Star
                            className={cn(
                              'h-6 w-6 transition-colors',
                              star <= (testimonial.rating || 0)
                                ? 'text-yellow-500 fill-yellow-500'
                                : 'text-muted-foreground'
                            )}
                          />
                        </button>
                      ))}
                      {testimonial.rating && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-2 h-8"
                          onClick={() => updateTestimonial(testimonial.id, { rating: undefined })}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Clear
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Avatar Image (optional)</Label>
                    <ImagePickerField
                      value={testimonial.avatar || ''}
                      onChange={(url) => updateTestimonial(testimonial.id, { avatar: url })}
                    />
                  </div>
                </div>
              )}
            </Card>
          ))}

          {(data.testimonials || []).length === 0 && (
            <div className="text-center py-8 border-2 border-dashed rounded-lg bg-muted/30">
              <p className="text-muted-foreground mb-2">No testimonials yet</p>
              <Button variant="outline" size="sm" onClick={addTestimonial}>
                <Plus className="h-4 w-4 mr-1" />
                Add your first testimonial
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
