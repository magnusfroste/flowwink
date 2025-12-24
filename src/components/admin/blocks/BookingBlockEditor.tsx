import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { BookingBlockData } from '@/types/cms';
import { Calendar, ExternalLink, Code } from 'lucide-react';

interface BookingBlockEditorProps {
  data: BookingBlockData;
  onChange: (data: BookingBlockData) => void;
  isEditing: boolean;
}

export function BookingBlockEditor({ data, onChange, isEditing }: BookingBlockEditorProps) {
  const updateData = (updates: Partial<BookingBlockData>) => {
    onChange({ ...data, ...updates });
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
            'Contact form for booking'
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
        <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
          <p className="text-sm text-muted-foreground">
            A simple contact form will be displayed. Submissions are saved to form submissions.
          </p>
          
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
