import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { BookingBlockData, BookingService } from '@/types/cms';
import { Calendar, ExternalLink, Code, Plus, Trash2, Webhook } from 'lucide-react';

interface BookingBlockEditorProps {
  data: BookingBlockData;
  onChange: (data: BookingBlockData) => void;
  isEditing: boolean;
}

export function BookingBlockEditor({ data, onChange, isEditing }: BookingBlockEditorProps) {
  const updateData = (updates: Partial<BookingBlockData>) => {
    onChange({ ...data, ...updates });
  };

  const addService = () => {
    const newService: BookingService = {
      id: `service-${Date.now()}`,
      name: '',
      duration: '30 min',
      description: '',
    };
    updateData({ services: [...(data.services || []), newService] });
  };

  const updateService = (id: string, updates: Partial<BookingService>) => {
    const updated = (data.services || []).map((s) =>
      s.id === id ? { ...s, ...updates } : s
    );
    updateData({ services: updated });
  };

  const removeService = (id: string) => {
    updateData({ services: (data.services || []).filter((s) => s.id !== id) });
  };

  // Preview for non-editing mode
  if (!isEditing) {
    return (
      <div className="p-6 text-center border-2 border-dashed rounded-lg bg-muted/30">
        <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
        <h3 className="font-medium text-lg">{data.title || 'Booking Widget'}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {data.mode === 'embed' ? (
            <>
              {data.provider === 'calendly' && 'Calendly embed'}
              {data.provider === 'cal' && 'Cal.com embed'}
              {data.provider === 'hubspot' && 'HubSpot embed'}
              {data.provider === 'custom' && 'Custom iframe embed'}
            </>
          ) : (
            <>
              Booking form
              {data.services && data.services.length > 0 && (
                <span className="block text-xs mt-1">
                  {data.services.length} service{data.services.length > 1 ? 's' : ''} configured
                </span>
              )}
              {data.triggerWebhook && (
                <span className="flex items-center justify-center gap-1 text-xs text-primary mt-1">
                  <Webhook className="h-3 w-3" /> Webhook enabled
                </span>
              )}
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 border rounded-lg bg-card">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Calendar className="h-4 w-4" />
        Booking Block Settings
      </div>

      {/* Title & Description */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Title</Label>
          <Input
            value={data.title || ''}
            onChange={(e) => updateData({ title: e.target.value })}
            placeholder="Book an Appointment"
          />
        </div>

        <div className="space-y-2">
          <Label>Description</Label>
          <Textarea
            value={data.description || ''}
            onChange={(e) => updateData({ description: e.target.value })}
            placeholder="Schedule a time that works for you"
            rows={2}
          />
        </div>
      </div>

      {/* Mode Selection */}
      <div className="space-y-2">
        <Label>Booking Mode</Label>
        <Select
          value={data.mode || 'embed'}
          onValueChange={(value: 'embed' | 'form') => updateData({ mode: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="embed">
              <div className="flex items-center gap-2">
                <ExternalLink className="h-4 w-4" />
                Embed Calendar Service
              </div>
            </SelectItem>
            <SelectItem value="form">
              <div className="flex items-center gap-2">
                <Code className="h-4 w-4" />
                Simple Booking Form
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Embed Mode Options */}
      {data.mode === 'embed' && (
        <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
          <div className="space-y-2">
            <Label>Calendar Provider</Label>
            <Select
              value={data.provider || 'calendly'}
              onValueChange={(value: 'calendly' | 'cal' | 'hubspot' | 'custom') => 
                updateData({ provider: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="calendly">Calendly</SelectItem>
                <SelectItem value="cal">Cal.com</SelectItem>
                <SelectItem value="hubspot">HubSpot Meetings</SelectItem>
                <SelectItem value="custom">Custom Embed URL</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>
              {data.provider === 'calendly' && 'Calendly URL'}
              {data.provider === 'cal' && 'Cal.com URL'}
              {data.provider === 'hubspot' && 'HubSpot Embed URL'}
              {data.provider === 'custom' && 'Embed URL'}
            </Label>
            <Input
              value={data.embedUrl || ''}
              onChange={(e) => updateData({ embedUrl: e.target.value })}
              placeholder={
                data.provider === 'calendly' 
                  ? 'https://calendly.com/your-name/30min' 
                  : data.provider === 'cal'
                  ? 'https://cal.com/your-name/30min'
                  : data.provider === 'hubspot'
                  ? 'https://meetings.hubspot.com/...'
                  : 'https://...'
              }
            />
            <p className="text-xs text-muted-foreground">
              {data.provider === 'calendly' && 'Paste your Calendly event link'}
              {data.provider === 'cal' && 'Paste your Cal.com booking link'}
              {data.provider === 'hubspot' && 'Paste your HubSpot meetings link'}
              {data.provider === 'custom' && 'Paste any embeddable booking URL'}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Height</Label>
            <Select
              value={data.height || 'md'}
              onValueChange={(value: 'sm' | 'md' | 'lg' | 'xl') => updateData({ height: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sm">Small (400px)</SelectItem>
                <SelectItem value="md">Medium (550px)</SelectItem>
                <SelectItem value="lg">Large (700px)</SelectItem>
                <SelectItem value="xl">Extra Large (850px)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Form Mode Options */}
      {data.mode === 'form' && (
        <div className="space-y-6 p-4 border rounded-lg bg-muted/30">
          <p className="text-sm text-muted-foreground">
            A booking form will be displayed. Submissions are saved and can trigger webhooks.
          </p>

          {/* Services */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Service Selection</Label>
                <p className="text-xs text-muted-foreground">Let users choose a service type</p>
              </div>
              <Switch
                checked={data.showServiceSelector ?? false}
                onCheckedChange={(checked) => updateData({ showServiceSelector: checked })}
              />
            </div>

            {data.showServiceSelector && (
              <div className="space-y-3 pl-4 border-l-2 border-muted">
                {(data.services || []).map((service, index) => (
                  <div key={service.id} className="flex gap-2 items-start">
                    <div className="flex-1 space-y-2">
                      <Input
                        value={service.name}
                        onChange={(e) => updateService(service.id, { name: e.target.value })}
                        placeholder={`Service ${index + 1} name`}
                      />
                      <div className="flex gap-2">
                        <Input
                          value={service.duration || ''}
                          onChange={(e) => updateService(service.id, { duration: e.target.value })}
                          placeholder="Duration (e.g., 30 min)"
                          className="w-32"
                        />
                        <Input
                          value={service.description || ''}
                          onChange={(e) => updateService(service.id, { description: e.target.value })}
                          placeholder="Optional description"
                          className="flex-1"
                        />
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeService(service.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addService}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Service
                </Button>
              </div>
            )}
          </div>
          
          <div className="space-y-2">
            <Label>Submit Button Text</Label>
            <Input
              value={data.submitButtonText || ''}
              onChange={(e) => updateData({ submitButtonText: e.target.value })}
              placeholder="Request Appointment"
            />
          </div>

          <div className="space-y-2">
            <Label>Success Message</Label>
            <Textarea
              value={data.successMessage || ''}
              onChange={(e) => updateData({ successMessage: e.target.value })}
              placeholder="Thank you! We'll contact you to confirm your appointment."
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Show Phone Field</Label>
              <p className="text-xs text-muted-foreground">Include phone number in the form</p>
            </div>
            <Switch
              checked={data.showPhoneField ?? true}
              onCheckedChange={(checked) => updateData({ showPhoneField: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Show Date Preference</Label>
              <p className="text-xs text-muted-foreground">Let users select preferred date/time</p>
            </div>
            <Switch
              checked={data.showDatePicker ?? true}
              onCheckedChange={(checked) => updateData({ showDatePicker: checked })}
            />
          </div>

          {/* Webhook Integration */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="flex items-center gap-2">
                  <Webhook className="h-4 w-4" />
                  Trigger Webhook
                </Label>
                <p className="text-xs text-muted-foreground">
                  Send booking data to n8n or other automation tools
                </p>
              </div>
              <Switch
                checked={data.triggerWebhook ?? false}
                onCheckedChange={(checked) => updateData({ triggerWebhook: checked })}
              />
            </div>
            {data.triggerWebhook && (
              <p className="text-xs text-muted-foreground mt-2 pl-6">
                Configure webhooks in Settings → Webhooks. Subscribe to "booking.submitted" event.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Styling */}
      <div className="space-y-2">
        <Label>Card Style</Label>
        <Select
          value={data.variant || 'card'}
          onValueChange={(value: 'default' | 'card' | 'minimal') => updateData({ variant: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Default</SelectItem>
            <SelectItem value="card">Card with shadow</SelectItem>
            <SelectItem value="minimal">Minimal</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
