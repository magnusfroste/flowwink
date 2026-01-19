/**
 * Template Import Dialog
 * 
 * Allows importing JSON template files for preview and application.
 */

import { useState, useCallback } from 'react';
import { Upload, FileJson, CheckCircle, XCircle, AlertTriangle, Sparkles, FileText, Palette, MessageSquare } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { StarterTemplate } from '@/data/starter-templates';
import { importTemplateFromFile, parseTemplateJson, modifyTemplate, generateTemplateId, ImportResult } from '@/lib/template-importer';
import { cn } from '@/lib/utils';

interface TemplateImportDialogProps {
  trigger?: React.ReactNode;
  onImport: (template: StarterTemplate) => void;
}

export function TemplateImportDialog({ trigger, onImport }: TemplateImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editedTemplate, setEditedTemplate] = useState<StarterTemplate | null>(null);
  const [jsonInput, setJsonInput] = useState('');

  const handleFileSelect = useCallback(async (file: File) => {
    const result = await importTemplateFromFile(file);
    setImportResult(result);
    if (result.template) {
      setEditedTemplate(result.template);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file && (file.type === 'application/json' || file.name.endsWith('.json'))) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleJsonPaste = useCallback(() => {
    if (!jsonInput.trim()) return;
    const result = parseTemplateJson(jsonInput);
    setImportResult(result);
    if (result.template) {
      setEditedTemplate(result.template);
    }
  }, [jsonInput]);

  const handleModifyTemplate = useCallback((field: keyof StarterTemplate, value: string) => {
    if (!editedTemplate) return;
    
    setEditedTemplate(modifyTemplate(editedTemplate, { [field]: value }));
  }, [editedTemplate]);

  const handleApply = useCallback(() => {
    if (!editedTemplate) return;
    
    // Generate unique ID if needed
    const finalTemplate = {
      ...editedTemplate,
      id: editedTemplate.id || generateTemplateId(editedTemplate.name),
    };
    
    onImport(finalTemplate);
    setOpen(false);
    resetState();
  }, [editedTemplate, onImport]);

  const resetState = useCallback(() => {
    setImportResult(null);
    setEditedTemplate(null);
    setEditMode(false);
    setJsonInput('');
  }, []);

  const handleOpenChange = useCallback((newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      resetState();
    }
  }, [resetState]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2">
            <Upload className="h-4 w-4" />
            Import Template
          </Button>
        )}
      </DialogTrigger>
      
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileJson className="h-5 w-5 text-primary" />
            Import Template
          </DialogTitle>
          <DialogDescription>
            Upload a JSON template file or paste JSON content to import and apply
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4">
            {/* File Upload / Paste Area */}
            {!importResult && (
              <div className="space-y-4">
                {/* Drag & Drop Zone */}
                <div
                  className={cn(
                    "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                    isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50"
                  )}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                >
                  <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground/50" />
                  <p className="text-sm font-medium mb-2">
                    Drag & drop a JSON template file
                  </p>
                  <p className="text-xs text-muted-foreground mb-4">
                    or click to browse
                  </p>
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleFileInputChange}
                    className="hidden"
                    id="template-file-input"
                  />
                  <label htmlFor="template-file-input">
                    <Button variant="secondary" size="sm" className="cursor-pointer" asChild>
                      <span>Browse Files</span>
                    </Button>
                  </label>
                </div>

                {/* Or paste JSON */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">or paste JSON</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Textarea
                    placeholder='{"id": "my-template", "name": "My Template", ...}'
                    value={jsonInput}
                    onChange={(e) => setJsonInput(e.target.value)}
                    rows={6}
                    className="font-mono text-xs"
                  />
                  <Button 
                    variant="secondary" 
                    onClick={handleJsonPaste}
                    disabled={!jsonInput.trim()}
                    className="w-full"
                  >
                    Parse JSON
                  </Button>
                </div>
              </div>
            )}

            {/* Import Result */}
            {importResult && (
              <div className="space-y-4">
                {/* Validation Status */}
                <div className={cn(
                  "p-4 rounded-lg border",
                  importResult.success ? "bg-success/10 border-success/30" : "bg-destructive/10 border-destructive/30"
                )}>
                  <div className="flex items-center gap-2 mb-2">
                    {importResult.success ? (
                      <CheckCircle className="h-5 w-5 text-success" />
                    ) : (
                      <XCircle className="h-5 w-5 text-destructive" />
                    )}
                    <span className="font-medium">
                      {importResult.success ? 'Template Valid' : 'Validation Failed'}
                    </span>
                  </div>
                  
                  {importResult.errors.length > 0 && (
                    <div className="space-y-1 mt-2">
                      {importResult.errors.map((error, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm text-destructive">
                          <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                          {error}
                        </div>
                      ))}
                    </div>
                  )}

                  {importResult.warnings.length > 0 && (
                    <div className="space-y-1 mt-2">
                      {importResult.warnings.map((warning, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm text-warning">
                          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                          {warning}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Template Preview / Edit */}
                {editedTemplate && (
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Template Details</CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditMode(!editMode)}
                        >
                          {editMode ? 'Done' : 'Edit'}
                        </Button>
                      </div>
                      <CardDescription>
                        {editMode ? 'Modify template metadata before applying' : 'Review template before applying'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {editMode ? (
                        <>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Template ID</Label>
                              <Input
                                value={editedTemplate.id}
                                onChange={(e) => handleModifyTemplate('id', e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Name</Label>
                              <Input
                                value={editedTemplate.name}
                                onChange={(e) => handleModifyTemplate('name', e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Tagline</Label>
                            <Input
                              value={editedTemplate.tagline}
                              onChange={(e) => handleModifyTemplate('tagline', e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Description</Label>
                            <Textarea
                              value={editedTemplate.description}
                              onChange={(e) => handleModifyTemplate('description', e.target.value)}
                              rows={2}
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-primary/10">
                              <Sparkles className="h-5 w-5 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold">{editedTemplate.name}</h4>
                              <p className="text-sm text-muted-foreground">{editedTemplate.tagline}</p>
                              <div className="flex items-center gap-2 mt-2">
                                <Badge variant="secondary" className="capitalize">
                                  {editedTemplate.category}
                                </Badge>
                                <Badge variant="outline">
                                  {editedTemplate.pages.length} pages
                                </Badge>
                              </div>
                            </div>
                          </div>

                          {/* Stats */}
                          <div className="grid grid-cols-3 gap-2 text-center pt-2">
                            <div className="p-2 rounded bg-muted/50">
                              <div className="flex items-center justify-center gap-1 text-muted-foreground">
                                <FileText className="h-3.5 w-3.5" />
                                <span className="text-sm font-medium">{editedTemplate.pages.length}</span>
                              </div>
                              <div className="text-xs text-muted-foreground">Pages</div>
                            </div>
                            <div className="p-2 rounded bg-muted/50">
                              <div className="flex items-center justify-center gap-1 text-muted-foreground">
                                <Palette className="h-3.5 w-3.5" />
                                <span className="text-sm font-medium">
                                  {editedTemplate.branding?.primaryColor ? '✓' : '–'}
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground">Branding</div>
                            </div>
                            <div className="p-2 rounded bg-muted/50">
                              <div className="flex items-center justify-center gap-1 text-muted-foreground">
                                <MessageSquare className="h-3.5 w-3.5" />
                                <span className="text-sm font-medium">
                                  {editedTemplate.chatSettings?.enabled ? '✓' : '–'}
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground">Chat</div>
                            </div>
                          </div>

                          {/* Pages list */}
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {editedTemplate.pages.map((page) => (
                              <Badge key={page.slug} variant="secondary" className="text-xs">
                                {page.title}
                                {page.isHomePage && <span className="ml-1 opacity-60">(Home)</span>}
                              </Badge>
                            ))}
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Try again button */}
                {!importResult.success && (
                  <Button variant="outline" onClick={resetState} className="w-full">
                    Try Another File
                  </Button>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="pt-4 border-t">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleApply}
            disabled={!importResult?.success || !editedTemplate}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Apply Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
