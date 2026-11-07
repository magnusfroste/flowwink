/**
 * Document rooms — a named collection of documents and who may see it, without
 * a copy (Peter's backlog, optic, 2026-11-05). One function on both sides:
 * `manage_document_room` is what this hook and the skill of the same name
 * call, so a room an agent made reads the same as one a person made.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface DocumentRoomSummary {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  document_count: number;
  member_count: number;
  last_accessed_at: string | null;
}

export interface DocumentRoomDocument {
  id: string;
  title: string;
  file_name: string;
  file_type: string | null;
  file_size_bytes: number | null;
  category: string;
  folder: string | null;
  added_at: string;
  /** Members who viewed or downloaded it, and live members in scope who have not. */
  seen_by: string[];
  unseen_by: string[];
}

export interface DocumentRoomMember {
  id: string;
  name: string;
  email: string | null;
  permission: 'view' | 'download';
  token: string;
  expires_at: string | null;
  revoked_at: string | null;
  access_count: number;
  last_accessed_at: string | null;
  created_at: string;
  /** null = every document in the room; otherwise exactly these. */
  document_ids: string[] | null;
  documents_seen: number;
}

export interface DocumentRoomMemberHistory {
  member: Pick<DocumentRoomMember, 'id' | 'name' | 'email' | 'permission' | 'access_count' | 'last_accessed_at' | 'created_at' | 'revoked_at' | 'expires_at'>;
  per_document: Array<{ document_id: string | null; document: string | null; views: number; downloads: number; first_at: string; last_at: string }>;
  not_yet_seen: string[];
  history: Array<{ at: string; action: 'open' | 'view' | 'download'; document: string | null; user_agent: string | null }>;
}

export interface DocumentRoomAccess {
  at: string;
  member: string;
  action: 'open' | 'view' | 'download';
  document: string | null;
}

export interface DocumentRoomDetail {
  room: Omit<DocumentRoomSummary, 'document_count' | 'member_count' | 'last_accessed_at'>;
  documents: DocumentRoomDocument[];
  members: DocumentRoomMember[];
  recent_access: DocumentRoomAccess[];
}

type RoomArgs = {
  action: 'list' | 'get' | 'create' | 'update' | 'delete' | 'add_documents' | 'remove_document' | 'add_member' | 'set_member_documents' | 'revoke_member' | 'member_history';
  room_id?: string;
  name?: string;
  description?: string | null;
  is_active?: boolean;
  document_id?: string;
  document_ids?: string[];
  member_id?: string;
  member_name?: string;
  member_email?: string | null;
  permission?: 'view' | 'download';
  expires_at?: string | null;
};

async function callRoom<T>(args: RoomArgs): Promise<T> {
  const params: Record<string, unknown> = { p_action: args.action };
  for (const [k, v] of Object.entries(args)) {
    if (k === 'action' || v === undefined) continue;
    params[`p_${k}`] = v;
  }
  const { data, error } = await supabase.rpc('manage_document_room' as never, params as never);
  if (error) throw error;
  return data as T;
}

export function useDocumentRooms() {
  return useQuery({
    queryKey: ['document-rooms'],
    queryFn: async () => (await callRoom<{ rooms: DocumentRoomSummary[] }>({ action: 'list' })).rooms,
  });
}

export function useDocumentRoom(roomId: string | null | undefined) {
  return useQuery({
    queryKey: ['document-room', roomId],
    enabled: !!roomId,
    queryFn: () => callRoom<DocumentRoomDetail>({ action: 'get', room_id: roomId! }),
  });
}

/** One member's history: every opening, view and download, and what they have not seen yet. */
export function useDocumentRoomMemberHistory(roomId: string | null | undefined, memberId: string | null | undefined) {
  return useQuery({
    queryKey: ['document-room-member', roomId, memberId],
    enabled: !!roomId && !!memberId,
    queryFn: () => callRoom<DocumentRoomMemberHistory>({ action: 'member_history', room_id: roomId!, member_id: memberId! }),
  });
}

/** Every write goes through the same function; the room and the list refresh after each. */
export function useManageDocumentRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: Exclude<RoomArgs, { action: 'list' | 'get' | 'member_history' }>) => callRoom<Record<string, unknown>>(args),
    onSuccess: (_data, args) => {
      qc.invalidateQueries({ queryKey: ['document-rooms'] });
      if (args.room_id) {
        qc.invalidateQueries({ queryKey: ['document-room', args.room_id] });
        qc.invalidateQueries({ queryKey: ['document-room-member', args.room_id] });
      }
    },
    onError: (e: Error) => toast.error(e.message.replace(/^[A-Z_]+: /, '')),
  });
}

/** The recipient's personal link: the public room page on this site. */
export function documentRoomUrl(token: string): string {
  return `${window.location.origin}/room/${token}`;
}

/** Where a document inside a room is fetched from — the same function as a share link. */
export function documentRoomFileUrl(token: string, documentId: string, mode: 'view' | 'download'): string {
  const base = import.meta.env.VITE_SUPABASE_URL as string;
  return `${base}/functions/v1/document-share?room=${encodeURIComponent(token)}&doc=${encodeURIComponent(documentId)}&mode=${mode}`;
}
