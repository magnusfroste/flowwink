import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, FileText, Tag, Plus, Pencil, Copy, Trash2 } from 'lucide-react';
import {
  useAccountingTemplates,
  useDeleteAccountingTemplate,
  type AccountingTemplate,
  type TemplateLine,
} from '@/hooks/useAccounting';
import { Skeleton } from '@/components/ui/skeleton';
import { useAccountingLocale } from '@/hooks/useAccountingLocale';
import { EditTemplateDialog } from './EditTemplateDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function TemplatesTab() {
  const { locale } = useAccountingLocale();
  const [search, setSearch] = useState('');
  const { data: templates, isLoading } = useAccountingTemplates(locale);
  const deleteMut = useDeleteAccountingTemplate();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AccountingTemplate | null>(null);
  const [cloneTarget, setCloneTarget] = useState<AccountingTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AccountingTemplate | null>(null);

  const openNew = () => {
    setEditTarget(null);
    setCloneTarget(null);
    setDialogOpen(true);
  };
  const openEdit = (t: AccountingTemplate) => {
    setEditTarget(t);
    setCloneTarget(null);
    setDialogOpen(true);
  };
  const openClone = (t: AccountingTemplate) => {
    setEditTarget(null);
    setCloneTarget(t);
    setDialogOpen(true);
  };

  const filtered = (templates || []).filter(
    (t) =>
      !search ||
      t.template_name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      t.category.toLowerCase().includes(search.toLowerCase()) ||
      t.keywords?.some((k) => k.toLowerCase().includes(search.toLowerCase())),
  );

  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, t) => {
    const cat = t.category || 'general';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(t);
    return acc;
  }, {});

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates by name, keyword, or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" />
          New template
        </Button>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No templates found</h3>
            <Button variant="outline" onClick={openNew}>
              <Plus className="h-4 w-4 mr-1" />
              Create your first template
            </Button>
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([category, items]) => (
          <div key={category}>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
              {category}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((template) => {
                const lines = template.template_lines as TemplateLine[];
                return (
                  <Card key={template.id} className="group">
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between mb-2 gap-2">
                        <div className="min-w-0">
                          <h4 className="font-medium truncate">{template.template_name}</h4>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {template.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {template.is_system && (
                            <Badge variant="outline" className="text-xs">
                              System
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Lines preview */}
                      <div className="mt-3 space-y-1">
                        {lines.map((line, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <Badge
                              variant="secondary"
                              className={`w-14 justify-center ${
                                line.type === 'debit'
                                  ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                                  : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                              }`}
                            >
                              {line.type === 'debit' ? 'Debit' : 'Credit'}
                            </Badge>
                            <span className="font-mono">{line.account_code}</span>
                            <span className="text-muted-foreground truncate">
                              {line.account_name}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Keywords */}
                      {template.keywords && template.keywords.length > 0 && (
                        <div className="flex items-center gap-1 mt-3 flex-wrap">
                          <Tag className="h-3 w-3 text-muted-foreground" />
                          {template.keywords.slice(0, 4).map((kw) => (
                            <Badge key={kw} variant="outline" className="text-xs">
                              {kw}
                            </Badge>
                          ))}
                          {template.keywords.length > 4 && (
                            <span className="text-xs text-muted-foreground">
                              +{template.keywords.length - 4}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="mt-3 pt-3 border-t flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEdit(template)}
                        >
                          <Pencil className="h-3 w-3 mr-1" /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openClone(template)}
                        >
                          <Copy className="h-3 w-3 mr-1" /> Clone
                        </Button>
                        {!template.is_system && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive ml-auto"
                            onClick={() => setDeleteTarget(template)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))
      )}

      <EditTemplateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        template={editTarget}
        cloneFrom={cloneTarget}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.template_name}" will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deleteTarget) {
                  await deleteMut.mutateAsync(deleteTarget.id);
                  setDeleteTarget(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
