import { useState, useRef, useCallback } from 'react';
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
import { Loader2, Crop as CropIcon } from 'lucide-react';

interface ImageCropperProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  onCropComplete: (croppedImageBlob: Blob) => void;
  onSkip?: () => void;
}

type AspectRatioOption = 'free' | '16:9' | '4:3' | '1:1' | '3:2' | '2:3';

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
  const imgRef = useRef<HTMLImageElement>(null);

  const onImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const { width, height } = e.currentTarget;
      const aspect = aspectRatios[aspectRatio];
      
      if (aspect) {
        setCrop(centerAspectCrop(width, height, aspect));
      } else {
        // Default to a centered 80% crop for free aspect
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

    // Draw the cropped image
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
  }, [completedCrop]);

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
            Beskär bild
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden">
          {/* Aspect ratio selector */}
          <div className="flex items-center gap-3">
            <Label className="text-sm">Bildformat:</Label>
            <Select value={aspectRatio} onValueChange={handleAspectRatioChange}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="free">Fritt</SelectItem>
                <SelectItem value="16:9">16:9</SelectItem>
                <SelectItem value="4:3">4:3</SelectItem>
                <SelectItem value="1:1">1:1 (Kvadrat)</SelectItem>
                <SelectItem value="3:2">3:2</SelectItem>
                <SelectItem value="2:3">2:3 (Porträtt)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Crop area */}
          <div className="flex-1 overflow-auto bg-muted/30 rounded-lg p-4 flex items-center justify-center min-h-[300px] max-h-[50vh]">
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
                className="max-h-[45vh] max-w-full object-contain"
                crossOrigin="anonymous"
              />
            </ReactCrop>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Dra i hörnen eller kanterna för att justera beskärningen. Bilden konverteras automatiskt till WebP.
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
