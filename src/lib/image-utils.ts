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
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = URL.createObjectURL(source);
  });
};

/**
 * Detect HEIC/HEIF files (iPhone photos). Chrome reports an empty mime type
 * for .heic files, so the extension check is load-bearing, not a fallback.
 */
export const isHeicFile = (file: File): boolean =>
  /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);

/**
 * Decode a HEIC/HEIF file into a blob the browser can render.
 * heic2any (libheif compiled to wasm/asm.js) is imported lazily so the
 * decoder chunk only loads when a HEIC file is actually selected.
 */
export const decodeHeic = async (file: File): Promise<Blob> => {
  const { default: heic2any } = await import('heic2any');
  const result = await heic2any({ blob: file, toType: 'image/png' });
  // Multi-image HEIC containers decode to an array; the first entry is the
  // primary image.
  return Array.isArray(result) ? result[0] : result;
};

/**
 * Convert an image file to WebP format using Canvas API.
 * HEIC/HEIF input is decoded via heic2any first, since browsers cannot
 * decode it natively.
 * @param file - The image file to convert
 * @param quality - WebP quality (0-1), default 0.85
 * @returns A Blob in WebP format
 */
export const convertToWebP = async (file: File, quality = 0.85): Promise<Blob> => {
  const source: Blob = isHeicFile(file) ? await decodeHeic(file) : file;
  const img = await loadImage(source);
  
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not create canvas context');
  }
  
  ctx.drawImage(img, 0, 0);
  
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Could not convert to WebP'));
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
