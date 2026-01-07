import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ImagePickerField } from '../ImagePickerField';
import type { VideoHeroBlockData } from '@/components/public/blocks/VideoHeroBlock';

interface VideoHeroBlockEditorProps {
  data: VideoHeroBlockData;
  onChange: (data: VideoHeroBlockData) => void;
  isEditing: boolean;
}

export function VideoHeroBlockEditor({ data, onChange, isEditing }: VideoHeroBlockEditorProps) {
  if (!isEditing) {
    return (
      <div className="relative aspect-video max-h-[300px] rounded-lg overflow-hidden bg-muted">
        {data.posterImage ? (
          <img 
            src={data.posterImage} 
            alt="Video poster" 
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Video Hero: {data.title || 'Untitled'}</p>
          </div>
        )}
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
          <div className="text-center text-white p-4">
            <h3 className="text-xl font-bold">{data.title}</h3>
            {data.subtitle && <p className="text-sm opacity-80 mt-1">{data.subtitle}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-4">
      {/* Content Section */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
          Innehåll
        </h4>
        
        <div className="space-y-2">
          <Label>Rubrik</Label>
          <Input
            value={data.title || ''}
            onChange={(e) => onChange({ ...data, title: e.target.value })}
            placeholder="Din huvudrubrik"
          />
        </div>

        <div className="space-y-2">
          <Label>Underrubrik</Label>
          <Textarea
            value={data.subtitle || ''}
            onChange={(e) => onChange({ ...data, subtitle: e.target.value })}
            placeholder="En kort beskrivning..."
            rows={2}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Primär knapptext</Label>
            <Input
              value={data.primaryButton?.text || ''}
              onChange={(e) => onChange({ 
                ...data, 
                primaryButton: { ...data.primaryButton, text: e.target.value, url: data.primaryButton?.url || '' }
              })}
              placeholder="Kom igång"
            />
          </div>
          <div className="space-y-2">
            <Label>Primär knapplänk</Label>
            <Input
              value={data.primaryButton?.url || ''}
              onChange={(e) => onChange({ 
                ...data, 
                primaryButton: { ...data.primaryButton, url: e.target.value, text: data.primaryButton?.text || '' }
              })}
              placeholder="/contact"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Sekundär knapptext</Label>
            <Input
              value={data.secondaryButton?.text || ''}
              onChange={(e) => onChange({ 
                ...data, 
                secondaryButton: { ...data.secondaryButton, text: e.target.value, url: data.secondaryButton?.url || '' }
              })}
              placeholder="Läs mer"
            />
          </div>
          <div className="space-y-2">
            <Label>Sekundär knapplänk</Label>
            <Input
              value={data.secondaryButton?.url || ''}
              onChange={(e) => onChange({ 
                ...data, 
                secondaryButton: { ...data.secondaryButton, url: e.target.value, text: data.secondaryButton?.text || '' }
              })}
              placeholder="/about"
            />
          </div>
        </div>
      </div>

      {/* Video Section */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
          Video
        </h4>

        <div className="space-y-2">
          <Label>Videotyp</Label>
          <Select
            value={data.videoType || 'youtube'}
            onValueChange={(value: VideoHeroBlockData['videoType']) => 
              onChange({ ...data, videoType: value })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="youtube">YouTube</SelectItem>
              <SelectItem value="vimeo">Vimeo</SelectItem>
              <SelectItem value="direct">Direkt video (MP4)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>
            {data.videoType === 'direct' ? 'Video-URL (MP4)' : 'Video-URL'}
          </Label>
          <Input
            value={data.videoUrl || ''}
            onChange={(e) => onChange({ ...data, videoUrl: e.target.value })}
            placeholder={
              data.videoType === 'youtube' 
                ? 'https://www.youtube.com/watch?v=...' 
                : data.videoType === 'vimeo'
                  ? 'https://vimeo.com/...'
                  : 'https://example.com/video.mp4'
            }
          />
          <p className="text-xs text-muted-foreground">
            {data.videoType === 'youtube' && 'Stödjer youtube.com/watch?v=, youtu.be/ och youtube.com/embed/'}
            {data.videoType === 'vimeo' && 'Stödjer vimeo.com/xxxxx format'}
            {data.videoType === 'direct' && 'Direktlänk till MP4-fil'}
          </p>
        </div>

        <div className="space-y-2">
          <Label>Poster-bild (visas innan video laddas)</Label>
          <ImagePickerField
            value={data.posterImage || ''}
            onChange={(value) => onChange({ ...data, posterImage: value })}
            placeholder="Poster image URL"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Autoplay</Label>
              <p className="text-xs text-muted-foreground">Starta automatiskt</p>
            </div>
            <Switch
              checked={data.autoplay ?? true}
              onCheckedChange={(checked) => onChange({ ...data, autoplay: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Loopa</Label>
              <p className="text-xs text-muted-foreground">Upprepa videon</p>
            </div>
            <Switch
              checked={data.loop ?? true}
              onCheckedChange={(checked) => onChange({ ...data, loop: checked })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Tystad</Label>
              <p className="text-xs text-muted-foreground">Starta utan ljud</p>
            </div>
            <Switch
              checked={data.muted ?? true}
              onCheckedChange={(checked) => onChange({ ...data, muted: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Visa kontroller</Label>
              <p className="text-xs text-muted-foreground">Play/paus/volym</p>
            </div>
            <Switch
              checked={data.showControls ?? false}
              onCheckedChange={(checked) => onChange({ ...data, showControls: checked })}
            />
          </div>
        </div>
      </div>

      {/* Layout Section */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
          Layout
        </h4>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Höjd</Label>
            <Select
              value={data.heightMode || 'viewport'}
              onValueChange={(value: VideoHeroBlockData['heightMode']) => 
                onChange({ ...data, heightMode: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewport">Fullskärm (100vh)</SelectItem>
                <SelectItem value="80vh">Hög (80vh)</SelectItem>
                <SelectItem value="60vh">Medium (60vh)</SelectItem>
                <SelectItem value="auto">Auto</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Innehållsposition</Label>
            <Select
              value={data.contentAlignment || 'center'}
              onValueChange={(value: VideoHeroBlockData['contentAlignment']) => 
                onChange({ ...data, contentAlignment: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="top">Topp</SelectItem>
                <SelectItem value="center">Mitten</SelectItem>
                <SelectItem value="bottom">Botten</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Textjustering</Label>
            <Select
              value={data.textAlignment || 'center'}
              onValueChange={(value: VideoHeroBlockData['textAlignment']) => 
                onChange({ ...data, textAlignment: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Vänster</SelectItem>
                <SelectItem value="center">Centrerad</SelectItem>
                <SelectItem value="right">Höger</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Överläggsfärg</Label>
            <Select
              value={data.overlayColor || 'dark'}
              onValueChange={(value: VideoHeroBlockData['overlayColor']) => 
                onChange({ ...data, overlayColor: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dark">Mörk</SelectItem>
                <SelectItem value="light">Ljus</SelectItem>
                <SelectItem value="primary">Primärfärg</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Överläggsopacitet: {data.overlayOpacity ?? 50}%</Label>
          <Slider
            value={[data.overlayOpacity ?? 50]}
            onValueChange={([value]) => onChange({ ...data, overlayOpacity: value })}
            min={0}
            max={100}
            step={5}
          />
        </div>

        <div className="space-y-2">
          <Label>Rubrikanimation</Label>
          <Select
            value={data.titleAnimation || 'fade-in'}
            onValueChange={(value: VideoHeroBlockData['titleAnimation']) => 
              onChange({ ...data, titleAnimation: value })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Ingen</SelectItem>
              <SelectItem value="fade-in">Tona in</SelectItem>
              <SelectItem value="slide-up">Glid upp</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label>Visa scroll-indikator</Label>
            <p className="text-xs text-muted-foreground">Pil som pekar nedåt</p>
          </div>
          <Switch
            checked={data.showScrollIndicator ?? true}
            onCheckedChange={(checked) => onChange({ ...data, showScrollIndicator: checked })}
          />
        </div>
      </div>
    </div>
  );
}
