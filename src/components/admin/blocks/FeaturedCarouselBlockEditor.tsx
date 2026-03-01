import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Plus, Trash2, GripVertical, Image as ImageIcon } from 'lucide-react';
import type { FeaturedCarouselBlockData, CarouselSlide } from '@/components/public/blocks/FeaturedCarouselBlock';

interface Props {
  data: FeaturedCarouselBlockData;
  onChange: (data: FeaturedCarouselBlockData) => void;
  isEditing: boolean;
}

export function FeaturedCarouselBlockEditor({ data, onChange, isEditing }: Props) {
  if (!isEditing) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="font-medium">Featured Carousel</p>
        <p className="text-sm">{data.slides?.length || 0} slides · {data.autoPlay !== false ? 'Auto-play' : 'Manual'}</p>
      </div>
    );
  }

  const updateSlide = (index: number, updates: Partial<CarouselSlide>) => {
    const newSlides = [...(data.slides || [])];
    newSlides[index] = { ...newSlides[index], ...updates };
    onChange({ ...data, slides: newSlides });
  };

  const addSlide = () => {
    const slide: CarouselSlide = {
      id: `slide-${Date.now()}`,
      title: 'New Slide',
      subtitle: 'SUBTITLE',
      description: 'Add a compelling description here.',
      image: '',
      ctaLabel: 'Learn More',
      ctaUrl: '#',
      ctaVariant: 'primary',
      textPosition: 'left',
      overlayOpacity: 40,
    };
    onChange({ ...data, slides: [...(data.slides || []), slide] });
  };

  const removeSlide = (index: number) => {
    const newSlides = [...(data.slides || [])];
    newSlides.splice(index, 1);
    onChange({ ...data, slides: newSlides });
  };

  return (
    <div className="space-y-6 p-4">
      {/* Carousel Settings */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Height</Label>
          <Select
            value={data.height || 'md'}
            onValueChange={(v) => onChange({ ...data, height: v as FeaturedCarouselBlockData['height'] })}
          >
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sm">Small (360px)</SelectItem>
              <SelectItem value="md">Medium (520px)</SelectItem>
              <SelectItem value="lg">Large (680px)</SelectItem>
              <SelectItem value="full">Full Screen</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Transition</Label>
          <Select
            value={data.transition || 'fade'}
            onValueChange={(v) => onChange({ ...data, transition: v as 'fade' | 'slide' })}
          >
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="fade">Fade</SelectItem>
              <SelectItem value="slide">Slide</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Auto-play</Label>
          <Switch checked={data.autoPlay !== false} onCheckedChange={(v) => onChange({ ...data, autoPlay: v })} />
        </div>
        {data.autoPlay !== false && (
          <div>
            <Label className="text-xs">Interval ({((data.interval || 5000) / 1000).toFixed(1)}s)</Label>
            <Slider
              value={[data.interval || 5000]}
              onValueChange={([v]) => onChange({ ...data, interval: v })}
              min={2000}
              max={10000}
              step={500}
              className="mt-2"
            />
          </div>
        )}
        <div className="flex items-center justify-between">
          <Label className="text-xs">Show Arrows</Label>
          <Switch checked={data.showArrows !== false} onCheckedChange={(v) => onChange({ ...data, showArrows: v })} />
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-xs">Show Dots</Label>
          <Switch checked={data.showDots !== false} onCheckedChange={(v) => onChange({ ...data, showDots: v })} />
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-xs">Pause on Hover</Label>
          <Switch checked={data.pauseOnHover !== false} onCheckedChange={(v) => onChange({ ...data, pauseOnHover: v })} />
        </div>
      </div>

      {/* Slides */}
      <div>
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">
          Slides ({(data.slides || []).length})
        </Label>
        <Accordion type="single" collapsible className="space-y-2">
          {(data.slides || []).map((slide, index) => (
            <AccordionItem key={slide.id} value={slide.id} className="border rounded-lg px-3">
              <AccordionTrigger className="py-2 text-sm hover:no-underline">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium truncate max-w-[180px]">{slide.title || `Slide ${index + 1}`}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pb-3">
                <div>
                  <Label className="text-xs">Image URL</Label>
                  <Input value={slide.image} onChange={(e) => updateSlide(index, { image: e.target.value })} placeholder="https://..." className="h-8 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Subtitle</Label>
                    <Input value={slide.subtitle || ''} onChange={(e) => updateSlide(index, { subtitle: e.target.value })} className="h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">Text Position</Label>
                    <Select value={slide.textPosition || 'left'} onValueChange={(v) => updateSlide(index, { textPosition: v as CarouselSlide['textPosition'] })}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="left">Left</SelectItem>
                        <SelectItem value="center">Center</SelectItem>
                        <SelectItem value="right">Right</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Title</Label>
                  <Input value={slide.title} onChange={(e) => updateSlide(index, { title: e.target.value })} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Description</Label>
                  <Textarea value={slide.description || ''} onChange={(e) => updateSlide(index, { description: e.target.value })} className="text-sm min-h-[60px]" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">CTA Label</Label>
                    <Input value={slide.ctaLabel || ''} onChange={(e) => updateSlide(index, { ctaLabel: e.target.value })} className="h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">CTA URL</Label>
                    <Input value={slide.ctaUrl || ''} onChange={(e) => updateSlide(index, { ctaUrl: e.target.value })} className="h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">CTA Style</Label>
                    <Select value={slide.ctaVariant || 'primary'} onValueChange={(v) => updateSlide(index, { ctaVariant: v as CarouselSlide['ctaVariant'] })}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="primary">Primary</SelectItem>
                        <SelectItem value="secondary">Secondary</SelectItem>
                        <SelectItem value="outline">Outline</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Overlay Opacity ({slide.overlayOpacity ?? 40}%)</Label>
                  <Slider
                    value={[slide.overlayOpacity ?? 40]}
                    onValueChange={([v]) => updateSlide(index, { overlayOpacity: v })}
                    min={0} max={80} step={5}
                    className="mt-2"
                  />
                </div>
                <Button variant="ghost" size="sm" onClick={() => removeSlide(index)} className="text-destructive hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                </Button>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        <Button variant="outline" size="sm" onClick={addSlide} className="w-full mt-3 border-dashed">
          <Plus className="h-4 w-4 mr-2" /> Add Slide
        </Button>
      </div>
    </div>
  );
}
