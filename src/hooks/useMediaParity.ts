// Media parity hooks — asset metadata (alt text + variants) and where-used lookup.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MediaVariant {
  label: string;
  width: number;
  height: number;
  storage_path: string;
  url: string;
  size_bytes: number;
}

export interface MediaAsset {
  id: string;
  bucket: string;
  storage_path: string;
  folder: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  variants: MediaVariant[];
  created_at: string;
  updated_at: string;
}

export interface MediaUsage {
  source_type: 'page' | 'blog_post' | 'kb_article' | 'product';
  source_id: string;
  title: string | null;
  slug: string | null;
}

/** All media_assets rows, keyed by `<bucket>|<storage_path>` for O(1) join with storage listing. */
export function useMediaAssets() {
  return useQuery({
    queryKey: ['media-assets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('media_assets')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const map = new Map<string, MediaAsset>();
      for (const row of (data ?? []) as unknown as MediaAsset[]) {
        map.set(`${row.bucket}|${row.storage_path}`, row);
      }
      return map;
    },
  });
}

/** Where-used lookup for a given asset (by filename fragment). */
export function useMediaUsage(needle: string | null) {
  return useQuery({
    queryKey: ['media-usage', needle],
    enabled: !!needle,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('find_media_usage', { p_needle: needle! });
      if (error) throw error;
      return (data ?? []) as unknown as MediaUsage[];
    },
  });
}

/** Upsert alt text. Storage path = `<folder>/<filename>`. */
export function useSetMediaAltText() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { storage_path: string; alt_text: string; bucket?: string }) => {
      const { data, error } = await supabase.rpc('set_media_alt_text', {
        p_storage_path: args.storage_path,
        p_alt_text: args.alt_text,
        p_bucket: args.bucket ?? 'cms-images',
      });
      if (error) throw error;
      return data as unknown as MediaAsset;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['media-assets'] }),
  });
}

/** Ask the edge function to generate optimized variants. */
export function useOptimizeMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { storage_path: string; bucket?: string }) => {
      const { data, error } = await supabase.functions.invoke('media-optimize', {
        body: { storage_path: args.storage_path, bucket: args.bucket ?? 'cms-images' },
      });
      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.error || 'Optimization failed');
      return data as { ok: true; asset: MediaAsset; variants: MediaVariant[] };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['media-assets'] }),
  });
}

/** Upsert base metadata (used right after upload, before optimization runs). */
export function useUpsertMediaAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      storage_path: string;
      folder?: string;
      filename?: string;
      mime_type?: string;
      size_bytes?: number;
      width?: number;
      height?: number;
      bucket?: string;
    }) => {
      const { data, error } = await supabase.rpc('upsert_media_asset', {
        p_storage_path: args.storage_path,
        p_folder: args.folder ?? null,
        p_filename: args.filename ?? null,
        p_mime_type: args.mime_type ?? null,
        p_size_bytes: args.size_bytes ?? null,
        p_width: args.width ?? null,
        p_height: args.height ?? null,
        p_alt_text: null,
        p_variants: null,
        p_bucket: args.bucket ?? 'cms-images',
      });
      if (error) throw error;
      return data as unknown as MediaAsset;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['media-assets'] }),
  });
}
