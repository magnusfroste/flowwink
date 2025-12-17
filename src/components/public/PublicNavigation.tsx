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

  return (
    <header className={cn(
      "border-b bg-card z-50",
      headerSettings.stickyHeader !== false && "sticky top-0"
    )}>
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between h-16">
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
          <nav className="hidden md:flex items-center gap-2">
            {pages.map((page) => (
              <Link
                key={page.id}
                to={page.slug === 'hem' ? '/' : `/${page.slug}`}
                className={cn(
                  'px-4 py-2 rounded-md text-sm font-medium transition-colors',
                  'hover:bg-muted hover:text-foreground',
                  currentSlug === page.slug
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground'
                )}
              >
                {page.title}
              </Link>
            ))}
            {/* Custom nav items */}
            {customNavItems.map((item) => (
              <a
                key={item.id}
                href={item.url}
                target={item.openInNewTab ? '_blank' : undefined}
                rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
                className="px-4 py-2 rounded-md text-sm font-medium transition-colors hover:bg-muted hover:text-foreground text-muted-foreground"
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

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav className="md:hidden py-4 border-t animate-fade-in">
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
              {/* Custom nav items in mobile */}
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
      </div>
    </header>
  );
}

