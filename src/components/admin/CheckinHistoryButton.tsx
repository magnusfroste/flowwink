import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { History, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type CheckinLog = {
  id: string;
  profile_id: string;
  created_at: string;
  fields_updated: Record<string, unknown>;
  last_user_message: string | null;
  source: string;
};

export function useLastCheckin(profileId: string) {
  return useQuery({
    queryKey: ["consultant-checkin-log", profileId, "last"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("consultant_checkin_log")
        .select("created_at")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as { created_at: string } | null;
    },
  });
}

function describeValue(v: unknown): string {
  if (v == null) return "—";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "(empty)";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  const s = String(v);
  return s.length > 240 ? s.slice(0, 240) + "…" : s;
}

function FieldRow({ fieldKey, value }: { fieldKey: string; value: unknown }) {
  return (
    <>
      <dt className="text-muted-foreground">{fieldKey}</dt>
      <dd className="break-words">{describeValue(value)}</dd>
    </>
  );
}

export function CheckinHistoryButton({
  profileId,
  profileName,
}: {
  profileId: string;
  profileName: string;
}) {
  const [open, setOpen] = useState(false);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["consultant-checkin-log", profileId, "all"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("consultant_checkin_log")
        .select("*")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as CheckinLog[];
    },
    enabled: open,
  });

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setOpen(true)}
        title={`Check-in history for ${profileName}`}
      >
        <History className="h-3.5 w-3.5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Check-in history — {profileName}</DialogTitle>
            <DialogDescription>
              Every profile update made through the chat-based check-in flow.
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading…
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No check-ins recorded yet. Share the check-in link with the consultant to get started.
            </div>
          ) : (
            <ScrollArea className="max-h-[60vh] pr-3">
              <ol className="space-y-4">
                {logs.map((log) => {
                  const fields = Object.entries(log.fields_updated || {});
                  return (
                    <li
                      key={log.id}
                      className="rounded-lg border bg-card p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                          <span className="mx-1">·</span>
                          {new Date(log.created_at).toLocaleString()}
                        </div>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {log.source}
                        </Badge>
                      </div>

                      {log.last_user_message && (
                        <blockquote className="text-xs italic text-muted-foreground border-l-2 pl-2">
                          "{log.last_user_message.slice(0, 280)}
                          {log.last_user_message.length > 280 ? "…" : ""}"
                        </blockquote>
                      )}

                      {fields.length > 0 ? (
                        <div className="space-y-1">
                          <p className="text-xs font-medium">Fields updated</p>
                          <dl className="text-xs grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
                            {fields.map(([k, v]) => (
                              <FieldRow key={k} fieldKey={k} value={v} />
                            ))}
                          </dl>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No fields changed.</p>
                      )}
                    </li>
                  );
                })}
              </ol>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
