import { useMemo, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageContainer } from "@/components/admin/AdminPageContainer";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDocuments, useDeleteDocument, getDocumentSignedUrl } from "@/hooks/useDocuments";
import { FileText, Trash2, ExternalLink, FolderOpen, Plus } from "lucide-react";
import { format } from "date-fns";
import { AddDocumentDialog } from "@/components/admin/documents/AddDocumentDialog";
import { DocumentTagsCell } from "@/components/admin/documents/DocumentTagsCell";
import { DocumentDetailSheet } from "@/components/admin/documents/DocumentDetailSheet";

const CATEGORIES = ["all", "general", "contract", "hr", "finance", "project"];

function formatSize(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const [category, setCategory] = useState("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [detailDoc, setDetailDoc] = useState<null | ReturnType<typeof useDocuments>['data'] extends (infer T)[] | undefined ? T : never>(null);
  const { data: documents, isLoading } = useDocuments(category);
  const deleteDoc = useDeleteDocument();

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const d of documents ?? []) for (const t of d.tags ?? []) set.add(t);
    return Array.from(set).sort();
  }, [documents]);

  const filteredDocs = useMemo(() => {
    if (tagFilter === "all") return documents ?? [];
    return (documents ?? []).filter((d) => (d.tags ?? []).includes(tagFilter));
  }, [documents, tagFilter]);

  const openFile = async (filePath: string) => {
    const url = await getDocumentSignedUrl(filePath, 120);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader title="Documents">
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add document
          </Button>
        </AdminPageHeader>

        <Tabs value={category} onValueChange={setCategory}>
          <TabsList>
            {CATEGORIES.map((c) => (
              <TabsTrigger key={c} value={c} className="capitalize">{c}</TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value={category}>
            <Card>
              <CardContent className="pt-6 space-y-4">
                {allTags.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Tag:</span>
                    <Select value={tagFilter} onValueChange={setTagFilter}>
                      <SelectTrigger className="h-8 w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All tags</SelectItem>
                        {allTags.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {tagFilter !== "all" && (
                      <Button variant="ghost" size="sm" onClick={() => setTagFilter("all")}>Clear</Button>
                    )}
                  </div>
                )}
                {isLoading ? (
                  <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : !filteredDocs.length ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>{documents?.length ? "No documents match this tag." : "No documents in this category."}</p>
                    <Button variant="outline" className="mt-4" onClick={() => setAddOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" /> Add your first document
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Document</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead>Folder</TableHead>
                        <TableHead>Tags</TableHead>
                        <TableHead>Added</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDocs.map((doc) => (
                        <TableRow key={doc.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="font-medium">{doc.title}</p>
                                <p className="text-xs text-muted-foreground">{doc.file_name}</p>
                                {doc.related_entity_type && doc.related_entity_id && (
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    Linked to:{' '}
                                    <span className="capitalize font-medium">{doc.related_entity_type}</span>
                                    {' · '}
                                    <code className="text-[10px]">{doc.related_entity_id.slice(0, 8)}</code>
                                  </p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">{doc.category}</Badge>
                          </TableCell>
                          <TableCell className="text-sm">{formatSize(doc.file_size_bytes)}</TableCell>
                          <TableCell className="text-sm">{doc.folder || "—"}</TableCell>
                          <TableCell>
                            <DocumentTagsCell documentId={doc.id} tags={doc.tags} />
                          </TableCell>
                          <TableCell className="text-sm">{format(new Date(doc.created_at), "MMM d, yyyy")}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {doc.file_url && (
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openFile(doc.file_url)}>
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteDoc.mutate(doc.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <AddDocumentDialog open={addOpen} onOpenChange={setAddOpen} />
      </AdminPageContainer>
    </AdminLayout>
  );
}
