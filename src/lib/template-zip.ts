import { logger } from '@/lib/logger';
/**
 * Template ZIP Utilities
 * 
 * Utilities for bundling templates with images into ZIP files,
 * and extracting/importing ZIP templates.
 */

import JSZip from 'jszip';
import { StarterTemplate } from '@/data/templates';
import { supabase } from '@/integrations/supabase/client';
import { 
  extractTemplateImages, 
  createUrlMapping, 
  rewriteTemplateUrls,
  restoreTemplateUrls,
  ExtractedImage 
} from './template-image-extractor';

export interface ZipExportProgress {
  stage: 'extracting' | 'downloading' | 'packaging' | 'complete';
  current: number;
  total: number;
  message: string;
}

export interface ZipExportResult {
  success: boolean;
  blob?: Blob;
  error?: string;
  imageCount: number;
  /** URLs whose download failed (skipped from the ZIP but not fatal). */
  failedImages?: string[];
  /** Total image URLs referenced by the template. */
  totalImages?: number;
}

export interface ZipImportResult {
  success: boolean;
  template?: StarterTemplate;
  errors: string[];
  warnings: string[];
  imageCount: number;
}

/**
 * Download an image via edge function (CORS-safe)
 */
async function downloadImage(url: string): Promise<ArrayBuffer | null> {
  try {
    // Use the process-image edge function to fetch the image
    const { data, error } = await supabase.functions.invoke('fetch-image', {
      body: { imageUrl: url },
    });
    
    if (error) {
      logger.error('Error fetching image:', url, error);
      return null;
    }
    
    if (data?.base64) {
      // Convert base64 to ArrayBuffer
      const binary = atob(data.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    }
    
    return null;
  } catch (err) {
    logger.error('Failed to download image:', url, err);
    return null;
  }
}

/**
 * Export a template as a ZIP file with all referenced images
 */
export async function exportTemplateAsZip(
  template: StarterTemplate,
  onProgress?: (progress: ZipExportProgress) => void
): Promise<ZipExportResult> {
  const zip = new JSZip();
  
  try {
    // Stage 1: Extract image URLs
    onProgress?.({
      stage: 'extracting',
      current: 0,
      total: 1,
      message: 'Analyzing template for images...',
    });
    
    const images = extractTemplateImages(template);
    const urlMapping = createUrlMapping(images);
    
    // Stage 2: Download images
    const imagesFolder = zip.folder('images');
    if (!imagesFolder) {
      // JSZip failed to create the folder — cannot bundle images.
      throw new Error('Could not create images folder in the ZIP');
    }
    let processed = 0;
    const successfulImages: ExtractedImage[] = [];
    const failedImages: string[] = [];

    for (const image of images) {
      onProgress?.({
        stage: 'downloading',
        current: processed,
        total: images.length,
        message: `Downloading image ${processed + 1} of ${images.length}...`,
      });
      processed++;

      const imageData = await downloadImage(image.url);

      if (imageData) {
        const fileName = image.localPath.replace('images/', '');
        imagesFolder.file(fileName, imageData);
        successfulImages.push(image);
      } else {
        // Download failed for this image — skip it but keep going, and record
        // it so the caller can surface exactly which images were dropped
        // (previously these vanished silently, making a partial export look OK).
        failedImages.push(image.url);
      }
    }
    
    // Stage 3: Rewrite URLs in template and package
    onProgress?.({
      stage: 'packaging',
      current: 0,
      total: 1,
      message: 'Packaging template...',
    });
    
    // Only rewrite URLs for successfully downloaded images
    const successfulMapping = createUrlMapping(successfulImages);
    const rewrittenTemplate = rewriteTemplateUrls(template, successfulMapping);
    
    // Add template.json
    zip.file('template.json', JSON.stringify(rewrittenTemplate, null, 2));
    
    // Add manifest with metadata
    const manifest = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      templateId: template.id,
      templateName: template.name,
      imageCount: successfulImages.length,
      images: successfulImages.map(img => ({
        originalUrl: img.url,
        localPath: img.localPath,
      })),
    };
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    
    // Generate ZIP. Guarded separately so an out-of-memory / packaging failure
    // on an image-heavy site surfaces a clear message instead of a generic one.
    let blob: Blob;
    try {
      blob = await zip.generateAsync({ type: 'blob' });
    } catch (genErr) {
      logger.error('ZIP packaging failed:', genErr);
      throw new Error(
        `Packaging the ZIP failed (site may have too many/too-large images: ${successfulImages.length} bundled). ` +
        (genErr instanceof Error ? genErr.message : 'unknown packaging error')
      );
    }

    onProgress?.({
      stage: 'complete',
      current: 1,
      total: 1,
      message: 'Export complete!',
    });

    return {
      success: true,
      blob,
      imageCount: successfulImages.length,
      totalImages: images.length,
      failedImages,
    };
  } catch (err) {
    logger.error('ZIP export failed:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      imageCount: 0,
    };
  }
}

/**
 * Upload an image to Supabase storage
 */
async function uploadImage(
  fileName: string,
  data: ArrayBuffer,
  contentType: string
): Promise<{ url: string | null; error?: string }> {
  try {
    const path = `template-imports/${Date.now()}-${fileName}`;
    
    const { error: uploadError } = await supabase.storage
      .from('cms-images')
      .upload(path, data, {
        contentType,
        upsert: false,
      });
    
    if (uploadError) {
      logger.error('Upload error:', uploadError);
      return { url: null, error: uploadError.message };
    }
    
    const { data: urlData } = supabase.storage
      .from('cms-images')
      .getPublicUrl(path);
    
    return { url: urlData.publicUrl };
  } catch (err) {
    logger.error('Failed to upload image:', err);
    return {
      url: null,
      error: err instanceof Error ? err.message : 'Unknown storage error',
    };
  }
}

/**
 * Determine content type from file extension
 */
function getContentType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const types: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
  };
  return types[ext] || 'image/jpeg';
}

/**
 * Import a template from a ZIP file
 */
export async function importTemplateFromZip(
  file: File,
  onProgress?: (progress: ZipExportProgress) => void
): Promise<ZipImportResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  try {
    // Load ZIP
    onProgress?.({
      stage: 'extracting',
      current: 0,
      total: 1,
      message: 'Reading ZIP file...',
    });
    
    const zip = await JSZip.loadAsync(file);
    
    // Read template.json
    const templateFile = zip.file('template.json');
    if (!templateFile) {
      return {
        success: false,
        errors: ['ZIP file does not contain template.json'],
        warnings: [],
        imageCount: 0,
      };
    }
    
    const templateJson = await templateFile.async('string');
    let template: StarterTemplate;
    
    try {
      template = JSON.parse(templateJson);
    } catch {
      return {
        success: false,
        errors: ['Invalid template.json - not valid JSON'],
        warnings: [],
        imageCount: 0,
      };
    }
    
    // Read manifest if present
    const manifestFile = zip.file('manifest.json');
    let manifest: { images?: { localPath: string; originalUrl: string }[] } | null = null;
    
    if (manifestFile) {
      try {
        manifest = JSON.parse(await manifestFile.async('string'));
      } catch {
        warnings.push('Could not read manifest.json');
      }
    }
    
    // Find and upload images
    const imagesFolder = zip.folder('images');
    const imageFiles = imagesFolder 
      ? Object.keys(imagesFolder.files).filter(
          name => name.startsWith('images/') && !name.endsWith('/')
        )
      : [];
    
    const urlMapping = new Map<string, string>();
    let uploadedCount = 0;
    
    for (const imagePath of imageFiles) {
      onProgress?.({
        stage: 'downloading', // Reusing 'downloading' stage for uploading
        current: uploadedCount,
        total: imageFiles.length,
        message: `Uploading image ${uploadedCount + 1} of ${imageFiles.length}...`,
      });
      
      const imageFile = zip.file(imagePath);
      if (!imageFile) continue;
      
      try {
        const data = await imageFile.async('arraybuffer');
        const fileName = imagePath.replace('images/', '');
        const contentType = getContentType(fileName);
        
        const uploadResult = await uploadImage(fileName, data, contentType);
        
        if (uploadResult.url) {
          // Map from local path (as stored in template.json) to new URL
          urlMapping.set(imagePath, uploadResult.url);
          uploadedCount++;
        } else {
          warnings.push(`Failed to upload ${fileName}: ${uploadResult.error || 'Unknown storage error'}`);
        }
      } catch (err) {
        warnings.push(`Error processing: ${imagePath}`);
      }
    }
    
    // Restore URLs in template
    onProgress?.({
      stage: 'packaging',
      current: 0,
      total: 1,
      message: 'Updating template references...',
    });
    
    const restoredTemplate = restoreTemplateUrls(template, urlMapping);
    
    onProgress?.({
      stage: 'complete',
      current: 1,
      total: 1,
      message: 'Import complete!',
    });
    
    return {
      success: true,
      template: restoredTemplate,
      errors,
      warnings,
      imageCount: uploadedCount,
    };
  } catch (err) {
    logger.error('ZIP import failed:', err);
    return {
      success: false,
      errors: [err instanceof Error ? err.message : 'Unknown error'],
      warnings,
      imageCount: 0,
    };
  }
}

/**
 * Download a ZIP blob as a file
 */
export function downloadZipBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
