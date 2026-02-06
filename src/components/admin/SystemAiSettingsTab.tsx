import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Info, Sparkles } from 'lucide-react';
import { SystemAiSettings, SystemAiProvider } from '@/hooks/useSiteSettings';
import { useIsOpenAIConfigured, useIsGeminiConfigured } from '@/hooks/useIntegrationStatus';

interface SystemAiSettingsTabProps {
  data: SystemAiSettings;
  onChange: (data: SystemAiSettings) => void;
}

export function SystemAiSettingsTab({ data, onChange }: SystemAiSettingsTabProps) {
  const openaiEnabled = useIsOpenAIConfigured();
  const geminiEnabled = useIsGeminiConfigured();
  const hasAnyProvider = openaiEnabled || geminiEnabled;

  const updateField = <K extends keyof SystemAiSettings>(key: K, value: SystemAiSettings[K]) => {
    onChange({ ...data, [key]: value });
  };

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>What is System AI?</AlertTitle>
        <AlertDescription>
          System AI powers internal admin tools like text generation (expand, improve, translate), 
          company enrichment, lead qualification, and content migration. This is separate from the 
          visitor-facing AI Chat which is configured in Chat Settings.
        </AlertDescription>
      </Alert>

      {!hasAnyProvider && (
        <Alert variant="destructive">
          <AlertTitle>No AI Provider Configured</AlertTitle>
          <AlertDescription>
            You need to enable OpenAI or Gemini in Integrations and add the API key to Supabase Secrets 
            before System AI features will work.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-serif flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              AI Provider
            </CardTitle>
            <CardDescription>Choose which AI model powers internal tools</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select
                value={data.provider}
                onValueChange={(value: SystemAiProvider) => updateField('provider', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai" disabled={!openaiEnabled}>
                    <div className="flex items-center gap-2">
                      OpenAI
                      {openaiEnabled ? (
                        <Badge variant="outline" className="text-xs">Enabled</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Not configured</Badge>
                      )}
                    </div>
                  </SelectItem>
                  <SelectItem value="gemini" disabled={!geminiEnabled}>
                    <div className="flex items-center gap-2">
                      Google Gemini
                      {geminiEnabled ? (
                        <Badge variant="outline" className="text-xs">Enabled</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Not configured</Badge>
                      )}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {data.provider === 'openai' && (
              <div className="space-y-2">
                <Label>OpenAI Model</Label>
                <Select
                  value={data.openaiModel}
                  onValueChange={(value: SystemAiSettings['openaiModel']) => updateField('openaiModel', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-4o">GPT-4o (Best quality)</SelectItem>
                    <SelectItem value="gpt-4o-mini">GPT-4o Mini (Fast & affordable)</SelectItem>
                    <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo (Legacy)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  GPT-4o Mini is recommended for most use cases
                </p>
              </div>
            )}

            {data.provider === 'gemini' && (
              <div className="space-y-2">
                <Label>Gemini Model</Label>
                <Select
                  value={data.geminiModel}
                  onValueChange={(value: SystemAiSettings['geminiModel']) => updateField('geminiModel', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini-2.0-flash-exp">Gemini 2.0 Flash (Recommended)</SelectItem>
                    <SelectItem value="gemini-1.5-pro">Gemini 1.5 Pro (Best quality)</SelectItem>
                    <SelectItem value="gemini-1.5-flash">Gemini 1.5 Flash (Fast)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Gemini 2.0 Flash offers the best balance of speed and quality
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif">Content Preferences</CardTitle>
            <CardDescription>Default settings for AI-generated content</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Default Tone</Label>
              <Select
                value={data.defaultTone}
                onValueChange={(value: SystemAiSettings['defaultTone']) => updateField('defaultTone', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="friendly">Friendly</SelectItem>
                  <SelectItem value="formal">Formal</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Used when generating or improving text content
              </p>
            </div>

            <div className="space-y-2">
              <Label>Default Language</Label>
              <Select
                value={data.defaultLanguage}
                onValueChange={(value) => updateField('defaultLanguage', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sv">Swedish</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="no">Norwegian</SelectItem>
                  <SelectItem value="da">Danish</SelectItem>
                  <SelectItem value="fi">Finnish</SelectItem>
                  <SelectItem value="de">German</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Primary language for content generation
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif">Powered Features</CardTitle>
          <CardDescription>These features use System AI settings</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border p-4">
              <h4 className="font-medium text-sm">Text Generation</h4>
              <p className="text-xs text-muted-foreground mt-1">
                Expand, improve, summarize, translate, and continue text in editors
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <h4 className="font-medium text-sm">Company Enrichment</h4>
              <p className="text-xs text-muted-foreground mt-1">
                Auto-extract company info from websites in CRM
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <h4 className="font-medium text-sm">Lead Qualification</h4>
              <p className="text-xs text-muted-foreground mt-1">
                AI-powered lead scoring and summaries
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <h4 className="font-medium text-sm">Content Migration</h4>
              <p className="text-xs text-muted-foreground mt-1">
                Import pages from external websites
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
