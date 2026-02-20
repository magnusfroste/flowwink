import { logger } from '@/lib/logger';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Calendar, Clock, Loader2, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { BookingBlockData } from '@/types/cms';
import { useBookingServices, useAvailableSlots } from '@/hooks/useBookings';
import { webhookEvents } from '@/lib/webhook-utils';
import { format, addDays, startOfWeek, addWeeks, isSameDay, isToday, isBefore, startOfDay } from 'date-fns';

interface SmartBookingBlockProps {
  data: BookingBlockData;
  blockId?: string;
  pageId?: string;
}

type BookingStep = 'service' | 'datetime' | 'details' | 'confirmed';

export function SmartBookingBlock({ data, blockId, pageId }: SmartBookingBlockProps) {
  const [step, setStep] = useState<BookingStep>('service');
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    notes: '',
  });

  const { data: services = [], isLoading: servicesLoading } = useBookingServices();
  const activeServices = services.filter(s => s.is_active);
  
  const selectedService = activeServices.find(s => s.id === selectedServiceId);
  
  const { data: availableSlots = [], isLoading: slotsLoading } = useAvailableSlots(
    selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null,
    selectedServiceId
  );

  // Auto-select service if only one
  useEffect(() => {
    if (activeServices.length === 1 && !selectedServiceId) {
      setSelectedServiceId(activeServices[0].id);
      setStep('datetime');
    }
  }, [activeServices, selectedServiceId]);

  const handleServiceSelect = (serviceId: string) => {
    setSelectedServiceId(serviceId);
    setSelectedDate(null);
    setSelectedSlot(null);
    setStep('datetime');
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setSelectedSlot(null);
  };

  const handleSlotSelect = (slot: string) => {
    setSelectedSlot(slot);
    setStep('details');
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.email || !selectedDate || !selectedSlot || !selectedServiceId) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);

    try {
      // Calculate end time based on service duration
      const duration = selectedService?.duration_minutes || 60;
      const [hours, minutes] = selectedSlot.split(':').map(Number);
      const startTime = new Date(selectedDate);
      startTime.setHours(hours, minutes, 0, 0);
      const endTime = new Date(startTime.getTime() + duration * 60000);

      const { error } = await supabase.from('bookings').insert({
        service_id: selectedServiceId,
        customer_name: formData.name,
        customer_email: formData.email,
        customer_phone: formData.phone || null,
        notes: formData.notes || null,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        status: 'pending',
        metadata: {
          source: 'smart_booking_block',
          block_id: blockId,
          page_id: pageId,
        },
      });

      if (error) throw error;

      // Trigger webhook if enabled
      if (data.triggerWebhook) {
        await webhookEvents.bookingSubmitted({
          block_id: blockId || 'smart-booking-block',
          page_id: pageId,
          service: selectedService ? { id: selectedService.id, name: selectedService.name } : null,
          customer: {
            name: formData.name,
            email: formData.email,
            phone: formData.phone || undefined,
          },
          preferred_date: format(selectedDate, 'yyyy-MM-dd'),
          preferred_time: selectedSlot,
          message: formData.notes || undefined,
        });
      }

      setStep('confirmed');
      toast.success('Booking request submitted!');
    } catch (error) {
      logger.error('Error submitting booking:', error);
      toast.error('Failed to submit booking');
    } finally {
      setIsSubmitting(false);
    }
  };

  const containerClasses = cn(
    'w-full',
    data.variant === 'card' && 'rounded-xl border bg-card shadow-lg p-6',
    data.variant === 'minimal' && 'p-4',
    data.variant === 'default' && 'py-8'
  );

  // Week navigation
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const canGoPrevWeek = !isBefore(weekStart, startOfWeek(new Date(), { weekStartsOn: 1 }));

  if (servicesLoading) {
    return (
      <section className={containerClasses}>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </section>
    );
  }

  if (activeServices.length === 0) {
    return (
      <section className={containerClasses}>
        <div className="max-w-md mx-auto text-center py-12">
          <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Services Available</h3>
          <p className="text-muted-foreground">
            Booking services are not configured yet.
          </p>
        </div>
      </section>
    );
  }

  // Confirmed step
  if (step === 'confirmed') {
    return (
      <section className={containerClasses}>
        <div className="max-w-md mx-auto text-center py-12">
          <CheckCircle2 className="h-16 w-16 text-success mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">Booking Request Submitted!</h3>
          <p className="text-muted-foreground mb-4">
            {data.successMessage || "Thank you! We'll contact you to confirm your appointment."}
          </p>
          {selectedService && selectedDate && selectedSlot && (
            <div className="bg-muted/50 rounded-lg p-4 text-left space-y-2">
              <p><span className="font-medium">Service:</span> {selectedService.name}</p>
              <p><span className="font-medium">Date:</span> {format(selectedDate, 'EEEE, MMMM d, yyyy')}</p>
              <p><span className="font-medium">Time:</span> {selectedSlot}</p>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className={containerClasses}>
      <div className="max-w-2xl mx-auto">
        {data.title && (
          <h2 className="font-serif text-2xl md:text-3xl font-semibold mb-2 text-center">
            {data.title}
          </h2>
        )}
        {data.description && (
          <p className="text-muted-foreground mb-6 text-center">{data.description}</p>
        )}

        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {['service', 'datetime', 'details'].map((s, i) => (
            <div key={s} className="flex items-center">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                  step === s ? 'bg-primary text-primary-foreground' :
                  ['service', 'datetime', 'details'].indexOf(step) > i ? 'bg-primary/20 text-primary' :
                  'bg-muted text-muted-foreground'
                )}
              >
                {i + 1}
              </div>
              {i < 2 && (
                <div className={cn(
                  'w-12 h-0.5 mx-1',
                  ['service', 'datetime', 'details'].indexOf(step) > i ? 'bg-primary/20' : 'bg-muted'
                )} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Service Selection */}
        {step === 'service' && (
          <div className="space-y-4">
            <h3 className="font-medium text-lg">Select a Service</h3>
            <div className="grid gap-3">
              {activeServices.map((service) => (
                <button
                  key={service.id}
                  onClick={() => handleServiceSelect(service.id)}
                  className={cn(
                    'p-4 rounded-lg border text-left transition-all hover:border-primary hover:bg-primary/5',
                    selectedServiceId === service.id && 'border-primary bg-primary/5'
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-medium">{service.name}</h4>
                      {service.description && (
                        <p className="text-sm text-muted-foreground mt-1">{service.description}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        {service.duration_minutes} min
                      </div>
                      {service.price_cents && service.price_cents > 0 && (
                        <p className="font-medium mt-1">
                          {new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency: service.currency,
                          }).format(service.price_cents / 100)}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Date & Time Selection */}
        {step === 'datetime' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep('service')}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
              <h3 className="font-medium text-lg">Select Date & Time</h3>
              <div className="w-12" />
            </div>

            {/* Week navigation */}
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setWeekStart(addWeeks(weekStart, -1))}
                disabled={!canGoPrevWeek}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium">
                {format(weekStart, 'MMM d')} - {format(addDays(weekStart, 6), 'MMM d, yyyy')}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setWeekStart(addWeeks(weekStart, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Date selection */}
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map((day) => {
                const isPast = isBefore(startOfDay(day), startOfDay(new Date()));
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => !isPast && handleDateSelect(day)}
                    disabled={isPast}
                    className={cn(
                      'p-3 rounded-lg text-center transition-all',
                      isPast && 'opacity-40 cursor-not-allowed',
                      !isPast && !isSelected && 'hover:bg-muted',
                      isSelected && 'bg-primary text-primary-foreground',
                      isToday(day) && !isSelected && 'ring-1 ring-primary'
                    )}
                  >
                    <div className="text-xs font-medium">{format(day, 'EEE')}</div>
                    <div className="text-lg font-semibold">{format(day, 'd')}</div>
                  </button>
                );
              })}
            </div>

            {/* Time slots */}
            {selectedDate && (
              <div className="space-y-3">
                <h4 className="font-medium">Available Times</h4>
                {slotsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : availableSlots.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No available times for this date. Please select another day.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                    {availableSlots.map((slot) => (
                      <button
                        key={slot}
                        onClick={() => handleSlotSelect(slot)}
                        className={cn(
                          'px-3 py-2 rounded-md text-sm font-medium transition-all',
                          selectedSlot === slot
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted hover:bg-muted/80'
                        )}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Contact Details */}
        {step === 'details' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep('datetime')}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
              <h3 className="font-medium text-lg">Your Details</h3>
              <div className="w-12" />
            </div>

            {/* Booking summary */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-1">
              <p className="font-medium">{selectedService?.name}</p>
              <p className="text-sm text-muted-foreground">
                {selectedDate && format(selectedDate, 'EEEE, MMMM d, yyyy')} at {selectedSlot}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="smart-booking-name">Name *</Label>
                  <Input
                    id="smart-booking-name"
                    type="text"
                    placeholder="Your name"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smart-booking-email">Email *</Label>
                  <Input
                    id="smart-booking-email"
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
                  <Label htmlFor="smart-booking-phone">Phone</Label>
                  <Input
                    id="smart-booking-phone"
                    type="tel"
                    placeholder="Your phone number"
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="smart-booking-notes">Notes</Label>
                <Textarea
                  id="smart-booking-notes"
                  placeholder="Any additional information..."
                  value={formData.notes}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  rows={3}
                />
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Booking...
                  </>
                ) : (
                  data.submitButtonText || 'Confirm Booking'
                )}
              </Button>
            </form>
          </div>
        )}
      </div>
    </section>
  );
}
