import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { History, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface KbRevision {
  id: string;
  article_id: string;
  slug: string;
  title: string;
  revision_no: number;
  action: string;
  revised_at: string;
  answer_length: number;
}

/**
 * Version history for a KB article (kb parity: versioning).
 * Same backend as the kb_article_history skill — list + restore.
 */
export function KbVersionHistoryCard({ articleId }: { articleId: string }) {
  const queryClient = useQueryClient();

  const { data: revisions, isLoading } = useQuery({
    queryKey: ["kb-article-history", articleId],
    queryFn: async (): Promise<KbRevision[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.rpc("kb_article_history" as any, {
        p_action: "list",
        p_article_id: articleId,
      });
      if (error) throw error;
      return ((data as { revisions?: KbRevision[] })?.revisions) ?? [];
    },
  });

  const restore = useMutation({
    mutationFn: async (revisionId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.rpc("kb_article_history" as any, {
        p_action: "restore",
        p_revision_id: revisionId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kb-article", articleId] });
      queryClient.invalidateQueries({ queryKey: ["kb-article-history", articleId] });
      toast.success("Revision restored — reload the editor to see it");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 flex justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!revisions || revisions.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" />
          Version history
        </CardTitle>
        <CardDescription>Every content edit is captured automatically</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {revisions.map((rev) => (
          <div key={rev.id} className="flex items-center justify-between gap-2 text-sm">
            <div className="min-w-0">
              <span className="font-medium">v{rev.revision_no}</span>{" "}
              <Badge variant="outline" className="text-xs">{rev.action}</Badge>
              <p className="text-xs text-muted-foreground truncate">
                {new Date(rev.revised_at).toLocaleString()} · {rev.answer_length} chars
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={restore.isPending}
              onClick={() => restore.mutate(rev.id)}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Restore
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
