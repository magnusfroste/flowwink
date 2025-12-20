import { useState, useRef, useCallback } from 'react';
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Loader2, Crop as CropIcon, SlidersHorizontal, RotateCcw, ChevronDown, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImageCropperProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  onCropComplete: (croppedImageBlob: Blob) => void;
  onSkip?: () => void;
}

type AspectRatioOption = 'free' | '16:9' | '4:3' | '1:1' | '3:2' | '2:3';

interface ImageAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  sepia: number;
  grayscale: number;
  hueRotate: number;
}

interface FilterPreset {
  id: string;
  name: string;
  adjustments: Partial<ImageAdjustments>;
  description: string;
}

const defaultAdjustments: ImageAdjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  sepia: 0,
  grayscale: 0,
  hueRotate: 0,
};

const getPresetFilterStyle = (preset: FilterPreset): React.CSSProperties => {
  const adj = { ...defaultAdjustments, ...preset.adjustments };
  return {
    filter: `brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturation}%) sepia(${adj.sepia}%) grayscale(${adj.grayscale}%) hue-rotate(${adj.hueRotate}deg)`,
  };
};

const filterPresets: FilterPreset[] = [
  {
    id: 'original',
    name: 'Original',
    adjustments: {},
    description: 'Ingen justering',
  },
  {
    id: 'vivid',
    name: 'Livfull',
    adjustments: { saturation: 140, contrast: 110 },
    description: 'Starka färger',
  },
  {
    id: 'warm',
    name: 'Varm',
    adjustments: { sepia: 20, saturation: 110, brightness: 105 },
    description: 'Gyllene toner',
  },
  {
    id: 'cool',
    name: 'Kall',
    adjustments: { hueRotate: 10, saturation: 90, brightness: 105 },
    description: 'Blåa toner',
  },
  {
    id: 'vintage',
    name: 'Vintage',
    adjustments: { sepia: 30, contrast: 90, saturation: 80, brightness: 105 },
    description: 'Retro-känsla',
  },
  {
    id: 'dramatic',
    name: 'Dramatisk',
    adjustments: { contrast: 130, saturation: 120, brightness: 95 },
    description: 'Hög kontrast',
  },
  {
    id: 'soft',
    name: 'Mjuk',
    adjustments: { contrast: 85, saturation: 90, brightness: 110 },
    description: 'Dämpade toner',
  },
  {
    id: 'bw',
    name: 'Svartvit',
    adjustments: { grayscale: 100, contrast: 110 },
    description: 'Klassisk monokrom',
  },
  {
    id: 'bw-high',
    name: 'Svartvit dramatisk',
    adjustments: { grayscale: 100, contrast: 140, brightness: 105 },
    description: 'Hög kontrast B/W',
  },
  {
    id: 'sepia',
    name: 'Sepia',
    adjustments: { sepia: 60, contrast: 95 },
    description: 'Antik look',
  },
  {
    id: 'fade',
    name: 'Blekt',
    adjustments: { contrast: 80, saturation: 70, brightness: 115 },
    description: 'Urtvättad effekt',
  },
  {
    id: 'punch',
    name: 'Punch',
    adjustments: { contrast: 120, saturation: 130, brightness: 100 },
    description: 'Extra kraft',
  },
];

const aspectRatios: Record<AspectRatioOption, number | undefined> = {
  free: undefined,
  '16:9': 16 / 9,
  '4:3': 4 / 3,
  '1:1': 1,
  '3:2': 3 / 2,
  '2:3': 2 / 3,
};

function centerAspectCrop(
  mediaWidth: number,
  mediaHeight: number,
  aspect: number
): Crop {
  return centerCrop(
    makeAspectCrop(
      {
        unit: '%',
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight
    ),
    mediaWidth,
    mediaHeight
  );
}

export function ImageCropper({
  open,
  onOpenChange,
  imageUrl,
  onCropComplete,
  onSkip,
}: ImageCropperProps) {
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspectRatio, setAspectRatio] = useState<AspectRatioOption>('free');
  const [isProcessing, setIsProcessing] = useState(false);
  const [adjustments, setAdjustments] = useState<ImageAdjustments>(defaultAdjustments);
  const [activePreset, setActivePreset] = useState<string>('original');
  const [showAdjustments, setShowAdjustments] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const onImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const { width, height } = e.currentTarget;
      const aspect = aspectRatios[aspectRatio];
      
      if (aspect) {
        setCrop(centerAspectCrop(width, height, aspect));
      } else {
        setCrop({
          unit: '%',
          x: 10,
          y: 10,
          width: 80,
          height: 80,
        });
      }
    },
    [aspectRatio]
  );

  const handleAspectRatioChange = (value: AspectRatioOption) => {
    setAspectRatio(value);
    
    if (imgRef.current) {
      const { width, height } = imgRef.current;
      const aspect = aspectRatios[value];
      
      if (aspect) {
        setCrop(centerAspectCrop(width, height, aspect));
      } else {
        setCrop({
          unit: '%',
          x: 10,
          y: 10,
          width: 80,
          height: 80,
        });
      }
    }
  };

  const handlePresetChange = (presetId: string) => {
    const preset = filterPresets.find(p => p.id === presetId);
    if (preset) {
      setActivePreset(presetId);
      setAdjustments({
        ...defaultAdjustments,
        ...preset.adjustments,
      });
    }
  };

  const handleResetAdjustments = () => {
    setAdjustments(defaultAdjustments);
    setActivePreset('original');
  };

  const handleAdjustmentChange = (key: keyof ImageAdjustments, value: number) => {
    setAdjustments(prev => ({ ...prev, [key]: value }));
    setActivePreset(''); // Clear preset when manually adjusting
  };

  const getFilterStyle = () => {
    return {
      filter: `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%) saturate(${adjustments.saturation}%) sepia(${adjustments.sepia}%) grayscale(${adjustments.grayscale}%) hue-rotate(${adjustments.hueRotate}deg)`,
    };
  };

  const getFilterString = () => {
    return `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%) saturate(${adjustments.saturation}%) sepia(${adjustments.sepia}%) grayscale(${adjustments.grayscale}%) hue-rotate(${adjustments.hueRotate}deg)`;
  };

  const hasAdjustments = 
    adjustments.brightness !== 100 || 
    adjustments.contrast !== 100 || 
    adjustments.saturation !== 100 ||
    adjustments.sepia !== 0 ||
    adjustments.grayscale !== 0 ||
    adjustments.hueRotate !== 0;

  const getCroppedImage = useCallback(async (): Promise<Blob | null> => {
    if (!completedCrop || !imgRef.current) return null;

    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) return null;

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    const pixelCrop = {
      x: completedCrop.x * scaleX,
      y: completedCrop.y * scaleY,
      width: completedCrop.width * scaleX,
      height: completedCrop.height * scaleY,
    };

    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;

    ctx.filter = getFilterString();

    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      pixelCrop.width,
      pixelCrop.height
    );

    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => resolve(blob),
        'image/webp',
        0.85
      );
    });
  }, [completedCrop, adjustments]);

  const handleCrop = async () => {
    setIsProcessing(true);
    try {
      const croppedBlob = await getCroppedImage();
      if (croppedBlob) {
        onCropComplete(croppedBlob);
        onOpenChange(false);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSkip = () => {
    if (onSkip) {
      onSkip();
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CropIcon className="h-5 w-5" />
            Beskär & justera bild
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden">
          {/* Controls row */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-sm whitespace-nowrap">Format:</Label>
              <Select value={aspectRatio} onValueChange={handleAspectRatioChange}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Fritt</SelectItem>
                  <SelectItem value="16:9">16:9</SelectItem>
                  <SelectItem value="4:3">4:3</SelectItem>
                  <SelectItem value="1:1">1:1</SelectItem>
                  <SelectItem value="3:2">3:2</SelectItem>
                  <SelectItem value="2:3">2:3</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Filter presets with thumbnails */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm">Snabbfilter</Label>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
              {filterPresets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handlePresetChange(preset.id)}
                  className={cn(
                    "flex-shrink-0 flex flex-col items-center gap-1.5 p-1.5 rounded-lg transition-all",
                    "border-2 hover:bg-muted/30",
                    activePreset === preset.id
                      ? "border-primary bg-primary/5"
                      : "border-transparent hover:border-muted-foreground/20"
                  )}
                  title={preset.description}
                >
                  {/* Thumbnail preview */}
                  <div className="relative w-14 h-10 rounded overflow-hidden bg-muted">
                    <img
                      src={imageUrl}
                      alt={preset.name}
                      className="w-full h-full object-cover"
                      style={getPresetFilterStyle(preset)}
                      crossOrigin="anonymous"
                    />
                    {activePreset === preset.id && (
                      <div className="absolute inset-0 ring-2 ring-primary ring-inset rounded" />
                    )}
                  </div>
                  <span className={cn(
                    "text-[10px] font-medium leading-tight",
                    activePreset === preset.id ? "text-primary" : "text-muted-foreground"
                  )}>
                    {preset.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Adjustments panel */}
          <Collapsible open={showAdjustments} onOpenChange={setShowAdjustments}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4" />
                  Finjusteringar
                  {hasAdjustments && activePreset !== 'original' && (
                    <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                      Aktiv
                    </span>
                  )}
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${showAdjustments ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Manuella justeringar</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetAdjustments}
                    disabled={!hasAdjustments}
                    className="h-7 text-xs"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Återställ
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {/* Brightness */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Ljusstyrka</Label>
                      <span className="text-xs text-muted-foreground w-10 text-right">
                        {adjustments.brightness}%
                      </span>
                    </div>
                    <Slider
                      value={[adjustments.brightness]}
                      onValueChange={([value]) => handleAdjustmentChange('brightness', value)}
                      min={50}
                      max={150}
                      step={1}
                      className="w-full"
                    />
                  </div>

                  {/* Contrast */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Kontrast</Label>
                      <span className="text-xs text-muted-foreground w-10 text-right">
                        {adjustments.contrast}%
                      </span>
                    </div>
                    <Slider
                      value={[adjustments.contrast]}
                      onValueChange={([value]) => handleAdjustmentChange('contrast', value)}
                      min={50}
                      max={150}
                      step={1}
                      className="w-full"
                    />
                  </div>

                  {/* Saturation */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Mättnad</Label>
                      <span className="text-xs text-muted-foreground w-10 text-right">
                        {adjustments.saturation}%
                      </span>
                    </div>
                    <Slider
                      value={[adjustments.saturation]}
                      onValueChange={([value]) => handleAdjustmentChange('saturation', value)}
                      min={0}
                      max={200}
                      step={1}
                      className="w-full"
                    />
                  </div>

                  {/* Sepia */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Sepia</Label>
                      <span className="text-xs text-muted-foreground w-10 text-right">
                        {adjustments.sepia}%
                      </span>
                    </div>
                    <Slider
                      value={[adjustments.sepia]}
                      onValueChange={([value]) => handleAdjustmentChange('sepia', value)}
                      min={0}
                      max={100}
                      step={1}
                      className="w-full"
                    />
                  </div>

                  {/* Grayscale */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Gråskala</Label>
                      <span className="text-xs text-muted-foreground w-10 text-right">
                        {adjustments.grayscale}%
                      </span>
                    </div>
                    <Slider
                      value={[adjustments.grayscale]}
                      onValueChange={([value]) => handleAdjustmentChange('grayscale', value)}
                      min={0}
                      max={100}
                      step={1}
                      className="w-full"
                    />
                  </div>

                  {/* Hue Rotate */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Färgton</Label>
                      <span className="text-xs text-muted-foreground w-10 text-right">
                        {adjustments.hueRotate}°
                      </span>
                    </div>
                    <Slider
                      value={[adjustments.hueRotate]}
                      onValueChange={([value]) => handleAdjustmentChange('hueRotate', value)}
                      min={-180}
                      max={180}
                      step={1}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Crop area */}
          <div className="flex-1 overflow-auto bg-muted/30 rounded-lg p-4 flex items-center justify-center min-h-[200px] max-h-[35vh]">
            <ReactCrop
              crop={crop}
              onChange={(_, percentCrop) => setCrop(percentCrop)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={aspectRatios[aspectRatio]}
              className="max-h-full"
            >
              <img
                ref={imgRef}
                src={imageUrl}
                alt="Crop preview"
                onLoad={onImageLoad}
                className="max-h-[33vh] max-w-full object-contain"
                crossOrigin="anonymous"
                style={getFilterStyle()}
              />
            </ReactCrop>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Välj ett snabbfilter eller finjustera manuellt. Bilden konverteras till WebP.
          </p>
        </div>

        <DialogFooter className="flex-row gap-2 sm:gap-2">
          {onSkip && (
            <Button variant="ghost" onClick={handleSkip} disabled={isProcessing}>
              Använd original
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            Avbryt
          </Button>
          <Button onClick={handleCrop} disabled={!completedCrop || isProcessing}>
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Bearbetar...
              </>
            ) : (
              'Beskär & använd'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
