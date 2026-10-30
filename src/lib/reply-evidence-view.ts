/**
 * The evidence an email reply keeps (metadata.evidence), as the admin reads
 * it. Built server-side by supabase/functions/_shared/email/reply-evidence.ts.
 */
export interface ReplyEvidenceData {
  question?: string;
  answered_from?: 'knowledge' | 'live_data' | 'model_only';
  sources?: Array<{ table: string; id: string; title: string; url?: string }>;
  knowledge?: { kb: boolean; pages: boolean; general: boolean } | null;
  decision?: string;
  why?: string;
  sent_by?: 'person' | 'flowpilot';
  edited?: boolean;
  trust_level?: string | null;
}

export function readEvidence(metadata: unknown): ReplyEvidenceData | null {
  const e = (metadata as { evidence?: unknown } | null | undefined)?.evidence;
  return e && typeof e === 'object' ? (e as ReplyEvidenceData) : null;
}
