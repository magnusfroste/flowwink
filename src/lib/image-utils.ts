/**
 * Load an image from a File or Blob
 */
export const loadImage = (source: File | Blob): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve(img);
    };
    img.onerror = () => reject(new Error('Kunde inte ladda bilden'));
    img.src = URL.createObjectURL(source);
  });
};

/**
 * Convert an image file to WebP format using Canvas API
 * @param file - The image file to convert
 * @param quality - WebP quality (0-1), default 0.85
 * @returns A Blob in WebP format
 */
export const convertToWebP = async (file: File, quality = 0.85): Promise<Blob> => {
  const img = await loadImage(file);
  
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Kunde inte skapa canvas context');
  }
  
  ctx.drawImage(img, 0, 0);
  
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Kunde inte konvertera till WebP'));
        }
      },
      'image/webp',
      quality
    );
  });
};

/**
 * Get the WebP filename from an original filename
 */
export const getWebPFileName = (originalName: string): string => {
  const baseName = originalName.replace(/\.[^/.]+$/, '');
  return `${baseName}.webp`;
};

/**
 * Check if browser supports WebP
 */
export const supportsWebP = async (): Promise<boolean> => {
  if (typeof document === 'undefined') return false;
  
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  
  return canvas.toDataURL('image/webp').startsWith('data:image/webp');
};
