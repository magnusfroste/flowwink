import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { useBranding } from '@/providers/BrandingProvider';
import { ThemeToggle } from './ThemeToggle';
import { useHeaderBlock, defaultHeaderData } from '@/hooks/useGlobalBlocks';
import { useBlogSettings, useKbSettings } from '@/hooks/useSiteSettings';

interface NavPage {
  id: string;
  title: string;
  slug: string;
  menu_order: number;
}

export function PublicNavigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const currentSlug = location.pathname === '/' ? 'hem' : location.pathname.slice(1);
  const { branding } = useBranding();
  const { resolvedTheme } = useTheme();
  
  // Use header global block settings
  const { data: headerBlock } = useHeaderBlock();
  const headerSettings = headerBlock?.data ?? defaultHeaderData;
  
  // Blog settings
  const { data: blogSettings } = useBlogSettings();
  
  // Knowledge Base settings
  const { data: kbSettings } = useKbSettings();

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

  // Custom nav items from header settings
  const customNavItems = (headerSettings.customNavItems || []).filter(item => item.enabled);

  // Background style classes
  const getBackgroundClasses = () => {
    const style = headerSettings.backgroundStyle || 'solid';
    const showBorder = headerSettings.showBorder !== false;
    const shadow = headerSettings.headerShadow || 'none';
    
    const shadowClasses = {
      none: '',
      sm: 'shadow-sm',
      md: 'shadow-md',
      lg: 'shadow-lg',
    };
    
    const baseClasses = cn(
      "z-50",
      headerSettings.stickyHeader !== false && "sticky top-0",
      showBorder && "border-b",
      shadowClasses[shadow]
    );
    
    switch (style) {
      case 'transparent':
        return cn(baseClasses, "bg-transparent");
      case 'blur':
        return cn(baseClasses, "bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60");
      default:
        return cn(baseClasses, "bg-card");
    }
  };

  // Link color scheme classes
  const getLinkClasses = (isActive: boolean) => {
    const scheme = headerSettings.linkColorScheme || 'default';
    const base = 'px-4 py-2 rounded-md text-sm font-medium transition-colors';
    
    if (isActive) {
      return cn(base, 'bg-primary/10 text-primary');
    }
    
    switch (scheme) {
      case 'primary':
        return cn(base, 'text-primary/80 hover:text-primary hover:bg-primary/5');
      case 'muted':
        return cn(base, 'text-muted-foreground/70 hover:text-muted-foreground hover:bg-muted/50');
      case 'contrast':
        return cn(base, 'text-foreground hover:text-primary hover:bg-muted');
      default:
        return cn(base, 'text-muted-foreground hover:bg-muted hover:text-foreground');
    }
  };

  return (
    <header className={getBackgroundClasses()}>
      <div className="container mx-auto px-6">
        <div className={cn(
          "flex items-center relative",
          headerSettings.headerHeight === 'compact' && "h-12",
          headerSettings.headerHeight === 'tall' && "h-20",
          (!headerSettings.headerHeight || headerSettings.headerHeight === 'default') && "h-16",
          headerSettings.navAlignment === 'left' && "justify-start gap-8",
          headerSettings.navAlignment === 'center' && "justify-between",
          (!headerSettings.navAlignment || headerSettings.navAlignment === 'right') && "justify-between"
        )}>
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3">
            {(() => {
              const showLogo = headerSettings.showLogo !== false;
              const showName = headerSettings.showNameWithLogo === true;
              const logoSize = headerSettings.logoSize || 'md';
              const hasLogo = !!branding?.logo;
              const hasDarkLogo = !!branding?.logoDark;
              const orgName = branding?.organizationName || 'Organisation';
              
              // Choose logo based on theme
              const currentLogo = resolvedTheme === 'dark' && hasDarkLogo 
                ? branding?.logoDark 
                : branding?.logo;
              
              const sizeClasses = {
                sm: 'h-8 max-w-[160px]',
                md: 'h-10 max-w-[200px]',
                lg: 'h-12 max-w-[240px]',
              };
              
              const iconSizes = {
                sm: 'h-8 w-8 text-lg',
                md: 'h-10 w-10 text-xl',
                lg: 'h-12 w-12 text-2xl',
              };

              // Show logo if enabled and exists
              if (showLogo && hasLogo) {
                return (
                  <>
                    <img 
                      src={currentLogo} 
                      alt={orgName} 
                      className={cn(sizeClasses[logoSize], 'object-contain')}
                    />
                    {showName && (
                      <span className="font-serif font-bold text-xl">{orgName}</span>
                    )}
                  </>
                );
              }
              
              // No logo but show name is enabled, or fallback
              return (
                <>
                  <div className={cn('rounded-lg bg-primary flex items-center justify-center', iconSizes[logoSize])}>
                    <span className="text-primary-foreground font-serif font-bold">
                      {orgName.charAt(0)}
                    </span>
                  </div>
                  <span className="font-serif font-bold text-xl">{orgName}</span>
                </>
              );
            })()}
          </Link>

          {/* Desktop Navigation */}
          <nav className={cn(
            "hidden md:flex items-center gap-2",
            headerSettings.navAlignment === 'center' && "absolute left-1/2 -translate-x-1/2"
          )}>
            {pages.map((page) => (
              <Link
                key={page.id}
                to={page.slug === 'hem' ? '/' : `/${page.slug}`}
                className={getLinkClasses(currentSlug === page.slug)}
              >
                {page.title}
              </Link>
            ))}
            {/* Blog link */}
            {blogSettings?.enabled && (
              <Link
                to={`/${blogSettings.archiveSlug || 'blogg'}`}
                className={getLinkClasses(location.pathname.startsWith(`/${blogSettings.archiveSlug || 'blogg'}`))}
              >
                {blogSettings.archiveTitle || 'Blogg'}
              </Link>
            )}
            {/* Knowledge Base link */}
            {kbSettings?.enabled && kbSettings?.showInMenu && (
              <Link
                to={`/${kbSettings.menuSlug || 'hjalp'}`}
                className={getLinkClasses(location.pathname === `/${kbSettings.menuSlug || 'hjalp'}`)}
              >
                {kbSettings.menuTitle || 'Hjälp'}
              </Link>
            )}
            {/* Custom nav items */}
            {customNavItems.map((item) => (
              <a
                key={item.id}
                href={item.url}
                target={item.openInNewTab ? '_blank' : undefined}
                rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
                className={getLinkClasses(false)}
              >
                {item.label}
              </a>
            ))}
            {headerSettings.showThemeToggle !== false && <ThemeToggle />}
          </nav>

          {/* Mobile Menu Button */}
          <div className="flex items-center gap-2 md:hidden">
            {headerSettings.showThemeToggle !== false && <ThemeToggle />}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-md hover:bg-muted transition-colors"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation - Default/Dropdown Style */}
        {mobileMenuOpen && (!headerSettings.mobileMenuStyle || headerSettings.mobileMenuStyle === 'default') && (
          <nav className={cn(
            "md:hidden py-4 border-t",
            headerSettings.mobileMenuAnimation === 'slide-down' && "animate-[slide-in-from-top_0.3s_ease-out]",
            headerSettings.mobileMenuAnimation === 'slide-up' && "animate-[slide-in-from-bottom_0.3s_ease-out]",
            (!headerSettings.mobileMenuAnimation || headerSettings.mobileMenuAnimation === 'fade') && "animate-fade-in"
          )}>
            <div className="flex flex-col gap-1">
              {pages.map((page) => (
                <Link
                  key={page.id}
                  to={page.slug === 'hem' ? '/' : `/${page.slug}`}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'px-4 py-3 rounded-md text-base font-medium transition-colors',
                    'hover:bg-muted',
                    currentSlug === page.slug
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground'
                  )}
                >
                  {page.title}
                </Link>
              ))}
              {blogSettings?.enabled && (
                <Link
                  to={`/${blogSettings.archiveSlug || 'blogg'}`}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'px-4 py-3 rounded-md text-base font-medium transition-colors',
                    'hover:bg-muted',
                    location.pathname.startsWith(`/${blogSettings.archiveSlug || 'blogg'}`)
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground'
                  )}
                >
                  {blogSettings.archiveTitle || 'Blogg'}
                </Link>
              )}
              {kbSettings?.enabled && kbSettings?.showInMenu && (
                <Link
                  to={`/${kbSettings.menuSlug || 'hjalp'}`}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'px-4 py-3 rounded-md text-base font-medium transition-colors',
                    'hover:bg-muted',
                    location.pathname === `/${kbSettings.menuSlug || 'hjalp'}`
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground'
                  )}
                >
                  {kbSettings.menuTitle || 'Hjälp'}
                </Link>
              )}
              {customNavItems.map((item) => (
                <a
                  key={item.id}
                  href={item.url}
                  target={item.openInNewTab ? '_blank' : undefined}
                  rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-4 py-3 rounded-md text-base font-medium transition-colors hover:bg-muted text-muted-foreground"
                >
                  {item.label}
                </a>
              ))}
            </div>
          </nav>
        )}

        {/* Mobile Navigation - Fullscreen Overlay */}
        {mobileMenuOpen && headerSettings.mobileMenuStyle === 'fullscreen' && (
          <div className={cn(
            "fixed inset-0 top-0 left-0 z-50 bg-background md:hidden flex flex-col",
            headerSettings.mobileMenuAnimation === 'slide-down' && "animate-[slide-in-from-top_0.3s_ease-out]",
            headerSettings.mobileMenuAnimation === 'slide-up' && "animate-[slide-in-from-bottom_0.3s_ease-out]",
            (!headerSettings.mobileMenuAnimation || headerSettings.mobileMenuAnimation === 'fade') && "animate-fade-in"
          )}>
            <div className="flex items-center justify-between p-6 border-b">
              <Link to="/" onClick={() => setMobileMenuOpen(false)} className="font-serif font-bold text-xl">
                {branding?.organizationName || 'Organisation'}
              </Link>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-md hover:bg-muted transition-colors"
                aria-label="Close menu"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <nav className="flex-1 flex flex-col justify-center items-center gap-4 p-6">
              {pages.map((page) => (
                <Link
                  key={page.id}
                  to={page.slug === 'hem' ? '/' : `/${page.slug}`}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'text-2xl font-medium transition-colors',
                    currentSlug === page.slug
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {page.title}
                </Link>
              ))}
              {blogSettings?.enabled && (
                <Link
                  to={`/${blogSettings.archiveSlug || 'blogg'}`}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'text-2xl font-medium transition-colors',
                    location.pathname.startsWith(`/${blogSettings.archiveSlug || 'blogg'}`)
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {blogSettings.archiveTitle || 'Blogg'}
                </Link>
              )}
              {kbSettings?.enabled && kbSettings?.showInMenu && (
                <Link
                  to={`/${kbSettings.menuSlug || 'hjalp'}`}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'text-2xl font-medium transition-colors',
                    location.pathname === `/${kbSettings.menuSlug || 'hjalp'}`
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {kbSettings.menuTitle || 'Hjälp'}
                </Link>
              )}
              {customNavItems.map((item) => (
                <a
                  key={item.id}
                  href={item.url}
                  target={item.openInNewTab ? '_blank' : undefined}
                  rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-2xl font-medium transition-colors text-muted-foreground hover:text-foreground"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        )}

        {/* Mobile Navigation - Slide from Right */}
        {mobileMenuOpen && headerSettings.mobileMenuStyle === 'slide' && (
          <div className={cn(
            "fixed inset-y-0 right-0 z-50 w-80 max-w-full bg-background shadow-2xl md:hidden flex flex-col animate-slide-in-right"
          )}>
            <div className="flex items-center justify-between p-6 border-b">
              <span className="font-serif font-bold text-lg">Menu</span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-md hover:bg-muted transition-colors"
                aria-label="Close menu"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <nav className="flex-1 flex flex-col gap-1 p-4 overflow-y-auto">
              {pages.map((page) => (
                <Link
                  key={page.id}
                  to={page.slug === 'hem' ? '/' : `/${page.slug}`}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'px-4 py-3 rounded-md text-base font-medium transition-colors',
                    'hover:bg-muted',
                    currentSlug === page.slug
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground'
                  )}
                >
                  {page.title}
                </Link>
              ))}
              {blogSettings?.enabled && (
                <Link
                  to={`/${blogSettings.archiveSlug || 'blogg'}`}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'px-4 py-3 rounded-md text-base font-medium transition-colors',
                    'hover:bg-muted',
                    location.pathname.startsWith(`/${blogSettings.archiveSlug || 'blogg'}`)
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground'
                  )}
                >
                  {blogSettings.archiveTitle || 'Blogg'}
                </Link>
              )}
              {kbSettings?.enabled && kbSettings?.showInMenu && (
                <Link
                  to={`/${kbSettings.menuSlug || 'hjalp'}`}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'px-4 py-3 rounded-md text-base font-medium transition-colors',
                    'hover:bg-muted',
                    location.pathname === `/${kbSettings.menuSlug || 'hjalp'}`
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground'
                  )}
                >
                  {kbSettings.menuTitle || 'Hjälp'}
                </Link>
              )}
              {customNavItems.map((item) => (
                <a
                  key={item.id}
                  href={item.url}
                  target={item.openInNewTab ? '_blank' : undefined}
                  rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-4 py-3 rounded-md text-base font-medium transition-colors hover:bg-muted text-muted-foreground"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        )}

        {/* Backdrop for slide menu */}
        {mobileMenuOpen && headerSettings.mobileMenuStyle === 'slide' && (
          <div 
            className="fixed inset-0 z-40 bg-black/50 md:hidden animate-fade-in"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}
      </div>
    </header>
  );
}

