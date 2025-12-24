import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Calendar, Clock, Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { BookingBlockData } from '@/types/cms';

interface BookingBlockProps {
  data: BookingBlockData;
  blockId?: string;
  pageId?: string;
}

const HEIGHT_MAP = {
  sm: '400px',
  md: '550px',
  lg: '700px',
  xl: '850px',
};

export function BookingBlock({ data, blockId, pageId }: BookingBlockProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    preferredDate: '',
    preferredTime: '',
    message: '',
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.email) {
      toast.error('Please fill in required fields');
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase.from('form_submissions').insert({
        block_id: blockId || 'booking-block',
        page_id: pageId || null,
        form_name: data.title || 'Booking Request',
        data: formData,
        metadata: {
          type: 'booking',
          submitted_at: new Date().toISOString(),
        },
      });

      if (error) throw error;

      setSubmitted(true);
      toast.success(data.successMessage || 'Booking request submitted!');
    } catch (error) {
      console.error('Error submitting booking:', error);
      toast.error('Failed to submit booking request');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Generate embed URL based on provider
  const getEmbedUrl = () => {
    const url = data.embedUrl;
    if (!url) return null;

    switch (data.provider) {
      case 'calendly':
        // Ensure proper Calendly embed format
        if (url.includes('calendly.com')) {
          return url.includes('/embed') ? url : url;
        }
        return url;
      case 'cal':
        // Cal.com embed
        return url;
      case 'hubspot':
        return url;
      default:
        return url;
    }
  };

  const containerClasses = cn(
    'w-full',
    data.variant === 'card' && 'rounded-xl border bg-card shadow-lg p-6',
    data.variant === 'minimal' && 'p-4',
    data.variant === 'default' && 'py-8'
  );

  // Embed mode - render iframe
  if (data.mode === 'embed') {
    const embedUrl = getEmbedUrl();

    if (!embedUrl) {
      return (
        <section className={containerClasses}>
          <div className="max-w-4xl mx-auto text-center">
            {data.title && (
              <h2 className="font-serif text-2xl md:text-3xl font-semibold mb-2">
                {data.title}
              </h2>
            )}
            {data.description && (
              <p className="text-muted-foreground mb-6">{data.description}</p>
            )}
            <div className="p-8 border-2 border-dashed rounded-lg bg-muted/30">
              <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                Booking calendar not configured. Please add your calendar URL.
              </p>
            </div>
          </div>
        </section>
      );
    }

    const height = HEIGHT_MAP[data.height || 'md'];

    return (
      <section className={containerClasses}>
        <div className="max-w-4xl mx-auto">
          {data.title && (
            <h2 className="font-serif text-2xl md:text-3xl font-semibold mb-2 text-center">
              {data.title}
            </h2>
          )}
          {data.description && (
            <p className="text-muted-foreground mb-6 text-center">{data.description}</p>
          )}
          <div 
            className="w-full rounded-lg overflow-hidden border bg-background"
            style={{ height }}
          >
            <iframe
              src={embedUrl}
              title={data.title || 'Booking Calendar'}
              className="w-full h-full border-0"
              loading="lazy"
              allow="payment"
            />
          </div>
        </div>
      </section>
    );
  }

  // Form mode - render booking form
  if (submitted) {
    return (
      <section className={containerClasses}>
        <div className="max-w-md mx-auto text-center py-12">
          <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">Request Submitted!</h3>
          <p className="text-muted-foreground">
            {data.successMessage || "Thank you! We'll contact you to confirm your appointment."}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={containerClasses}>
      <div className="max-w-lg mx-auto">
        {data.title && (
          <h2 className="font-serif text-2xl md:text-3xl font-semibold mb-2 text-center">
            {data.title}
          </h2>
        )}
        {data.description && (
          <p className="text-muted-foreground mb-6 text-center">{data.description}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="booking-name">Name *</Label>
              <Input
                id="booking-name"
                type="text"
                placeholder="Your name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="booking-email">Email *</Label>
              <Input
                id="booking-email"
                type="email"
                placeholder="your@email.com"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                required
              />
            </div>
          </div>

          {data.showPhoneField !== false && (
            <div className="space-y-2">
              <Label htmlFor="booking-phone">Phone</Label>
              <Input
                id="booking-phone"
                type="tel"
                placeholder="Your phone number"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
              />
            </div>
          )}

          {data.showDatePicker !== false && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="booking-date" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Preferred Date
                </Label>
                <Input
                  id="booking-date"
                  type="date"
                  value={formData.preferredDate}
                  onChange={(e) => handleInputChange('preferredDate', e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="booking-time" className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Preferred Time
                </Label>
                <Input
                  id="booking-time"
                  type="time"
                  value={formData.preferredTime}
                  onChange={(e) => handleInputChange('preferredTime', e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="booking-message">Message</Label>
            <Textarea
              id="booking-message"
              placeholder="Any additional information..."
              value={formData.message}
              onChange={(e) => handleInputChange('message', e.target.value)}
              rows={3}
            />
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              data.submitButtonText || 'Request Appointment'
            )}
          </Button>
        </form>
      </div>
    </section>
  );
}
