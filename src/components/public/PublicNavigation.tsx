import { useQuery } from '@tanstack/react-query';
import { useUiText } from '@/lib/ui-text';
import { supabase } from '@/integrations/supabase/client';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { useBranding } from '@/providers/BrandingProvider';
import { ThemeToggle } from './ThemeToggle';
import { CartIndicator } from './CartIndicator';
import { AccountIndicator } from './AccountIndicator';
import { LanguageSwitcher, type PageTranslation } from './LanguageSwitcher';
import { pickLocale } from '@/lib/pick-locale';
import { blogLinkLabel } from '@/lib/operator-text';
import { SandboxBanner } from '@/components/SandboxBanner';
import { useHeaderBlock, defaultHeaderData } from '@/hooks/useGlobalBlocks';
import { useBlogSettings, useStoreSettings, useCustomerPortalSettings, useSiteLanguages } from '@/hooks/useSiteSettings';
import { useIsModuleEnabled } from '@/hooks/useModules';
import type { HeaderNavItem } from '@/types/cms';

interface NavPage {
  id: string;
  title: string;
  slug: string;
  menu_order: number;
}

interface PublicNavigationProps {
  /**
   * Published language versions of the page being shown, when it has any.
   * Only PublicPage passes these — every other public page keeps calling
   * <PublicNavigation /> with no props and behaves exactly as before.
   */
  translations?: PageTranslation[];
  currentLocale?: string | null;
}

export function PublicNavigation({ translations, currentLocale }: PublicNavigationProps = {}) {
  const t = useUiText();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openMegaMenu, setOpenMegaMenu] = useState<string | null>(null);
  const megaMenuTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const location = useLocation();
  const currentSlug = location.pathname === '/' ? 'hem' : location.pathname.slice(1);
  const { branding } = useBranding();
  const { resolvedTheme } = useTheme();
  const ecommerceEnabled = useIsModuleEnabled('ecommerce');
  const hrEnabled = useIsModuleEnabled('hr');
  const { data: storeSettings } = useStoreSettings();
  const { data: portalSettings } = useCustomerPortalSettings();
  // The account portal is cross-functional: customers (ecommerce) and employee
  // self-service (hr) share the same entrance — but the OPERATOR decides
  // whether that entrance is public (customer_portal.enabled, default true).
  // A service business running ecommerce for its catalog only can hide it
  // until the portal has something to show.
  const accountEnabled = (ecommerceEnabled || hrEnabled) && (portalSettings?.enabled ?? true);
  // The cart is storefront chrome, not module identity: the ecommerce module's
  // catalog feeds quotes/contracts too, so the cart follows the storefront
  // dial (default true — a shop instance sees zero change).
  const cartEnabled = ecommerceEnabled && (storeSettings?.storefront ?? true);
  const blogModuleEnabled = useIsModuleEnabled('blog');
  
  // Use header global block settings
  const { data: headerBlock } = useHeaderBlock();
  const headerSettings = headerBlock?.data ?? defaultHeaderData;
  
  // Check if mega-menu variant is active
  const isMegaMenuVariant = headerSettings.variant === 'mega-menu' || headerSettings.megaMenuEnabled;
  
  // Blog settings
  const { data: blogSettings } = useBlogSettings();
  const { defaultLanguage: siteDefaultLanguage } = useSiteLanguages();

  // Close mega menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setOpenMegaMenu(null);
    if (openMegaMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [openMegaMenu]);

  const { data: sourcePages = [] } = useQuery({
    queryKey: ['public-nav-pages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pages')
        .select('id, title, slug, menu_order')
        .eq('status', 'published')
        .eq('show_in_menu', true)
        .is('deleted_at', null)
        .order('menu_order', { ascending: true })
        .order('title', { ascending: true });

      if (error) throw error;
      return (data || []) as NavPage[];
    },
    staleTime: 1000 * 60 * 5,
  });

  // Overlay-headern tar ingen plats i flödet — sidor UTAN hero börjar annars
  // på y=0 under den (chatten på /chat låg under nav-länkarna, autoversio
  // 2026-08-28). Headern annonserar sin uppmätta höjd som CSS-variabel;
  // hero-lösa sidor konsumerar den som padding-top. Icke-overlay: variabeln
  // tas bort → 0 → ingen effekt.
  const overlayStyle = headerSettings.backgroundStyle || 'solid';
  const headerIsOverlay = overlayStyle === 'transparent';
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const root = document.documentElement;
    if (!headerIsOverlay) { root.style.removeProperty('--overlay-header-offset'); return; }
    const set = () => root.style.setProperty('--overlay-header-offset', `${headerRef.current?.offsetHeight ?? 64}px`);
    set();
    window.addEventListener('resize', set);
    return () => { window.removeEventListener('resize', set); root.style.removeProperty('--overlay-header-offset'); };
  }, [headerIsOverlay]);

  // ── Bloggänkens etikett ────────────────────────────────────────────────
  // archiveTitle är operatörens ord för SITT EGET språk — samma roll som det
  // platta baslagret i ui_text-packet. På en sida i ett annat språk får det
  // därför inte vara fallbacken, annars står "Blogg" kvar i en engelsk meny.
  // Där svarar packets overlay, och annars kodens engelska.
  const blogLabel = blogLinkLabel(
    blogSettings?.archiveTitle,
    t('nav.blog', 'Blog'),
    currentLocale,
    siteDefaultLanguage,
  );

  // ── Navigationen följer besökarens språk ───────────────────────────────
  // Utan det här landar en engelsk besökare som klickar "Tjänster" på den
  // svenska sidan, och språkvalet varar exakt en sida. Frågan ställs BARA när
  // sidan deklarerat ett språk, och den träffar bara sidor som faktiskt ingår
  // i en översättningsgrupp — på en enspråkig instans finns inga sådana rader,
  // så kostnaden där är noll.
  const { data: siblings = [] } = useQuery({
    queryKey: ['public-nav-translations'],
    enabled: !!currentLocale,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pages')
        .select('slug, title, locale, translation_group_id')
        .eq('status', 'published')
        .is('deleted_at', null)
        .not('translation_group_id', 'is', null);
      if (error) throw error;
      return (data || []) as Array<{ slug: string; title: string; locale: string | null; translation_group_id: string | null }>;
    },
    staleTime: 1000 * 60 * 5,
  });

  /** The sibling of `slug` in the visitor's language, or null when there is none. */
  const siblingOf = useMemo(() => {
    if (!currentLocale || siblings.length === 0) return () => null as null | { slug: string; title: string };
    const bySlug = new Map(siblings.map((p) => [p.slug, p]));
    return (slug: string) => {
      const source = bySlug.get(slug);
      if (!source?.translation_group_id) return null;
      const group = siblings.filter((p) => p.translation_group_id === source.translation_group_id);
      const chosen = pickLocale({
        available: group.map((p) => String(p.locale ?? '')),
        wanted: currentLocale,
      });
      if (!chosen) return null;
      const target = group.find((p) => String(p.locale ?? '') === chosen);
      return target && target.slug !== slug ? { slug: target.slug, title: target.title } : null;
    };
  }, [siblings, currentLocale]);

  /** '/product/#privatai' → the same path against the sibling slug. */
  const localizeUrl = (url: string): string => {
    if (!url || !url.startsWith('/')) return url;
    const [path, hash] = url.split('#');
    const slug = path.replace(/^\//, '').replace(/\/$/, '');
    const sibling = slug ? siblingOf(slug) : null;
    if (!sibling) return url;
    return `/${sibling.slug}${path.endsWith('/') ? '/' : ''}${hash ? `#${hash}` : ''}`;
  };

  // The menu is built from ALREADY localised data, so every renderer below —
  // desktop, mobile, mega-menu — stays exactly as it was.
  const pages = useMemo(
    () => sourcePages.map((page) => {
      const sibling = siblingOf(page.slug);
      return sibling ? { ...page, slug: sibling.slug, title: sibling.title } : page;
    }),
    [sourcePages, siblingOf],
  );

  // Custom nav items from header settings
  const customNavItems = useMemo(() => {
    const localizeItem = (item: HeaderNavItem): HeaderNavItem => ({
      ...item,
      url: item.url ? localizeUrl(item.url) : item.url,
      label: (item.url && siblingOf(item.url.replace(/^\//, '').split('#')[0].replace(/\/$/, ''))?.title) || item.label,
      children: item.children?.map(localizeItem),
    });
    return (headerSettings.customNavItems || [])
      .filter((item) => item.enabled)
      .map(localizeItem);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headerSettings.customNavItems, siblingOf]);

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
    
    // Transparent är ett ÖVERLÄGG, inte en färg. bg-transparent i normalt
    // dokumentflöde tar bara bort färgen men behåller PLATSEN — headern blev
    // ett sidbakgrundsfärgat band OVANFÖR heron i stället för att sväva över
    // den (uppmätt på optic 2026-08-26; redigeraren lovar 'Minimalist
    // transparent header'). Kontraktet nu: transparent = absolut positionerad
    // över innehållet — heron fortsätter upp bakom den — och scrollar bort
    // med sidan (parad med en hero, som mönstret alltid används). Vill man ha
    // följ-med-vid-scroll är det blur/solid + sticky som är valet.
    // Båda rattarna talar sanning: transparent är alltid ett ÖVERLÄGG (heron
    // fortsätter upp bakom), och sticky-ratten avgör om överlägget FÖLJER MED
    // (fixed) eller scrollar bort (absolute). Preset-matrisen valde detta
    // långt före oss: clean = transparent + sticky:false, sticky-varianten =
    // blur + sticky:true. En manuell kombination transparent+sticky är
    // författarens uttryckliga val av två rattar — den ignoreras inte tyst.
    const isOverlay = style === 'transparent';
    const overlayFollows = headerSettings.stickyHeader !== false;
    const baseClasses = cn(
      "z-50",
      isOverlay
        ? (overlayFollows ? "fixed top-0 left-0 right-0" : "absolute top-0 left-0 right-0")
        : headerSettings.stickyHeader !== false && "sticky top-0",
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
    <>
    <SandboxBanner />
    <header ref={headerRef} className={getBackgroundClasses()}>
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
              const showName = headerSettings.showNameWithLogo === true || branding?.showNameWithLogo === true;
              const logoSize = headerSettings.logoSize || 'md';
              const hasLogo = !!branding?.logo;
              const hasDarkLogo = !!branding?.logoDark;
              const orgName = branding?.organizationName || 'Organization';
              
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
            {blogModuleEnabled && blogSettings?.enabled && (
              <Link
                to={'/blog'}
                className={getLinkClasses(location.pathname.startsWith('/blog'))}
              >
                {blogLabel}
              </Link>
            )}
            {/* Custom nav items - with mega menu support */}
            {customNavItems.map((item) => renderNavItem(item))}
            {branding?.allowThemeToggle !== false && <ThemeToggle />}
            <LanguageSwitcher translations={translations} currentLocale={currentLocale} />
            {accountEnabled && <AccountIndicator />}
            {cartEnabled && <CartIndicator />}
          </nav>

          {/* Mobile Menu Button */}
          <div className="flex items-center gap-2 md:hidden">
            {branding?.allowThemeToggle !== false && <ThemeToggle />}
            <LanguageSwitcher translations={translations} currentLocale={currentLocale} />
            {accountEnabled && <AccountIndicator />}
            {cartEnabled && <CartIndicator />}
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
              {blogModuleEnabled && blogSettings?.enabled && (
                <Link
                  to={'/blog'}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'px-4 py-3 rounded-md text-base font-medium transition-colors',
                    'hover:bg-muted',
                    location.pathname.startsWith('/blog')
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground'
                  )}
                >
                  {blogLabel}
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
                {branding?.organizationName || 'Organization'}
              </Link>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-md hover:bg-muted transition-colors"
                aria-label={t('nav.closeMenu', 'Close menu')}
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
              {blogModuleEnabled && blogSettings?.enabled && (
                <Link
                  to={'/blog'}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'text-2xl font-medium transition-colors',
                    location.pathname.startsWith('/blog')
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {blogLabel}
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
                aria-label={t('nav.closeMenu', 'Close menu')}
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
              {blogModuleEnabled && blogSettings?.enabled && (
                <Link
                  to={'/blog'}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'px-4 py-3 rounded-md text-base font-medium transition-colors',
                    'hover:bg-muted',
                    location.pathname.startsWith('/blog')
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground'
                  )}
                >
                  {blogLabel}
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
    </>
  );
}

