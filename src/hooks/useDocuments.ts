import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type Document = {
  id: string;
  title: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size_bytes: number | null;
  category: string;
  tags: string[] | null;
  folder: string | null;
  description: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
};

export function useDocuments(category?: string) {
  return useQuery({
    queryKey: ["documents", category],
    queryFn: async () => {
      let q = supabase.from("documents").select("*").order("created_at", { ascending: false });
      if (category && category !== "all") q = q.eq("category", category);
      const { data, error } = await q;
      if (error) throw error;
      return data as Document[];
    },
  });
}

/** Documents linked to a specific entity (contract, project, employee...). */
export function useEntityDocuments(entityType?: string | null, entityId?: string | null) {
  return useQuery({
    enabled: !!entityType && !!entityId,
    queryKey: ["documents", "entity", entityType, entityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("related_entity_type", entityType!)
        .eq("related_entity_id", entityId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Document[];
    },
  });
}

export function useCreateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Document>) => {
      const { data, error } = await supabase.from("documents").insert(input as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Document added");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/**
 * Get document counts grouped by related_entity_id for a given entity type.
 * Used to render badges like "📎 3" on contract/project cards.
 */
export function useEntityDocumentCounts(entityType: string, entityIds: string[]) {
  return useQuery({
    enabled: entityIds.length > 0,
    queryKey: ["documents", "counts", entityType, [...entityIds].sort().join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("related_entity_id")
        .eq("related_entity_type", entityType)
        .in("related_entity_id", entityIds);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        const id = (row as { related_entity_id: string | null }).related_entity_id;
        if (id) counts[id] = (counts[id] ?? 0) + 1;
      }
      return counts;
    },
  });
}

/**
 * Upload a File to the documents bucket and create a documents row linked
 * to an entity. Used by drag-and-drop on entity cards.
 */
export async function uploadDocumentForEntity(params: {
  file: File;
  entityType: string;
  entityId: string;
  category?: string;
  title?: string;
}): Promise<{ id: string } | null> {
  const { file, entityType, entityId, category, title } = params;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    toast.error("Not authenticated");
    return null;
  }
  const ext = file.name.split(".").pop() || "bin";
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("documents")
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (upErr) {
    toast.error(upErr.message);
    return null;
  }

  const { data, error } = await supabase
    .from("documents")
    .insert({
      title: title?.trim() || file.name.replace(/\.[^.]+$/, ""),
      file_name: file.name,
      file_url: path,
      file_type: file.type || null,
      file_size_bytes: file.size,
      category: category || entityType,
      related_entity_type: entityType,
      related_entity_id: entityId,
      uploaded_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    toast.error(error.message);
    await supabase.storage.from("documents").remove([path]);
    return null;
  }
  toast.success("Document uploaded");
  return data;
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Best-effort: if file_url is a storage path (no scheme), remove it from the bucket too.
      const { data: doc } = await supabase.from("documents").select("file_url").eq("id", id).maybeSingle();
      if (doc?.file_url && !/^https?:\/\//i.test(doc.file_url)) {
        await supabase.storage.from("documents").remove([doc.file_url]);
      }
      const { error } = await supabase.from("documents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Document deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Get a short-lived signed URL for a private documents-bucket path. */
export async function getDocumentSignedUrl(filePath: string, expiresIn = 60): Promise<string | null> {
  if (/^https?:\/\//i.test(filePath)) return filePath; // already a public/external URL
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(filePath, expiresIn);
  if (error) {
    toast.error(error.message);
    return null;
  }
  return data.signedUrl;
}
