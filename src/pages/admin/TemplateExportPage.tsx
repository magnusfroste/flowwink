/**
 * Template Export Page
 * 
 * Allows exporting the current site configuration as a reusable template.
 */

import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  FileCode, 
  FileJson, 
  Download, 
  Copy, 
  CheckCircle, 
  AlertTriangle, 
  XCircle,
  Rocket,
  Building2,
  Shield,
  Layers,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import { useTemplateExport } from '@/hooks/useTemplateExport';
import { TemplateMetadata } from '@/lib/template-exporter';

const CATEGORY_OPTIONS = [
  { value: 'startup', label: 'Startup', icon: Rocket },
  { value: 'enterprise', label: 'Enterprise', icon: Building2 },
  { value: 'compliance', label: 'Compliance', icon: Shield },
  { value: 'platform', label: 'Platform', icon: Layers },
  { value: 'helpcenter', label: 'Help Center', icon: HelpCircle },
] as const;

const ICON_OPTIONS = [
  'Rocket', 'Building2', 'Shield', 'Layers', 'HelpCircle', 
  'Sparkles', 'Zap', 'Heart', 'Star', 'Globe',
  'Briefcase', 'Code', 'Palette', 'ShoppingCart', 'Users',
];

export default function TemplateExportPage() {
  const { isExporting, exportResult, exportTemplate, downloadJson, downloadCode, copyToClipboard } = useTemplateExport();
  
  const [metadata, setMetadata] = useState<TemplateMetadata>({
    id: 'kristallen-dental',
    name: 'Kristallen Dental Clinic',
    description: 'Professional dental clinic template with booking, team showcase, and service presentation.',
    category: 'enterprise',
    icon: 'Heart',
    tagline: 'Modern dental care with a personal touch',
  });

  const handleExport = async () => {
    await exportTemplate(metadata);
  };

  const getCategoryIcon = (category: string) => {
    const option = CATEGORY_OPTIONS.find(c => c.value === category);
    return option ? option.icon : Layers;
  };

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Export as Template"
          description="Create a reusable template from your current site configuration"
        />

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Configuration Panel */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Template Configuration
              </CardTitle>
              <CardDescription>
                Define metadata for your template
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="template-id">Template ID</Label>
                <Input
                  id="template-id"
                  value={metadata.id}
                  onChange={(e) => setMetadata({ ...metadata, id: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                  placeholder="my-template"
                />
                <p className="text-xs text-muted-foreground">
                  Unique identifier (lowercase, hyphens only)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="template-name">Template Name</Label>
                <Input
                  id="template-name"
                  value={metadata.name}
                  onChange={(e) => setMetadata({ ...metadata, name: e.target.value })}
                  placeholder="My Amazing Template"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="template-tagline">Tagline</Label>
                <Input
                  id="template-tagline"
                  value={metadata.tagline}
                  onChange={(e) => setMetadata({ ...metadata, tagline: e.target.value })}
                  placeholder="A short catchy description"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="template-description">Description</Label>
                <Textarea
                  id="template-description"
                  value={metadata.description}
                  onChange={(e) => setMetadata({ ...metadata, description: e.target.value })}
                  placeholder="Detailed description of what this template includes..."
                  rows={3}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={metadata.category}
                    onValueChange={(value: TemplateMetadata['category']) => 
                      setMetadata({ ...metadata, category: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex items-center gap-2">
                            <option.icon className="h-4 w-4" />
                            {option.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Icon</Label>
                  <Select
                    value={metadata.icon}
                    onValueChange={(value) => setMetadata({ ...metadata, icon: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ICON_OPTIONS.map((icon) => (
                        <SelectItem key={icon} value={icon}>
                          {icon}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button 
                onClick={handleExport} 
                disabled={isExporting}
                className="w-full"
                size="lg"
              >
                {isExporting ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Exporting...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Template
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Preview Panel */}
          <Card>
            <CardHeader>
              <CardTitle>Template Preview</CardTitle>
              <CardDescription>
                Preview how your template will appear in the gallery
              </CardDescription>
            </CardHeader>
            <CardContent>
              {exportResult ? (
                <div className="space-y-4">
                  {/* Template Card Preview */}
                  <div className="border rounded-lg p-4 bg-gradient-to-br from-background to-muted/30">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-md bg-primary/10">
                        {(() => {
                          const Icon = getCategoryIcon(metadata.category);
                          return <Icon className="h-6 w-6 text-primary" />;
                        })()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold">{metadata.name}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {metadata.tagline}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="secondary" className="capitalize">
                            {metadata.category}
                          </Badge>
                          <Badge variant="outline">
                            {exportResult.template.pages.length} pages
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Validation Status */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {exportResult.validation.valid ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-destructive" />
                      )}
                      <span className="font-medium">
                        {exportResult.validation.valid ? 'Valid Template' : 'Validation Failed'}
                      </span>
                    </div>
                    
                    {exportResult.validation.errors.length > 0 && (
                      <div className="space-y-1">
                        {exportResult.validation.errors.map((error, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm text-destructive">
                            <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                            {error}
                          </div>
                        ))}
                      </div>
                    )}

                    {exportResult.validation.warnings.length > 0 && (
                      <div className="space-y-1">
                        {exportResult.validation.warnings.map((warning, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm text-yellow-600">
                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                            {warning}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 rounded bg-muted/50">
                      <div className="text-2xl font-bold">{exportResult.template.pages.length}</div>
                      <div className="text-xs text-muted-foreground">Pages</div>
                    </div>
                    <div className="p-2 rounded bg-muted/50">
                      <div className="text-2xl font-bold">
                        {exportResult.template.pages.reduce((acc, p) => acc + p.blocks.length, 0)}
                      </div>
                      <div className="text-xs text-muted-foreground">Blocks</div>
                    </div>
                    <div className="p-2 rounded bg-muted/50">
                      <div className="text-2xl font-bold">
                        {exportResult.template.blogPosts?.length || 0}
                      </div>
                      <div className="text-xs text-muted-foreground">Blog Posts</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <FileCode className="h-12 w-12 mb-4 opacity-50" />
                  <p>Configure and generate your template</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Output Tabs */}
        {exportResult && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Generated Output</CardTitle>
              <CardDescription>
                Download or copy the generated template code
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="json">
                <div className="flex items-center justify-between mb-4">
                  <TabsList>
                    <TabsTrigger value="json" className="flex items-center gap-2">
                      <FileJson className="h-4 w-4" />
                      JSON
                    </TabsTrigger>
                    <TabsTrigger value="typescript" className="flex items-center gap-2">
                      <FileCode className="h-4 w-4" />
                      TypeScript
                    </TabsTrigger>
                  </TabsList>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(exportResult.json, 'json')}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadJson(exportResult.template)}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download JSON
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadCode(exportResult.template)}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download TS
                    </Button>
                  </div>
                </div>

                <TabsContent value="json">
                  <ScrollArea className="h-[400px] rounded-md border bg-muted/30">
                    <pre className="p-4 text-sm font-mono whitespace-pre-wrap">
                      {exportResult.json}
                    </pre>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="typescript">
                  <ScrollArea className="h-[400px] rounded-md border bg-muted/30">
                    <pre className="p-4 text-sm font-mono whitespace-pre-wrap">
                      {exportResult.code}
                    </pre>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </AdminPageContainer>
    </AdminLayout>
  );
}
