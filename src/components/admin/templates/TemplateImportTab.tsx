/**
 * Template Import Tab
 * 
 * Provides import functionality — wraps the existing TemplateImportDialog
 * in a standalone tab view with guidance text.
 */

import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, FileJson, Archive } from 'lucide-react';
import { TemplateImportDialog } from '@/components/admin/templates/TemplateImportDialog';
import { StarterTemplate } from '@/data/templates';
import { toast } from 'sonner';

export function TemplateImportTab() {
  const navigate = useNavigate();

  const handleImportTemplate = (template: StarterTemplate) => {
    toast.success(`Template "${template.name}" imported successfully!`);
    sessionStorage.setItem('pendingTemplate', JSON.stringify(template));
    navigate('/admin/templates');
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Template
          </CardTitle>
          <CardDescription>
            Import a template from a JSON or ZIP file to use on this site
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <FileJson className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-sm">JSON File</p>
                <p className="text-sm text-muted-foreground">
                  Import a template exported as JSON — includes pages, blocks, blog posts, and configuration.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <Archive className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-sm">ZIP Archive</p>
                <p className="text-sm text-muted-foreground">
                  Import a ZIP bundle that includes template data and images.
                </p>
              </div>
            </div>
          </div>

          <TemplateImportDialog
            trigger={
              <Button size="lg" className="w-full gap-2">
                <Upload className="h-4 w-4" />
                Choose File to Import
              </Button>
            }
            onImport={handleImportTemplate}
          />
        </CardContent>
      </Card>
    </div>
  );
}
