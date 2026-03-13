import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Sparkles, Check, FileText, Palette, MessageSquare, Newspaper, BookOpen, ShieldCheck, AlertCircle, Package, Puzzle, ImageIcon, AlertTriangle, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StarterTemplate } from '@/data/templates';
import { validateTemplate, ValidationResult } from '@/lib/template-validator';
import { extractImagesFromTemplate } from '@/lib/image-extraction';
import { TemplatePreviewDialog, TemplateOverwriteOptions } from '@/components/admin/templates/TemplatePreviewDialog';
import { FlowPilotOnboardingWizard } from '@/components/admin/FlowPilotOnboardingWizard';
import { useTemplateInstaller } from '@/hooks/useTemplateInstaller';

interface InstallTemplateDialogProps {
  template: StarterTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InstallTemplateDialog({ template, open, onOpenChange }: InstallTemplateDialogProps) {
  const navigate = useNavigate();
  const installer = useTemplateInstaller();
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [showOnboardingWizard, setShowOnboardingWizard] = useState(false);

  const templateImageInfo = useMemo(() => {
    if (!template) return null;
    return extractImagesFromTemplate(template);
  }, [template]);

  const handleValidate = () => {
    if (!template) return;
    const result = validateTemplate(template);
    setValidationResult(result);
    setShowValidationDialog(true);
  };

  const handleInstall = (options?: TemplateOverwriteOptions) => {
    if (!template) return;
    installer.install(template, options);
  };

  const handleClose = () => {
    if (installer.step === 'creating') return; // Prevent closing during install
    installer.reset();
    setValidationResult(null);
    onOpenChange(false);
  };

  if (!template) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-lg">
          {installer.step === 'idle' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Install Template
                </DialogTitle>
                <DialogDescription>
                  Review what will be created, then install.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-lg">{template.name}</h3>
                  <p className="text-sm text-muted-foreground">{template.tagline}</p>
                </div>

                <div className="flex flex-wrap gap-3 text-sm">
                  <div className="flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span>{template.pages.length} pages</span>
                  </div>
                  {template.products && template.products.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <span>{template.products.length} products</span>
                    </div>
                  )}
                  {template.blogPosts && template.blogPosts.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Newspaper className="h-4 w-4 text-muted-foreground" />
                      <span>{template.blogPosts.length} blog posts</span>
                    </div>
                  )}
                  {template.kbCategories && template.kbCategories.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <BookOpen className="h-4 w-4 text-muted-foreground" />
                      <span>{template.kbCategories.reduce((acc, cat) => acc + cat.articles.length, 0)} KB articles</span>
                    </div>
                  )}
                  {template.requiredModules && template.requiredModules.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Puzzle className="h-4 w-4 text-muted-foreground" />
                      <span>{template.requiredModules.length} modules</span>
                    </div>
                  )}
                  {templateImageInfo && templateImageInfo.uniqueUrls.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      <span>{templateImageInfo.uniqueUrls.length} images</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <Palette className="h-4 w-4 text-muted-foreground" />
                    <span>Branding</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <span>AI Chat</span>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium mb-2">Pages:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {template.pages.map((page) => (
                      <Badge key={page.slug} variant="secondary" className="text-xs">
                        {page.title}
                        {page.isHomePage && <span className="ml-1 opacity-60">(Home)</span>}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t">
                  <Button variant="outline" size="sm" onClick={handleValidate} className="gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Validate
                  </Button>
                  <div className="flex-1" />
                  {installer.hasExistingContent ? (
                    <Button onClick={() => setShowPreviewDialog(true)} className="gap-1.5">
                      <Eye className="h-3.5 w-3.5" />
                      Review & Install
                    </Button>
                  ) : (
                    <Button onClick={() => handleInstall()} className="gap-1.5">
                      <Sparkles className="h-3.5 w-3.5" />
                      Install
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}

          {installer.step === 'creating' && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <div>
                  <h3 className="font-semibold">Installing Template</h3>
                  <p className="text-sm text-muted-foreground">Please wait...</p>
                </div>
              </div>
              <Progress value={installer.progressPercent} className="h-2" />
              <p className="text-sm text-muted-foreground">{installer.progress.currentStep}</p>
            </div>
          )}

          {installer.step === 'done' && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3">
                <Check className="h-5 w-5 text-primary" />
                <div>
                  <h3 className="font-semibold">Template Installed!</h3>
                  <p className="text-sm text-muted-foreground">
                    Created {template.pages.length} pages successfully.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {template.pages.map((page) => (
                  <Badge key={page.slug} variant="secondary" className="gap-1 text-xs">
                    <Check className="h-3 w-3" />
                    {page.title}
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2 pt-2 border-t">
                <Button variant="outline" size="sm" onClick={() => navigate('/admin/pages')}>
                  View Pages
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowOnboardingWizard(true)} className="gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  Set Goals
                </Button>
                {installer.createdPageIds[0] && (
                  <Button size="sm" onClick={() => navigate(`/admin/pages/${installer.createdPageIds[0]}`)}>
                    Edit Homepage
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Overwrite options dialog */}
      <TemplatePreviewDialog
        open={showPreviewDialog}
        onOpenChange={setShowPreviewDialog}
        template={template}
        existingContent={installer.existingContent}
        templateImageCount={templateImageInfo?.uniqueUrls.length || 0}
        onApply={(options) => {
          setShowPreviewDialog(false);
          handleInstall(options);
        }}
      />

      {/* Validation dialog */}
      <Dialog open={showValidationDialog} onOpenChange={setShowValidationDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {validationResult?.valid ? (
                <><Check className="h-5 w-5 text-primary" /> Template Valid</>
              ) : (
                <><AlertCircle className="h-5 w-5 text-destructive" /> Validation Issues</>
              )}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-96">
            <div className="space-y-4">
              {validationResult?.errors?.map((error, i) => (
                <div key={i} className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">
                  <strong>{error.path}:</strong> {error.message}
                </div>
              ))}
              {validationResult?.warnings?.map((warning, i) => (
                <div key={i} className="text-sm text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 rounded px-3 py-2">
                  <strong>{warning.path}:</strong> {warning.message}
                </div>
              ))}
              {validationResult?.valid && !validationResult.errors.length && !validationResult.warnings.length && (
                <div className="text-center py-4 text-muted-foreground">
                  <Check className="h-10 w-10 mx-auto mb-2 text-primary" />
                  <p className="text-sm">No issues found.</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* FlowPilot onboarding */}
      <FlowPilotOnboardingWizard
        open={showOnboardingWizard}
        onOpenChange={setShowOnboardingWizard}
        templateName={template.name}
      />
    </>
  );
}
