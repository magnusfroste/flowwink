import { useState, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useCreateDocument } from "@/hooks/useDocuments";
import { toast } from "sonner";
import { UploadCloud, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORIES = ["general", "contract", "hr", "finance", "project"] as const;

interface AddDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fill category (e.g. when opened from a contract view) */
  defaultCategory?: string;
  /** Pre-link to an entity (contract, employee, project...) */
  relatedEntityType?: string;
  relatedEntityId?: string;
}

export function AddDocumentDialog({
  open,
  onOpenChange,
  defaultCategory = "general",
  relatedEntityType,
  relatedEntityId,
}: AddDocumentDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(defaultCategory);
  const [folder, setFolder] = useState("");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const createDoc = useCreateDocument();

  const reset = () => {
    setFile(null);
    setTitle("");
    setCategory(defaultCategory);
    setFolder("");
    setDescription("");
    setProgress(0);
    setUploading(false);
  };

  const handleFile = useCallback((f: File) => {
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  }, [title]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const handleSubmit = async () => {
    if (!file) return toast.error("Pick a file first");
    if (!title.trim()) return toast.error("Title is required");

    setUploading(true);
    setProgress(10);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const ext = file.name.split(".").pop() || "bin";
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      setProgress(40);
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (upErr) throw upErr;

      setProgress(80);
      // Private bucket → store the storage path; signed URLs are generated on demand.
      await createDoc.mutateAsync({
        title: title.trim(),
        file_name: file.name,
        file_url: path,
        file_type: file.type || null,
        file_size_bytes: file.size,
        category,
        folder: folder.trim() || null,
        description: description.trim() || null,
        related_entity_type: relatedEntityType ?? null,
        related_entity_id: relatedEntityId ?? null,
        uploaded_by: user.id,
      });

      setProgress(100);
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!uploading) { onOpenChange(o); if (!o) reset(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add document</DialogTitle>
          <DialogDescription>
            Upload a file to the central archive. Supports contracts, HR docs, invoices and project files.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
              dragOver ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
              file && "bg-muted/30"
            )}
          >
            {file ? (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0 text-left">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0"
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <UploadCloud className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="text-sm">Drop a file here or click to browse</p>
                <p className="text-xs text-muted-foreground">Max 50 MB</p>
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="doc-title">Title</Label>
              <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Document title" />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-folder">Folder (optional)</Label>
              <Input id="doc-folder" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="e.g. 2026/Q1" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="doc-desc">Description (optional)</Label>
              <Textarea id="doc-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>

          {uploading && <Progress value={progress} className="h-1.5" />}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={uploading}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={uploading || !file}>
            {uploading ? "Uploading..." : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
