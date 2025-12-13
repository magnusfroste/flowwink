import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { Phone, Mail, MapPin, Clock, Facebook, Instagram, Linkedin, Twitter, Youtube } from 'lucide-react';
import { useFooterSettings, FooterSectionId } from '@/hooks/useSiteSettings';
import { useBranding } from '@/providers/BrandingProvider';
import { useTheme } from 'next-themes';

interface NavPage {
  id: string;
  title: string;
  slug: string;
}

export function PublicFooter() {
  const { data: settings } = useFooterSettings();
  const { branding } = useBranding();
  const { resolvedTheme } = useTheme();
  
  const { data: pages = [] } = useQuery({
    queryKey: ['public-nav-pages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pages')
        .select('id, title, slug, menu_order')
        .eq('status', 'published')
        .eq('show_in_menu', true)
        .order('menu_order', { ascending: true })
        .order('title', { ascending: true });

      if (error) throw error;
      return (data || []) as NavPage[];
    },
    staleTime: 1000 * 60 * 5,
  });

  const phoneLink = settings?.phone?.replace(/[^+\d]/g, '') || '';
  const brandName = branding?.organizationName || 'Organisation';
  const brandTagline = branding?.brandTagline || '';
  const brandInitial = brandName.charAt(0);

  // Determine which sections to show
  const showBrand = settings?.showBrand !== false;
  const showQuickLinks = settings?.showQuickLinks !== false && pages.length > 0;
  const showContact = settings?.showContact !== false && (settings?.phone || settings?.email || settings?.address || settings?.postalCode);
  const showHours = settings?.showHours !== false && (settings?.weekdayHours || settings?.weekendHours);
  
  // Section order
  const sectionOrder: FooterSectionId[] = settings?.sectionOrder || ['brand', 'quickLinks', 'contact', 'hours'];
  
  // Check visibility for each section
  const sectionVisibility: Record<FooterSectionId, boolean> = {
    brand: showBrand,
    quickLinks: showQuickLinks,
    contact: !!showContact,
    hours: !!showHours,
  };
  
  // Calculate grid columns based on visible sections
  const visibleSections = sectionOrder.filter(id => sectionVisibility[id]).length;
  const gridCols = visibleSections === 1 ? 'grid-cols-1' 
    : visibleSections === 2 ? 'grid-cols-1 md:grid-cols-2' 
    : visibleSections === 3 ? 'grid-cols-1 md:grid-cols-3' 
    : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4';

  // Section components
  const renderSection = (sectionId: FooterSectionId) => {
    if (!sectionVisibility[sectionId]) return null;
    
    switch (sectionId) {
      case 'brand':
        // In footer (which has bg-primary), use logoDark in light mode, logo in dark mode
        const footerLogo = resolvedTheme === 'dark' 
          ? (branding?.logo || branding?.logoDark)
          : (branding?.logoDark || branding?.logo);
        const hasFooterLogo = !!footerLogo;
        
        return (
          <div key="brand">
            <div className="flex items-center gap-3 mb-4">
              {hasFooterLogo ? (
                <img 
                  src={footerLogo} 
                  alt={brandName} 
                  className="h-10 max-w-[200px] object-contain"
                />
              ) : (
                <>
                  <div className="h-10 w-10 rounded-lg bg-primary-foreground/20 flex items-center justify-center">
                    <span className="font-serif font-bold text-xl">{brandInitial}</span>
                  </div>
                  <span className="font-serif font-bold text-xl">{brandName}</span>
                </>
              )}
            </div>
            {brandTagline && (
              <p className="text-primary-foreground/80 text-sm leading-relaxed">
                {brandTagline}
              </p>
            )}
          </div>
        );
      
      case 'quickLinks':
        return (
          <div key="quickLinks">
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
        );
      
      case 'contact':
        return (
          <div key="contact">
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
        );
      
      case 'hours':
        return (
          <div key="hours">
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
        );
      
      default:
        return null;
    }
  };

  return (
    <footer className="bg-primary text-primary-foreground mt-16">
      <div className="container mx-auto px-6 py-12">
        <div className={`grid ${gridCols} gap-8`}>
          {sectionOrder.map(renderSection)}
        </div>

        {/* Bottom bar */}
        <div className="border-t border-primary-foreground/20 mt-10 pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-primary-foreground/60">
            © {new Date().getFullYear()} {brandName}. Alla rättigheter förbehållna.
          </p>
          
          {/* Social Media Links */}
          {(settings?.facebook || settings?.instagram || settings?.linkedin || settings?.twitter || settings?.youtube) && (
            <div className="flex gap-4">
              {settings?.facebook && (
                <a
                  href={settings.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-foreground/60 hover:text-primary-foreground transition-colors"
                  aria-label="Facebook"
                >
                  <Facebook className="h-5 w-5" />
                </a>
              )}
              {settings?.instagram && (
                <a
                  href={settings.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-foreground/60 hover:text-primary-foreground transition-colors"
                  aria-label="Instagram"
                >
                  <Instagram className="h-5 w-5" />
                </a>
              )}
              {settings?.linkedin && (
                <a
                  href={settings.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-foreground/60 hover:text-primary-foreground transition-colors"
                  aria-label="LinkedIn"
                >
                  <Linkedin className="h-5 w-5" />
                </a>
              )}
              {settings?.twitter && (
                <a
                  href={settings.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-foreground/60 hover:text-primary-foreground transition-colors"
                  aria-label="Twitter / X"
                >
                  <Twitter className="h-5 w-5" />
                </a>
              )}
              {settings?.youtube && (
                <a
                  href={settings.youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-foreground/60 hover:text-primary-foreground transition-colors"
                  aria-label="YouTube"
                >
                  <Youtube className="h-5 w-5" />
                </a>
              )}
            </div>
          )}
          
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
