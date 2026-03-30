import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Info, Sparkles, ExternalLink, Server } from 'lucide-react';
import { SystemAiSettings, SystemAiProvider } from '@/hooks/useSiteSettings';
import { useIsOpenAIConfigured, useIsGeminiConfigured, useIsLocalLLMConfigured } from '@/hooks/useIntegrationStatus';
import { Link } from 'react-router-dom';

interface SystemAiSettingsTabProps {
  data: SystemAiSettings;
  onChange: (data: SystemAiSettings) => void;
}

export function SystemAiSettingsTab({ data, onChange }: SystemAiSettingsTabProps) {
  const openaiEnabled = useIsOpenAIConfigured();
  const geminiEnabled = useIsGeminiConfigured();
  const localEnabled = useIsLocalLLMConfigured();
  const hasAnyProvider = openaiEnabled || geminiEnabled || localEnabled;

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
            You need to enable OpenAI or Gemini in{' '}
            <Link to="/admin/integrations#ai" className="underline font-medium hover:text-destructive-foreground inline-flex items-center gap-1">
              Integrations <ExternalLink className="h-3 w-3" />
            </Link>{' '}
            and add the API key, or configure a Local LLM endpoint, before System AI features will work.
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
            <CardDescription>Choose which AI provider powers internal tools</CardDescription>
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
          <CardTitle className="font-serif flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Model Configuration
          </CardTitle>
          <CardDescription>
            FlowPilot uses two models: a fast model for real-time chat and tool execution, 
            and a reasoning model for deep analysis, research, and planning.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.provider === 'openai' && (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Chat & Interaction Model</Label>
                <Select
                  value={data.openaiModel}
                  onValueChange={(value: SystemAiSettings['openaiModel']) => updateField('openaiModel', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-4.1">GPT-4.1</SelectItem>
                    <SelectItem value="gpt-4.1-mini">GPT-4.1 Mini</SelectItem>
                    <SelectItem value="gpt-4.1-nano">GPT-4.1 Nano</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Used for real-time chat, tool calls, and quick tasks
                </p>
              </div>
              <div className="space-y-2">
                <Label>Research & Reasoning Model</Label>
                <Select
                  value={data.openaiReasoningModel}
                  onValueChange={(value: SystemAiSettings['openaiReasoningModel']) => updateField('openaiReasoningModel', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-4.1">GPT-4.1</SelectItem>
                    <SelectItem value="gpt-4.1-mini">GPT-4.1 Mini</SelectItem>
                    <SelectItem value="gpt-4.1-nano">GPT-4.1 Nano</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Used for objectives, planning, content research, and deep analysis
                </p>
              </div>
            </div>
          )}

          {data.provider === 'gemini' && (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Chat & Interaction Model</Label>
                <Select
                  value={data.geminiModel}
                  onValueChange={(value: SystemAiSettings['geminiModel']) => updateField('geminiModel', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
                    <SelectItem value="gemini-2.0-flash-exp">Gemini 2.0 Flash</SelectItem>
                    <SelectItem value="gemini-1.5-flash">Gemini 1.5 Flash</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Used for real-time chat, tool calls, and quick tasks
                </p>
              </div>
              <div className="space-y-2">
                <Label>Research & Reasoning Model</Label>
                <Select
                  value={data.geminiReasoningModel}
                  onValueChange={(value: SystemAiSettings['geminiReasoningModel']) => updateField('geminiReasoningModel', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
                    <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
                    <SelectItem value="gemini-1.5-pro">Gemini 1.5 Pro</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Used for objectives, planning, content research, and deep analysis
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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
