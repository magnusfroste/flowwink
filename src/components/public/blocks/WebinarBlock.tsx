import { logger } from '@/lib/logger';
import { useState } from 'react';
import { format, isFuture, isPast, differenceInDays } from 'date-fns';
import { Video, Calendar, Clock, Users, Play, CheckCircle, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { createLeadFromWebinar } from '@/lib/lead-utils';

interface WebinarBlockData {
  title?: string;
  description?: string;
  maxItems?: number;
  showPast?: boolean;
  variant?: 'default' | 'card' | 'minimal';
}

interface WebinarBlockProps {
  data: WebinarBlockData;
  blockId?: string;
  pageId?: string;
}

interface WebinarItem {
  id: string;
  title: string;
  description: string | null;
  date: string;
  duration_minutes: number;
  platform: string;
  meeting_url: string | null;
  recording_url: string | null;
  status: string;
  max_attendees: number | null;
  cover_image: string | null;
}

const PLATFORM_LABELS: Record<string, string> = {
  google_meet: 'Google Meet',
  zoom: 'Zoom',
  teams: 'Microsoft Teams',
  custom: 'Online',
};

export function WebinarBlock({ data, blockId, pageId }: WebinarBlockProps) {
  const [webinars, setWebinars] = useState<WebinarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [registrationCounts, setRegistrationCounts] = useState<Record<string, number>>({});

  // Fetch webinars on mount
  useState(() => {
    const fetchWebinars = async () => {
      let query = supabase
        .from('webinars')
        .select('*')
        .in('status', data.showPast ? ['published', 'completed'] : ['published'])
        .order('date', { ascending: true });

      if (data.maxItems) {
        query = query.limit(data.maxItems);
      }

      const { data: result } = await query;
      const items = (result || []) as unknown as WebinarItem[];
      setWebinars(items);

      // Fetch registration counts
      if (items.length > 0) {
        const counts: Record<string, number> = {};
        for (const w of items) {
          const { count } = await supabase
            .from('webinar_registrations')
            .select('id', { count: 'exact', head: true })
            .eq('webinar_id', w.id);
          counts[w.id] = count || 0;
        }
        setRegistrationCounts(counts);
      }

      setLoading(false);
    };
    fetchWebinars();
  });

  const upcoming = webinars.filter(w => isFuture(new Date(w.date)));
  const past = webinars.filter(w => isPast(new Date(w.date)));

  const containerClasses = cn(
    'w-full',
    data.variant === 'card' && 'rounded-xl border bg-card shadow-lg p-6',
    data.variant === 'minimal' && 'p-4',
    data.variant === 'default' && 'py-8'
  );

  if (loading) {
    return (
      <section className={containerClasses}>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </section>
    );
  }

  if (webinars.length === 0) {
    return (
      <section className={containerClasses}>
        <div className="text-center py-12">
          <Video className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No webinars scheduled</p>
        </div>
      </section>
    );
  }

  return (
    <section className={containerClasses}>
      {data.title && (
        <h2 className="text-2xl font-bold mb-2">{data.title}</h2>
      )}
      {data.description && (
        <p className="text-muted-foreground mb-6">{data.description}</p>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div className="space-y-4 mb-8">
          {upcoming.map(webinar => (
            <WebinarCard
              key={webinar.id}
              webinar={webinar}
              registrationCount={registrationCounts[webinar.id] || 0}
              blockId={blockId}
              pageId={pageId}
            />
          ))}
        </div>
      )}

      {/* Past */}
      {data.showPast && past.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4 text-muted-foreground">Previous Webinars</h3>
          <div className="space-y-4">
            {past.map(webinar => (
              <WebinarCard
                key={webinar.id}
                webinar={webinar}
                registrationCount={registrationCounts[webinar.id] || 0}
                isPast
                blockId={blockId}
                pageId={pageId}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function WebinarCard({
  webinar,
  registrationCount,
  isPast,
  blockId,
  pageId,
}: {
  webinar: WebinarItem;
  registrationCount: number;
  isPast?: boolean;
  blockId?: string;
  pageId?: string;
}) {
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '' });

  const daysUntil = differenceInDays(new Date(webinar.date), new Date());
  const spotsLeft = webinar.max_attendees ? webinar.max_attendees - registrationCount : null;
  const isFull = spotsLeft !== null && spotsLeft <= 0;

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) {
      toast.error('Please fill in name and email');
      return;
    }

    setIsSubmitting(true);
    try {
      // Create/update lead via centralized contract
      const { leadId } = await createLeadFromWebinar({
        email: formData.email,
        name: formData.name,
        phone: formData.phone || undefined,
        webinarId: webinar.id,
        webinarTitle: webinar.title,
      });

      const { error } = await supabase
        .from('webinar_registrations')
        .insert({
          webinar_id: webinar.id,
          name: formData.name,
          email: formData.email,
          phone: formData.phone || null,
          lead_id: leadId,
        });

      if (error) {
        if (error.code === '23505') {
          toast.error('You are already registered for this webinar');
        } else {
          throw error;
        }
        return;
      }

      setRegistered(true);
      toast.success('Successfully registered!');
    } catch (error) {
      logger.error('Registration error:', error);
      toast.error('Failed to register. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className={cn(isPast && 'opacity-75')}>
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row md:items-start gap-4">
          {/* Date badge */}
          <div className="flex-shrink-0 text-center bg-primary/10 rounded-lg p-3 w-16">
            <div className="text-xs font-medium text-primary uppercase">
              {format(new Date(webinar.date), 'MMM')}
            </div>
            <div className="text-2xl font-bold text-primary">
              {format(new Date(webinar.date), 'd')}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold">{webinar.title}</h3>
              {!isPast && daysUntil <= 3 && daysUntil >= 0 && (
                <Badge variant="destructive" className="text-xs">
                  {daysUntil === 0 ? 'Today' : `${daysUntil}d left`}
                </Badge>
              )}
              {isPast && webinar.recording_url && (
                <Badge variant="secondary" className="text-xs">Recording available</Badge>
              )}
            </div>

            {webinar.description && (
              <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{webinar.description}</p>
            )}

            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-4">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {format(new Date(webinar.date), 'PPP')}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {format(new Date(webinar.date), 'HH:mm')} ({webinar.duration_minutes} min)
              </span>
              <span className="flex items-center gap-1">
                <Video className="h-3.5 w-3.5" />
                {PLATFORM_LABELS[webinar.platform] || 'Online'}
              </span>
              {registrationCount > 0 && (
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {registrationCount} registered
                  {spotsLeft !== null && ` (${spotsLeft} spots left)`}
                </span>
              )}
            </div>

            {/* Actions */}
            {!isPast && !registered && !showForm && (
              <Button
                onClick={() => setShowForm(true)}
                disabled={isFull}
                size="sm"
              >
                {isFull ? 'Full' : 'Register Now'}
              </Button>
            )}

            {isPast && webinar.recording_url && (
              <Button asChild variant="outline" size="sm">
                <a href={webinar.recording_url} target="_blank" rel="noopener noreferrer">
                  <Play className="h-4 w-4 mr-2" />
                  Watch Recording
                </a>
              </Button>
            )}

            {registered && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle className="h-4 w-4" />
                You're registered! Check your email for details.
              </div>
            )}

            {/* Registration form */}
            {showForm && !registered && (
              <form onSubmit={handleRegister} className="mt-4 space-y-3 max-w-md">
                <div>
                  <Label htmlFor={`name-${webinar.id}`}>Name *</Label>
                  <Input
                    id={`name-${webinar.id}`}
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Your name"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor={`email-${webinar.id}`}>Email *</Label>
                  <Input
                    id={`email-${webinar.id}`}
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="your@email.com"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor={`phone-${webinar.id}`}>Phone (optional)</Label>
                  <Input
                    id={`phone-${webinar.id}`}
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="+46..."
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={isSubmitting} size="sm">
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Registering...
                      </>
                    ) : (
                      'Confirm Registration'
                    )}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
