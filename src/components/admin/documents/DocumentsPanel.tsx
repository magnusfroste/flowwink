import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Plus, ExternalLink, Trash2, FolderOpen } from "lucide-react";
import { format } from "date-fns";
import { useEntityDocuments, useDeleteDocument, getDocumentSignedUrl } from "@/hooks/useDocuments";
import { AddDocumentDialog } from "./AddDocumentDialog";

interface DocumentsPanelProps {
  /** e.g. "contract", "project", "employee" */
  entityType: string;
  entityId: string;
  /** Pre-fill the upload dialog category (defaults to entityType). */
  defaultCategory?: string;
  /** Optional title above the list. */
  title?: string;
}

/**
 * Reusable panel for listing + uploading documents linked to a specific entity.
 * Drop into any detail view (Contracts, Projects, Employees, ...).
 */
export function DocumentsPanel({ entityType, entityId, defaultCategory, title }: DocumentsPanelProps) {
  const [addOpen, setAddOpen] = useState(false);
  const { data: docs, isLoading } = useEntityDocuments(entityType, entityId);
  const deleteDoc = useDeleteDocument();

  const open = async (path: string) => {
    const url = await getDocumentSignedUrl(path, 120);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{title ?? "Documents"}</h3>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Add
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : !docs?.length ? (
        <div className="border border-dashed rounded-lg py-8 text-center text-muted-foreground text-sm">
          <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No documents linked yet.</p>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{d.title}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {d.file_name} · {format(new Date(d.created_at), "MMM d, yyyy")}
                </p>
              </div>
              <Badge variant="outline" className="capitalize text-xs">{d.category}</Badge>
              {d.file_url && (
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => open(d.file_url)}>
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-destructive"
                onClick={() => deleteDoc.mutate(d.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <AddDocumentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        defaultCategory={defaultCategory ?? entityType}
        relatedEntityType={entityType}
        relatedEntityId={entityId}
      />
    </div>
  );
}
