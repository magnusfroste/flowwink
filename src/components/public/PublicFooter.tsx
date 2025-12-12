import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { Phone, Mail, MapPin, Clock } from 'lucide-react';
import { useFooterSettings } from '@/hooks/useSiteSettings';

interface NavPage {
  id: string;
  title: string;
  slug: string;
}

export function PublicFooter() {
  const { data: settings } = useFooterSettings();
  
  const { data: pages = [] } = useQuery({
    queryKey: ['public-nav-pages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pages')
        .select('id, title, slug, menu_order')
        .eq('status', 'published')
        .order('menu_order', { ascending: true })
        .order('title', { ascending: true });

      if (error) throw error;
      return (data || []) as NavPage[];
    },
    staleTime: 1000 * 60 * 5,
  });

  const phoneLink = settings?.phone?.replace(/[^+\d]/g, '') || '';
  const brandInitial = settings?.brandName?.charAt(0) || 'S';

  return (
    <footer className="bg-primary text-primary-foreground mt-16">
      <div className="container mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-primary-foreground/20 flex items-center justify-center">
                <span className="font-serif font-bold text-xl">{brandInitial}</span>
              </div>
              <span className="font-serif font-bold text-xl">{settings?.brandName || 'Organisation'}</span>
            </div>
            <p className="text-primary-foreground/80 text-sm leading-relaxed">
              {settings?.brandTagline || ''}
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-serif font-bold text-lg mb-4">Snabblänkar</h3>
            <nav className="flex flex-col gap-2">
              {pages.slice(0, 6).map((page) => (
                <Link
                  key={page.id}
                  to={page.slug === 'hem' ? '/' : `/${page.slug}`}
                  className="text-primary-foreground/80 hover:text-primary-foreground text-sm transition-colors"
                >
                  {page.title}
                </Link>
              ))}
            </nav>
          </div>

          {/* Contact Info */}
          <div>
            <h3 className="font-serif font-bold text-lg mb-4">Kontakt</h3>
            <div className="flex flex-col gap-3">
              {settings?.phone && (
                <a
                  href={`tel:${phoneLink}`}
                  className="flex items-center gap-3 text-primary-foreground/80 hover:text-primary-foreground text-sm transition-colors"
                >
                  <Phone className="h-4 w-4 flex-shrink-0" />
                  <span>{settings.phone}</span>
                </a>
              )}
              {settings?.email && (
                <a
                  href={`mailto:${settings.email}`}
                  className="flex items-center gap-3 text-primary-foreground/80 hover:text-primary-foreground text-sm transition-colors"
                >
                  <Mail className="h-4 w-4 flex-shrink-0" />
                  <span>{settings.email}</span>
                </a>
              )}
              {(settings?.address || settings?.postalCode) && (
                <div className="flex items-start gap-3 text-primary-foreground/80 text-sm">
                  <MapPin className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>
                    {settings?.address && <>{settings.address}<br /></>}
                    {settings?.postalCode}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Opening Hours */}
          <div>
            <h3 className="font-serif font-bold text-lg mb-4">Öppettider</h3>
            <div className="flex flex-col gap-2 text-sm text-primary-foreground/80">
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 flex-shrink-0" />
                <span>Måndag–Fredag</span>
              </div>
              <p className="ml-7">{settings?.weekdayHours || '–'}</p>
              <p className="ml-7 mt-2">Lördag–Söndag: {settings?.weekendHours || '–'}</p>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-primary-foreground/20 mt-10 pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-primary-foreground/60">
            © {new Date().getFullYear()} {settings?.brandName || 'Organisation'}. Alla rättigheter förbehållna.
          </p>
          <div className="flex gap-6 text-sm text-primary-foreground/60">
            <a href="#" className="hover:text-primary-foreground transition-colors">
              Integritetspolicy
            </a>
            <a href="#" className="hover:text-primary-foreground transition-colors">
              Tillgänglighet
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
