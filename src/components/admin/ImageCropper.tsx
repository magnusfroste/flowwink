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
import { Loader2, Crop as CropIcon, SlidersHorizontal, RotateCcw, ChevronDown } from 'lucide-react';

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
}

const defaultAdjustments: ImageAdjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
};

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

  const handleResetAdjustments = () => {
    setAdjustments(defaultAdjustments);
  };

  const getFilterStyle = () => {
    return {
      filter: `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%) saturate(${adjustments.saturation}%)`,
    };
  };

  const hasAdjustments = 
    adjustments.brightness !== 100 || 
    adjustments.contrast !== 100 || 
    adjustments.saturation !== 100;

  const getCroppedImage = useCallback(async (): Promise<Blob | null> => {
    if (!completedCrop || !imgRef.current) return null;

    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) return null;

    // Calculate the actual pixel values
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    const pixelCrop = {
      x: completedCrop.x * scaleX,
      y: completedCrop.y * scaleY,
      width: completedCrop.width * scaleX,
      height: completedCrop.height * scaleY,
    };

    // Set canvas size to the cropped dimensions
    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;

    // Apply CSS filters to canvas
    ctx.filter = `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%) saturate(${adjustments.saturation}%)`;

    // Draw the cropped image with filters applied
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

    // Convert to WebP for better compression
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
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
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
                <SelectTrigger className="w-28">
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

          {/* Adjustments panel */}
          <Collapsible open={showAdjustments} onOpenChange={setShowAdjustments}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4" />
                  Bildjusteringar
                  {hasAdjustments && (
                    <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                      Ändrad
                    </span>
                  )}
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${showAdjustments ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Justeringar</span>
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

                <div className="grid gap-4">
                  {/* Brightness */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Ljusstyrka</Label>
                      <span className="text-xs text-muted-foreground w-10 text-right">
                        {adjustments.brightness}%
                      </span>
                    </div>
                    <Slider
                      value={[adjustments.brightness]}
                      onValueChange={([value]) => setAdjustments(prev => ({ ...prev, brightness: value }))}
                      min={50}
                      max={150}
                      step={1}
                      className="w-full"
                    />
                  </div>

                  {/* Contrast */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Kontrast</Label>
                      <span className="text-xs text-muted-foreground w-10 text-right">
                        {adjustments.contrast}%
                      </span>
                    </div>
                    <Slider
                      value={[adjustments.contrast]}
                      onValueChange={([value]) => setAdjustments(prev => ({ ...prev, contrast: value }))}
                      min={50}
                      max={150}
                      step={1}
                      className="w-full"
                    />
                  </div>

                  {/* Saturation */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Mättnad</Label>
                      <span className="text-xs text-muted-foreground w-10 text-right">
                        {adjustments.saturation}%
                      </span>
                    </div>
                    <Slider
                      value={[adjustments.saturation]}
                      onValueChange={([value]) => setAdjustments(prev => ({ ...prev, saturation: value }))}
                      min={0}
                      max={200}
                      step={1}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Crop area */}
          <div className="flex-1 overflow-auto bg-muted/30 rounded-lg p-4 flex items-center justify-center min-h-[250px] max-h-[40vh]">
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
                className="max-h-[38vh] max-w-full object-contain"
                crossOrigin="anonymous"
                style={getFilterStyle()}
              />
            </ReactCrop>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Dra i hörnen för att beskära. Bilden konverteras automatiskt till WebP.
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
