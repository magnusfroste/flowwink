import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { useBranding } from '@/providers/BrandingProvider';
import { ThemeToggle } from './ThemeToggle';
import { useHeaderBlock, defaultHeaderData } from '@/hooks/useGlobalBlocks';
import { useBlogSettings } from '@/hooks/useSiteSettings';
import type { HeaderNavItem } from '@/types/cms';

interface NavPage {
  id: string;
  title: string;
  slug: string;
  menu_order: number;
}

export function PublicNavigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openMegaMenu, setOpenMegaMenu] = useState<string | null>(null);
  const megaMenuTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const location = useLocation();
  const currentSlug = location.pathname === '/' ? 'hem' : location.pathname.slice(1);
  const { branding } = useBranding();
  const { resolvedTheme } = useTheme();
  
  // Use header global block settings
  const { data: headerBlock } = useHeaderBlock();
  const headerSettings = headerBlock?.data ?? defaultHeaderData;
  
  // Check if mega-menu variant is active
  const isMegaMenuVariant = headerSettings.variant === 'mega-menu' || headerSettings.megaMenuEnabled;
  
  // Blog settings
  const { data: blogSettings } = useBlogSettings();

  // Close mega menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setOpenMegaMenu(null);
    if (openMegaMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [openMegaMenu]);

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

  // Handle mega menu hover
  const handleMegaMenuEnter = (itemId: string) => {
    if (megaMenuTimeoutRef.current) {
      clearTimeout(megaMenuTimeoutRef.current);
    }
    setOpenMegaMenu(itemId);
  };

  const handleMegaMenuLeave = () => {
    megaMenuTimeoutRef.current = setTimeout(() => {
      setOpenMegaMenu(null);
    }, 150);
  };

  // Render mega menu dropdown for an item
  const renderMegaMenuDropdown = (item: HeaderNavItem) => {
    if (!item.children || item.children.length === 0) return null;
    
    const columns = headerSettings.megaMenuColumns || 3;
    
    return (
      <div 
        className={cn(
          "absolute top-full left-0 right-0 mt-2 bg-card border rounded-xl shadow-xl z-50",
          "opacity-0 invisible translate-y-2 transition-all duration-200",
          openMegaMenu === item.id && "opacity-100 visible translate-y-0"
        )}
        onMouseEnter={() => handleMegaMenuEnter(item.id)}
        onMouseLeave={handleMegaMenuLeave}
      >
        <div className="container mx-auto px-6 py-8">
          <div className={cn(
            "grid gap-8",
            columns === 2 && "grid-cols-2",
            columns === 3 && "grid-cols-3",
            columns === 4 && "grid-cols-4"
          )}>
            {/* Group children into columns based on columnLabel */}
            {item.children.map((child) => (
              <a
                key={child.id}
                href={child.url}
                target={child.openInNewTab ? '_blank' : undefined}
                rel={child.openInNewTab ? 'noopener noreferrer' : undefined}
                className="group flex items-start gap-3 p-3 rounded-lg hover:bg-muted transition-colors"
              >
                {child.icon && (
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <span className="text-lg">{child.icon}</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-foreground group-hover:text-primary transition-colors">
                    {child.label}
                  </div>
                  {child.description && (
                    <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                      {child.description}
                    </p>
                  )}
                </div>
              </a>
            ))}
          </div>
          
          {/* Optional footer with main link */}
          {item.url && item.url !== '#' && (
            <div className="mt-6 pt-6 border-t">
              <a 
                href={item.url}
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                View all {item.label.toLowerCase()}
                <ChevronDown className="w-4 h-4 rotate-[-90deg]" />
              </a>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render a nav item (with or without mega menu)
  const renderNavItem = (item: HeaderNavItem) => {
    const hasChildren = item.children && item.children.length > 0;
    const showAsMegaMenu = isMegaMenuVariant && hasChildren;
    
    if (showAsMegaMenu) {
      return (
        <div 
          key={item.id}
          className="relative"
          onMouseEnter={() => handleMegaMenuEnter(item.id)}
          onMouseLeave={handleMegaMenuLeave}
        >
          <button
            className={cn(
              getLinkClasses(false),
              "inline-flex items-center gap-1"
            )}
            onClick={(e) => {
              e.stopPropagation();
              setOpenMegaMenu(openMegaMenu === item.id ? null : item.id);
            }}
          >
            {item.label}
            <ChevronDown className={cn(
              "w-4 h-4 transition-transform",
              openMegaMenu === item.id && "rotate-180"
            )} />
          </button>
        </div>
      );
    }
    
    // Regular link
    return (
      <a
        key={item.id}
        href={item.url}
        target={item.openInNewTab ? '_blank' : undefined}
        rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
        className={getLinkClasses(false)}
      >
        {item.label}
      </a>
    );
  };

  return (
    <header className={getBackgroundClasses()}>
      {/* Mega Menu Dropdowns - Rendered at header level for full width */}
      {isMegaMenuVariant && customNavItems.map((item) => (
        item.children && item.children.length > 0 && (
          <div 
            key={`mega-${item.id}`}
            className={cn(
              "absolute left-0 right-0 top-full bg-card border-b shadow-xl z-50",
              "opacity-0 invisible translate-y-[-10px] transition-all duration-200",
              openMegaMenu === item.id && "opacity-100 visible translate-y-0"
            )}
            onMouseEnter={() => handleMegaMenuEnter(item.id)}
            onMouseLeave={handleMegaMenuLeave}
          >
            <div className="container mx-auto px-6 py-8">
              <div className={cn(
                "grid gap-6",
                (headerSettings.megaMenuColumns || 3) === 2 && "grid-cols-2",
                (headerSettings.megaMenuColumns || 3) === 3 && "grid-cols-3",
                (headerSettings.megaMenuColumns || 3) === 4 && "grid-cols-4"
              )}>
                {item.children.map((child) => (
                  <a
                    key={child.id}
                    href={child.url}
                    target={child.openInNewTab ? '_blank' : undefined}
                    rel={child.openInNewTab ? 'noopener noreferrer' : undefined}
                    className="group flex items-start gap-4 p-4 rounded-xl hover:bg-muted transition-colors"
                    onClick={() => setOpenMegaMenu(null)}
                  >
                    {child.icon && (
                      <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        <span className="text-xl">{child.icon}</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-foreground group-hover:text-primary transition-colors">
                        {child.label}
                      </div>
                      {child.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {child.description}
                        </p>
                      )}
                    </div>
                  </a>
                ))}
              </div>
              
              {/* Footer link */}
              {item.url && item.url !== '#' && (
                <div className="mt-6 pt-6 border-t flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{item.description}</span>
                  <a 
                    href={item.url}
                    className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                    onClick={() => setOpenMegaMenu(null)}
                  >
                    Explore {item.label}
                    <ChevronDown className="w-4 h-4 rotate-[-90deg]" />
                  </a>
                </div>
              )}
            </div>
          </div>
        )
      ))}
      
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
                {blogSettings.archiveTitle || 'Blog'}
              </Link>
            )}
            {/* Custom nav items - with mega menu support */}
            {customNavItems.map((item) => renderNavItem(item))}
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
                  {blogSettings.archiveTitle || 'Blog'}
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
                  {blogSettings.archiveTitle || 'Blog'}
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
                  {blogSettings.archiveTitle || 'Blog'}
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

