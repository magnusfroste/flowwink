import { useState } from 'react';
import { GalleryBlockData } from '@/types/cms';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GalleryBlockProps {
  data: GalleryBlockData;
}

export function GalleryBlock({ data }: GalleryBlockProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const images = data.images || [];
  const columns = data.columns || 3;
  const layout = data.layout || 'grid';

  const gridCols = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
  }[columns];

  const openLightbox = (index: number) => setLightboxIndex(index);
  const closeLightbox = () => setLightboxIndex(null);
  
  const goToPrevious = () => {
    if (lightboxIndex !== null) {
      setLightboxIndex(lightboxIndex === 0 ? images.length - 1 : lightboxIndex - 1);
    }
  };
  
  const goToNext = () => {
    if (lightboxIndex !== null) {
      setLightboxIndex(lightboxIndex === images.length - 1 ? 0 : lightboxIndex + 1);
    }
  };

  if (images.length === 0) return null;

  const renderGrid = () => (
    <div className={cn('grid gap-4', gridCols)}>
      {images.map((image, index) => (
        <button
          key={index}
          onClick={() => openLightbox(index)}
          className="group relative aspect-video overflow-hidden rounded-lg bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          <img
            src={image.src}
            alt={image.alt}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
          {image.caption && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity">
              <p className="text-white text-sm">{image.caption}</p>
            </div>
          )}
        </button>
      ))}
    </div>
  );

  const renderMasonry = () => (
    <div className={cn('columns-1 gap-4', {
      'sm:columns-2': columns >= 2,
      'lg:columns-3': columns >= 3,
      'xl:columns-4': columns >= 4,
    })}>
      {images.map((image, index) => (
        <button
          key={index}
          onClick={() => openLightbox(index)}
          className="group relative w-full mb-4 overflow-hidden rounded-lg bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          <img
            src={image.src}
            alt={image.alt}
            className="w-full h-auto transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
          {image.caption && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity">
              <p className="text-white text-sm">{image.caption}</p>
            </div>
          )}
        </button>
      ))}
    </div>
  );

  return (
    <section className="py-12 md:py-16">
      <div className="container mx-auto px-4">
        {layout === 'masonry' ? renderMasonry() : renderGrid()}

        {/* Lightbox */}
        <Dialog open={lightboxIndex !== null} onOpenChange={closeLightbox}>
          <DialogContent className="max-w-5xl p-0 bg-black/95 border-none">
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-4 right-4 z-10 text-white hover:bg-white/20"
                onClick={closeLightbox}
              >
                <X className="h-6 w-6" />
              </Button>

              {images.length > 1 && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute left-4 top-1/2 -translate-y-1/2 z-10 text-white hover:bg-white/20"
                    onClick={goToPrevious}
                  >
                    <ChevronLeft className="h-8 w-8" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-4 top-1/2 -translate-y-1/2 z-10 text-white hover:bg-white/20"
                    onClick={goToNext}
                  >
                    <ChevronRight className="h-8 w-8" />
                  </Button>
                </>
              )}

              {lightboxIndex !== null && images[lightboxIndex] && (
                <div className="flex flex-col items-center p-8">
                  <img
                    src={images[lightboxIndex].src}
                    alt={images[lightboxIndex].alt}
                    className="max-h-[80vh] max-w-full object-contain"
                  />
                  {images[lightboxIndex].caption && (
                    <p className="text-white text-center mt-4">
                      {images[lightboxIndex].caption}
                    </p>
                  )}
                  <p className="text-white/60 text-sm mt-2">
                    {lightboxIndex + 1} / {images.length}
                  </p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </section>
  );
}
