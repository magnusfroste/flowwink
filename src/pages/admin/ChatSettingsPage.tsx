import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useChatSettings, useUpdateChatSettings, ChatSettings, ChatAiProvider } from '@/hooks/useSiteSettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Save, AlertTriangle, Cloud, Server, Webhook, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function ChatSettingsPage() {
  const { data: settings, isLoading } = useChatSettings();
  const updateSettings = useUpdateChatSettings();
  const [formData, setFormData] = useState<ChatSettings | null>(null);

  useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  const handleSave = () => {
    if (formData) {
      updateSettings.mutate(formData);
    }
  };

  if (isLoading || !formData) {
    return (
      <AdminLayout title="Chat-inställningar">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Chat-inställningar">
      <div className="max-w-4xl space-y-6">
        {/* Master toggle */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>AI Chat-system</CardTitle>
                <CardDescription>
                  Aktivera AI-driven chat för din webbplats
                </CardDescription>
              </div>
              <Switch
                checked={formData.enabled}
                onCheckedChange={(enabled) => setFormData({ ...formData, enabled })}
              />
            </div>
          </CardHeader>
        </Card>

        {formData.enabled && (
          <Tabs defaultValue="general" className="space-y-6">
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="general">Allmänt</TabsTrigger>
              <TabsTrigger value="provider">AI-leverantör</TabsTrigger>
              <TabsTrigger value="display">Visning</TabsTrigger>
              <TabsTrigger value="privacy">Integritet</TabsTrigger>
            </TabsList>

            {/* General settings */}
            <TabsContent value="general">
              <Card>
                <CardHeader>
                  <CardTitle>Grundläggande inställningar</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Chattitel</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="AI Assistent"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="welcomeMessage">Välkomstmeddelande</Label>
                    <Textarea
                      id="welcomeMessage"
                      value={formData.welcomeMessage}
                      onChange={(e) => setFormData({ ...formData, welcomeMessage: e.target.value })}
                      placeholder="Hej! Hur kan jag hjälpa dig idag?"
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="placeholder">Placeholder-text</Label>
                    <Input
                      id="placeholder"
                      value={formData.placeholder}
                      onChange={(e) => setFormData({ ...formData, placeholder: e.target.value })}
                      placeholder="Skriv ditt meddelande..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="systemPrompt">System-prompt</Label>
                    <Textarea
                      id="systemPrompt"
                      value={formData.systemPrompt}
                      onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
                      placeholder="Du är en hjälpsam AI-assistent..."
                      rows={4}
                    />
                    <p className="text-xs text-muted-foreground">
                      Instruktioner till AI:n om hur den ska bete sig och svara.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* AI Provider settings */}
            <TabsContent value="provider">
              <Card>
                <CardHeader>
                  <CardTitle>AI-leverantör</CardTitle>
                  <CardDescription>
                    Välj hur AI-svaren ska genereras
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4">
                    {/* Provider selection */}
                    <div className="grid grid-cols-3 gap-4">
                      <ProviderCard
                        provider="lovable"
                        title="Lovable AI"
                        description="Cloud-baserad AI"
                        icon={<Cloud className="h-5 w-5" />}
                        badge="Rekommenderad"
                        selected={formData.aiProvider === 'lovable'}
                        onClick={() => setFormData({ ...formData, aiProvider: 'lovable' })}
                      />
                      <ProviderCard
                        provider="local"
                        title="Lokal AI"
                        description="HIPAA-kompatibel"
                        icon={<Server className="h-5 w-5" />}
                        badge="Privat"
                        badgeVariant="secondary"
                        selected={formData.aiProvider === 'local'}
                        onClick={() => setFormData({ ...formData, aiProvider: 'local' })}
                      />
                      <ProviderCard
                        provider="n8n"
                        title="N8N Webhook"
                        description="Agentic workflows"
                        icon={<Webhook className="h-5 w-5" />}
                        selected={formData.aiProvider === 'n8n'}
                        onClick={() => setFormData({ ...formData, aiProvider: 'n8n' })}
                      />
                    </div>

                    {/* Lovable AI settings */}
                    {formData.aiProvider === 'lovable' && (
                      <div className="space-y-4 pt-4 border-t">
                        <Alert>
                          <Cloud className="h-4 w-4" />
                          <AlertTitle>Cloud-baserad lösning</AlertTitle>
                          <AlertDescription>
                            Data skickas till externa AI-tjänster. Ej lämpligt för HIPAA eller känslig patientdata.
                          </AlertDescription>
                        </Alert>

                        <div className="space-y-2">
                          <Label>AI-modell</Label>
                          <Select
                            value={formData.lovableModel}
                            onValueChange={(value) => setFormData({ 
                              ...formData, 
                              lovableModel: value as ChatSettings['lovableModel']
                            })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="google/gemini-2.5-flash">Gemini 2.5 Flash (Snabb)</SelectItem>
                              <SelectItem value="google/gemini-2.5-pro">Gemini 2.5 Pro (Kraftfull)</SelectItem>
                              <SelectItem value="openai/gpt-5-mini">GPT-5 Mini (Balanserad)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                    {/* Local AI settings */}
                    {formData.aiProvider === 'local' && (
                      <div className="space-y-4 pt-4 border-t">
                        <Alert className="bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-900">
                          <Shield className="h-4 w-4 text-green-600" />
                          <AlertTitle className="text-green-800 dark:text-green-200">HIPAA-kompatibel</AlertTitle>
                          <AlertDescription className="text-green-700 dark:text-green-300">
                            All data bearbetas lokalt. Ingen data lämnar era servrar.
                          </AlertDescription>
                        </Alert>

                        <div className="space-y-2">
                          <Label htmlFor="localEndpoint">Endpoint-URL</Label>
                          <Input
                            id="localEndpoint"
                            value={formData.localEndpoint}
                            onChange={(e) => setFormData({ ...formData, localEndpoint: e.target.value })}
                            placeholder="http://localhost:11434"
                          />
                          <p className="text-xs text-muted-foreground">
                            OpenAI-kompatibel API (t.ex. Ollama, vLLM, LocalAI)
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="localModel">Modellnamn</Label>
                          <Input
                            id="localModel"
                            value={formData.localModel}
                            onChange={(e) => setFormData({ ...formData, localModel: e.target.value })}
                            placeholder="llama3"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="localApiKey">API-nyckel (valfri)</Label>
                          <Input
                            id="localApiKey"
                            type="password"
                            value={formData.localApiKey}
                            onChange={(e) => setFormData({ ...formData, localApiKey: e.target.value })}
                            placeholder="Om din lokala server kräver autentisering"
                          />
                        </div>
                      </div>
                    )}

                    {/* N8N settings */}
                    {formData.aiProvider === 'n8n' && (
                      <div className="space-y-4 pt-4 border-t">
                        <Alert>
                          <Webhook className="h-4 w-4" />
                          <AlertTitle>Agentic Workflows</AlertTitle>
                          <AlertDescription>
                            Koppla chatten till N8N för att utföra åtgärder som bokningar, datahämtning m.m.
                          </AlertDescription>
                        </Alert>

                        <div className="space-y-2">
                          <Label htmlFor="n8nWebhookUrl">Webhook-URL</Label>
                          <Input
                            id="n8nWebhookUrl"
                            value={formData.n8nWebhookUrl}
                            onChange={(e) => setFormData({ ...formData, n8nWebhookUrl: e.target.value })}
                            placeholder="https://n8n.example.com/webhook/..."
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Trigger-läge</Label>
                          <Select
                            value={formData.n8nTriggerMode}
                            onValueChange={(value) => setFormData({ 
                              ...formData, 
                              n8nTriggerMode: value as ChatSettings['n8nTriggerMode']
                            })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="always">Alla meddelanden</SelectItem>
                              <SelectItem value="keywords">Endast vid nyckelord</SelectItem>
                              <SelectItem value="fallback">Som fallback</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {formData.n8nTriggerMode === 'keywords' && (
                          <div className="space-y-2">
                            <Label htmlFor="n8nKeywords">Trigger-nyckelord</Label>
                            <Input
                              id="n8nKeywords"
                              value={formData.n8nTriggerKeywords.join(', ')}
                              onChange={(e) => setFormData({ 
                                ...formData, 
                                n8nTriggerKeywords: e.target.value.split(',').map(k => k.trim()).filter(Boolean)
                              })}
                              placeholder="boka, pris, kontakt"
                            />
                            <p className="text-xs text-muted-foreground">
                              Kommaseparerade nyckelord som triggar N8N-webhook
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Display settings */}
            <TabsContent value="display">
              <Card>
                <CardHeader>
                  <CardTitle>Visningsalternativ</CardTitle>
                  <CardDescription>
                    Välj var och hur chatten ska visas
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Landing page */}
                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div>
                      <h4 className="font-medium">Landningssida</h4>
                      <p className="text-sm text-muted-foreground">
                        Fullskärms-chatsida på /chat
                      </p>
                    </div>
                    <Switch
                      checked={formData.landingPageEnabled}
                      onCheckedChange={(landingPageEnabled) => 
                        setFormData({ ...formData, landingPageEnabled })
                      }
                    />
                  </div>

                  {/* Block */}
                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div>
                      <h4 className="font-medium">CMS-block</h4>
                      <p className="text-sm text-muted-foreground">
                        Möjlighet att lägga till chat på valfri sida
                      </p>
                    </div>
                    <Switch
                      checked={formData.blockEnabled}
                      onCheckedChange={(blockEnabled) => 
                        setFormData({ ...formData, blockEnabled })
                      }
                    />
                  </div>

                  {/* Widget */}
                  <div className="space-y-4 p-4 rounded-lg border">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">Flytande widget</h4>
                        <p className="text-sm text-muted-foreground">
                          Chat-knapp i hörnet på alla sidor
                        </p>
                      </div>
                      <Switch
                        checked={formData.widgetEnabled}
                        onCheckedChange={(widgetEnabled) => 
                          setFormData({ ...formData, widgetEnabled })
                        }
                      />
                    </div>

                    {formData.widgetEnabled && (
                      <div className="space-y-4 pt-4 border-t">
                        <div className="space-y-2">
                          <Label>Position</Label>
                          <Select
                            value={formData.widgetPosition}
                            onValueChange={(value) => setFormData({ 
                              ...formData, 
                              widgetPosition: value as ChatSettings['widgetPosition']
                            })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="bottom-right">Nedre högra</SelectItem>
                              <SelectItem value="bottom-left">Nedre vänstra</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="widgetButtonText">Knapptext</Label>
                          <Input
                            id="widgetButtonText"
                            value={formData.widgetButtonText}
                            onChange={(e) => setFormData({ ...formData, widgetButtonText: e.target.value })}
                            placeholder="Chatta med oss"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Privacy settings */}
            <TabsContent value="privacy">
              <Card>
                <CardHeader>
                  <CardTitle>Integritet & Efterlevnad</CardTitle>
                  <CardDescription>
                    Inställningar för datahantering och GDPR
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div>
                      <h4 className="font-medium">Spara konversationer</h4>
                      <p className="text-sm text-muted-foreground">
                        Lagra chatthistorik i databasen
                      </p>
                    </div>
                    <Switch
                      checked={formData.saveConversations}
                      onCheckedChange={(saveConversations) => 
                        setFormData({ ...formData, saveConversations })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div>
                      <h4 className="font-medium">Anonymisera data</h4>
                      <p className="text-sm text-muted-foreground">
                        Ta bort personnummer och känslig info
                      </p>
                    </div>
                    <Switch
                      checked={formData.anonymizeData}
                      onCheckedChange={(anonymizeData) => 
                        setFormData({ ...formData, anonymizeData })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div>
                      <h4 className="font-medium">Audit-loggning</h4>
                      <p className="text-sm text-muted-foreground">
                        Logga alla chattaktiviteter
                      </p>
                    </div>
                    <Switch
                      checked={formData.auditLogging}
                      onCheckedChange={(auditLogging) => 
                        setFormData({ ...formData, auditLogging })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dataRetention">Datalagring (dagar)</Label>
                    <Input
                      id="dataRetention"
                      type="number"
                      min={1}
                      max={365}
                      value={formData.dataRetentionDays}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        dataRetentionDays: parseInt(e.target.value) || 90
                      })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Konversationer raderas automatiskt efter denna period
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {/* Save button */}
        <div className="flex justify-end pt-4">
          <Button
            onClick={handleSave}
            disabled={updateSettings.isPending}
          >
            {updateSettings.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Spara inställningar
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}

// Provider selection card component
function ProviderCard({
  provider,
  title,
  description,
  icon,
  badge,
  badgeVariant = 'default',
  selected,
  onClick,
}: {
  provider: ChatAiProvider;
  title: string;
  description: string;
  icon: React.ReactNode;
  badge?: string;
  badgeVariant?: 'default' | 'secondary';
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative p-4 rounded-lg border-2 text-left transition-all hover:border-primary/50 ${
        selected ? 'border-primary bg-primary/5' : 'border-muted'
      }`}
    >
      {badge && (
        <Badge variant={badgeVariant} className="absolute top-2 right-2 text-xs">
          {badge}
        </Badge>
      )}
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-2 rounded-lg ${selected ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
          {icon}
        </div>
      </div>
      <h4 className="font-medium">{title}</h4>
      <p className="text-xs text-muted-foreground">{description}</p>
    </button>
  );
}
