import { logger } from '@/lib/logger';
import { useUiText } from '@/lib/ui-text';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Calendar, Clock, Loader2, CheckCircle2, ChevronLeft, ChevronRight, CreditCard } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { BookingBlockData } from '@/types/cms';
import { useBookingServices, useBookingFreeSlots } from '@/hooks/useBookings';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { useVisitorDateFormat } from '@/lib/visitor-date';
import { webhookEvents } from '@/lib/webhook-utils';
import { format, addDays, startOfWeek, addWeeks, isSameDay, isToday, isBefore, startOfDay } from 'date-fns';
import { FALLBACK_CURRENCY } from '@/lib/platform-fallbacks';
import { buildAttributionFields } from '@/lib/utm';

interface SmartBookingBlockProps {
  data: BookingBlockData;
  blockId?: string;
  pageId?: string;
}

type BookingStep = 'service' | 'datetime' | 'details' | 'confirmed';

export function SmartBookingBlock({ data, blockId, pageId }: SmartBookingBlockProps) {
  const t = useUiText();
  const { formatCurrency } = usePlatformFormat();
  // Veckodags- och månadsNAMN är språk, inte format: kalendern läses på sidans
  // språk, inte i platform_locale — annars står "mån, tis" på en engelsk sida.
  const { formatDate } = useVisitorDateFormat();
  const [step, setStep] = useState<BookingStep>('service');
  // Sant först när comms-send SVARAT att mailet gick (inte skipped/blocked) —
  // skärmen lovar bara det inkorgen faktiskt håller.
  const [confirmationEmailed, setConfirmationEmailed] = useState(false);
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
  
  const { data: freeSlots, isLoading: slotsLoading } = useBookingFreeSlots(
    selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null,
    selectedServiceId
  );
  const availableSlots = (freeSlots?.slots ?? []).map((s) => s.time);
  const showPlacesLeft = (freeSlots?.capacity ?? 1) > 1;
  const [waitlist, setWaitlist] = useState({ name: '', email: '', joining: false, joined: false });

  const joinWaitlist = async () => {
    if (!selectedDate || !selectedServiceId) return;
    setWaitlist((w) => ({ ...w, joining: true }));
    const rpcCall = supabase.rpc as unknown as (
      fn: string, args: Record<string, unknown>,
    ) => Promise<{ data: { success?: boolean; error?: string } | null; error: { message: string } | null }>;
    const { data, error } = await rpcCall('join_booking_waitlist', {
      p_service_id: selectedServiceId,
      p_date: format(selectedDate, 'yyyy-MM-dd'),
      p_customer_name: waitlist.name,
      p_customer_email: waitlist.email,
    });
    if (error || !data?.success) {
      toast.error(data?.error ?? error?.message ?? t('booking.waitlist.failed', 'Could not join the waiting list'));
      setWaitlist((w) => ({ ...w, joining: false }));
      return;
    }
    setWaitlist((w) => ({ ...w, joining: false, joined: true }));
  };

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
    setWaitlist((w) => ({ ...w, joined: false }));
    setSelectedSlot(null);
  };

  const handleSlotSelect = (slot: string) => {
    setSelectedSlot(slot);
    setStep('details');
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Check if service has a linked product that requires payment
  const serviceRequiresPayment = selectedService?.product_id && selectedService?.price_cents && selectedService.price_cents > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.email || !selectedDate || !selectedSlot || !selectedServiceId) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);

    try {
      // The end time is the service's duration, computed by the server.
      // The slot carries its exact instant. Building a Date from "10:00" here would book
      // 10:00 in the VISITOR's timezone — an hour off for anyone browsing from abroad.
      const chosen = freeSlots?.slots.find((s) => s.time === selectedSlot);
      if (!chosen) throw new Error('slot_unavailable: the chosen time is no longer offered');
      const startTime = new Date(chosen.starts_at);

      // The visitor's door is an RPC, not the table. The direct insert read its own row back
      // (.insert().select('id')) as an anonymous visitor with no read right, used a status the
      // table does not allow ('awaiting_payment'), and walked past opening hours and overlap.
      // request_booking returns the id, and the rules on the table (hours, blocked days, the
      // past, double-booking under a lock) apply to it like to every other writer.
      const rpcCall = supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: { booking_id?: string } | null; error: { message: string } | null }>;
      const { data: requested, error } = await rpcCall('request_booking', {
        p_service_id: selectedServiceId,
        p_customer_name: formData.name,
        p_customer_email: formData.email,
        p_start_time: startTime.toISOString(),
        p_customer_phone: formData.phone || null,
        p_notes: formData.notes || null,
        p_metadata: {
          source: 'smart_booking_block',
          block_id: blockId,
          page_id: pageId,
          awaiting_payment: serviceRequiresPayment || undefined,
        },
      });
      const bookingData = requested?.booking_id ? { id: requested.booking_id } : null;
      if (!error && !bookingData) throw new Error('The booking was not created.');

      if (error) throw error;

      // If service requires payment, initiate checkout
      if (serviceRequiresPayment && selectedService) {
        try {
          const checkoutResponse = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              },
              body: JSON.stringify({
                items: [{
                  productId: selectedService.product_id,
                  productName: selectedService.name,
                  priceCents: selectedService.price_cents,
                  quantity: 1,
                }],
                customerName: formData.name,
                customerEmail: formData.email,
                attribution: buildAttributionFields(),
                userId: null,
                currency: selectedService.currency || FALLBACK_CURRENCY,
                successUrl: `${window.location.origin}/checkout/success`,
                cancelUrl: window.location.href,
                bookingId: bookingData.id,
              }),
            }
          );

          const checkoutData = await checkoutResponse.json();

          if (!checkoutResponse.ok) {
            throw new Error(checkoutData.error || 'Checkout failed');
          }

          // Sandbox mode — payment simulated, confirm booking directly
          if (checkoutData.sandbox) {
            await supabase.from('bookings')
              .update({ 
                status: 'confirmed',
                metadata: {
                  source: 'smart_booking_block',
                  block_id: blockId,
                  page_id: pageId,
                  payment: 'sandbox',
                  order_id: checkoutData.orderId,
                },
              })
              .eq('id', bookingData.id);

            // Trigger confirmation email
            try {
              await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/comms-send?kind=booking_confirmation`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                  },
                  body: JSON.stringify({ bookingId: bookingData.id }),
                }
              );
            } catch (emailErr) {
              logger.warn('Could not trigger confirmation email:', emailErr);
            }

            setStep('confirmed');
            toast.success('Booking confirmed & payment processed!');
            return;
          }

          // Live Stripe mode — redirect to checkout
          if (checkoutData.url) {
            // Save booking ID to localStorage so we can confirm on return
            localStorage.setItem('pending_booking_id', bookingData.id);
            window.location.href = checkoutData.url;
            return;
          }

          throw new Error('No checkout URL received');
        } catch (checkoutError) {
          // Payment failed, but booking was created — mark as pending
          await supabase.from('bookings')
            .update({ status: 'pending' })
            .eq('id', bookingData.id);
          logger.error('Payment error:', checkoutError);
          toast.error('Payment could not be initiated. Your booking has been saved — we will contact you.');
          setStep('confirmed');
          return;
        }
      }

      // No payment needed — standard flow
      // Trigger confirmation email
      try {
        const emailResp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/comms-send?kind=booking_confirmation`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({ bookingId: bookingData.id }),
          }
        );
        const emailResult = await emailResp.json().catch(() => null);
        // Lova bara det som hände: success utan skipped = mailet är på väg.
        setConfirmationEmailed(Boolean(emailResult?.success && !emailResult?.skipped));
      } catch (emailErr) {
        logger.warn('Could not trigger confirmation email:', emailErr);
      }

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
      const message = (error as { message?: string } | null)?.message ?? '';
      toast.error(/slot_unavailable/.test(message) ? 'That time is no longer available — please pick another.' : 'Failed to submit booking');
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
          <h3 className="text-lg font-medium mb-2">{t('booking.noServices', 'No Services Available')}</h3>
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
          <h3 className="text-xl font-semibold mb-2">{t('booking.submitted', 'Booking Request Submitted!')}</h3>
          <p className="text-muted-foreground mb-4">
            {data.successMessage || t('booking.successDefault', "Thank you! We'll contact you to confirm your appointment.")}
          </p>
          {confirmationEmailed && (
            <p className="text-sm text-muted-foreground mt-2">
              A confirmation email is on its way to {formData.email}.
            </p>
          )}
          {selectedService && selectedDate && selectedSlot && (
            <div className="bg-muted/50 rounded-lg p-4 text-left space-y-2">
              <p><span className="font-medium">Service:</span> {selectedService.name}</p>
              <p><span className="font-medium">Date:</span> {formatDate(selectedDate, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
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
            <h3 className="font-medium text-lg">{t('booking.selectService', 'Select a Service')}</h3>
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
                      {(service.price_cents ?? 0) > 0 && (
                        <p className="font-medium mt-1">
                          {formatCurrency(service.price_cents, service.currency)}
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
                {t('booking.back', 'Back')}
              </button>
              <h3 className="font-medium text-lg">{t('booking.selectDateTime', 'Select Date & Time')}</h3>
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
                {formatDate(weekStart, { month: 'short', day: 'numeric' })} - {formatDate(addDays(weekStart, 6), { year: 'numeric', month: 'short', day: 'numeric' })}
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
                    <div className="text-xs font-medium">{formatDate(day, { weekday: 'short', year: undefined, month: undefined, day: undefined })}</div>
                    <div className="text-lg font-semibold">{format(day, 'd')}</div>
                  </button>
                );
              })}
            </div>

            {/* Time slots */}
            {selectedDate && (
              <div className="space-y-3">
                <h4 className="font-medium">{t('booking.availableTimes', 'Available Times')}</h4>
                {slotsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : availableSlots.length === 0 ? (
                  <div className="space-y-4 py-6 text-center">
                    <p className="text-muted-foreground">
                      {t('booking.noTimes', 'No available times for this date. Please select another day.')}
                    </p>
                    {selectedServiceId && (waitlist.joined ? (
                      <p className="text-sm font-medium">
                        {t('booking.waitlist.joined', 'You are on the waiting list — we will contact you if a time opens up.')}
                      </p>
                    ) : (
                      <div className="mx-auto flex max-w-md flex-col gap-2 sm:flex-row">
                        <Input
                          aria-label={t('booking.waitlist.name', 'Your name')}
                          placeholder={t('booking.waitlist.name', 'Your name')}
                          value={waitlist.name}
                          onChange={(e) => setWaitlist((w) => ({ ...w, name: e.target.value }))}
                        />
                        <Input
                          type="email"
                          aria-label={t('booking.waitlist.email', 'Your e-mail')}
                          placeholder={t('booking.waitlist.email', 'Your e-mail')}
                          value={waitlist.email}
                          onChange={(e) => setWaitlist((w) => ({ ...w, email: e.target.value }))}
                        />
                        <Button
                          variant="outline"
                          onClick={joinWaitlist}
                          disabled={waitlist.joining || !waitlist.name.trim() || !waitlist.email.trim()}
                        >
                          {t('booking.waitlist.join', 'Join the waiting list')}
                        </Button>
                      </div>
                    ))}
                  </div>
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
                        {showPlacesLeft && (
                          <span className="ml-1 text-xs opacity-70">
                            · {freeSlots?.slots.find((s) => s.time === slot)?.places_left}
                          </span>
                        )}
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
                {t('booking.back', 'Back')}
              </button>
              <h3 className="font-medium text-lg">{t('booking.yourDetails', 'Your Details')}</h3>
              <div className="w-12" />
            </div>

            {/* Booking summary */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-1">
              <p className="font-medium">{selectedService?.name}</p>
              <p className="text-sm text-muted-foreground">
                {selectedDate && formatDate(selectedDate, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at {selectedSlot}
              </p>
              {serviceRequiresPayment && selectedService && (
                <p className="text-sm font-medium text-primary flex items-center gap-1 mt-1">
                  <CreditCard className="h-4 w-4" />
                  {formatCurrency(selectedService.price_cents!, selectedService.currency)}
                  {' — payment required'}
                </p>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="smart-booking-name">{t('booking.name', 'Name')} *</Label>
                  <Input
                    id="smart-booking-name"
                    type="text"
                    placeholder={t('booking.namePlaceholder', 'Your name')}
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smart-booking-email">{t('booking.email', 'Email')} *</Label>
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
                  <Label htmlFor="smart-booking-phone">{t('booking.phone', 'Phone')}</Label>
                  <Input
                    id="smart-booking-phone"
                    type="tel"
                    placeholder={t('booking.phonePlaceholder', 'Your phone number')}
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="smart-booking-notes">{t('booking.notes', 'Notes')}</Label>
                <Textarea
                  id="smart-booking-notes"
                  placeholder={t('booking.notesPlaceholder', 'Any additional information...')}
                  value={formData.notes}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  rows={3}
                />
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {serviceRequiresPayment ? 'Processing...' : 'Booking...'}
                  </>
                ) : serviceRequiresPayment ? (
                  <>
                    <CreditCard className="mr-2 h-4 w-4" />
                    {`Confirm & Pay ${selectedService ? formatCurrency(selectedService.price_cents!, selectedService.currency) : ''}`}
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
