import { Outlet, Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { isStaffSelfService } from '@/lib/staff-self-service';
import { Helmet } from 'react-helmet-async';
import { PublicNavigation } from '@/components/public/PublicNavigation';
import { PublicFooter } from '@/components/public/PublicFooter';
import { useCustomerAuth } from '@/hooks/useCustomerAuth';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Package, LayoutDashboard, ShoppingBag, MapPin, Heart, User, LogOut, Loader2, CalendarOff, Receipt, Users, Target, Clock, GraduationCap, FileText, Sparkles, LifeBuoy, FileSignature, Bot, ArrowLeft, CalendarClock } from 'lucide-react';
import { useEmployeeSelf } from '@/hooks/useEmployeeSelf';
import { useIsManager } from '@/hooks/useTeam';
import { useIsModuleEnabled, useModules } from '@/hooks/useModules';
import { BuildBadge } from '@/components/BuildBadge';
import { useAuth } from '@/hooks/useAuth';
import { useUiText } from '@/lib/ui-text';

/** The menu is read in the visitor's language: each label asks for its own text. */
type Words = (key: string, fallback: string) => string;

// Commerce-scoped portal sections — hidden when the ecommerce module is off
// (an HR-only site still gets the portal, for employee self-service).
// The portal opens on what the customer has — whatever kind of customer they
// are. It opened on Orders: a customer holding a service was met by "No orders
// yet — browse products" (2026-11-18).
const overviewNav = [
  { to: '/account', label: (t: Words) => t('account.nav.overview', 'Overview'), icon: LayoutDashboard, exact: true },
];

const commerceNav = [
  { to: '/account/orders', label: (t: Words) => t('account.nav.orders', 'Orders'), icon: ShoppingBag },
  { to: '/account/addresses', label: (t: Words) => t('account.nav.addresses', 'Addresses'), icon: MapPin },
  { to: '/account/wishlist', label: (t: Words) => t('account.nav.wishlist', 'Wishlist'), icon: Heart },
];

const servicesNav = [
  { to: '/account/services', label: (t: Words) => t('account.nav.services', 'My services'), icon: Package },
];

// What the business has invoiced the customer, and the agreements between
// them — neither had a page: "Contracts" below is the EMPLOYEE's own.
const invoicesNav = [
  { to: '/account/invoices', label: (t: Words) => t('account.nav.invoices', 'My invoices'), icon: Receipt },
];
const agreementsNav = [
  { to: '/account/agreements', label: (t: Words) => t('account.nav.agreements', 'My agreements'), icon: FileSignature },
];

// The times the customer has booked — shown when the booking module is on.
const bookingsNav = [
  { to: '/account/bookings', label: (t: Words) => t('account.nav.bookings', 'My bookings'), icon: CalendarClock },
];

// Quotes the customer has been sent — shown when the quotes module is on.
const quotesNav = [
  { to: '/account/quotes', label: (t: Words) => t('account.nav.quotes', 'My quotes'), icon: FileSignature },
];

const assistantNav = [
  { to: '/account/assistant', label: (t: Words) => t('account.nav.assistant', 'Assistant'), icon: Sparkles },
  { to: '/account/support', label: (t: Words) => t('account.nav.support', 'Support requests'), icon: LifeBuoy },
];

const employeeNav = [
  { to: '/account/attendance', label: (t: Words) => t('account.nav.attendance', 'Time clock'), icon: Clock },
  { to: '/account/leave', label: (t: Words) => t('account.nav.leave', 'Leave'), icon: CalendarOff },
  { to: '/account/expenses', label: (t: Words) => t('account.nav.expenses', 'Expenses'), icon: Receipt },
  { to: '/account/performance', label: (t: Words) => t('account.nav.performance', 'Performance'), icon: Target },
  { to: '/account/skills', label: (t: Words) => t('account.nav.skills', 'Skills'), icon: GraduationCap },
  { to: '/account/contracts', label: (t: Words) => t('account.nav.employmentContract', 'Employment contract'), icon: FileText },
  { to: '/account/payslips', label: (t: Words) => t('account.nav.payslips', 'Payslips'), icon: Receipt },
];

const managerNav = [{ to: '/account/team', label: (t: Words) => t('account.nav.team', 'My Team'), icon: Users }];

const profileNav = [{ to: '/account/profile', label: (t: Words) => t('account.nav.profile', 'Profile'), icon: User }];
// Staff (anyone with a role) may connect their own agent; it acts as them.
const agentsNav = [{ to: '/account/agents', label: (t: Words) => t('account.nav.agents', 'My agents'), icon: Bot }];

export default function AccountLayout() {
  const { isLoggedIn, loading, signOut, profile } = useCustomerAuth();
  const t = useUiText();
  // The destination follows the PERSON, not the door (Svante-incident
  // 2026-08-17): the portal login hardcoded /account while /auth hardcodes
  // /admin, so a salesperson who happened to log in through the public site
  // landed among order history. Pure staff (roles but no customer role) are
  // sent home; someone who is BOTH staff and customer (the B2B seam) stays.
  const { roles, rolesReady } = useAuth();
  const { isEmployee } = useEmployeeSelf();
  const { isManager } = useIsManager();
  const ecommerceEnabled = useIsModuleEnabled('ecommerce');
  const subscriptionsEnabled = useIsModuleEnabled('subscriptions');
  const quotesEnabled = useIsModuleEnabled('quotes');
  const invoicingEnabled = useIsModuleEnabled('invoicing');
  const contractsEnabled = useIsModuleEnabled('contracts');
  const bookingsEnabled = useIsModuleEnabled('bookings');
  const { isLoading: modulesLoading } = useModules();
  const location = useLocation();
  const navigate = useNavigate();

  // A staff member who is not also a customer sees only their own pages here.
  const staffOnly = rolesReady && roles.length > 0 && !roles.includes('customer');
  const navItems = staffOnly ? [
    ...(isEmployee ? employeeNav : []),
    ...(isManager ? managerNav : []),
    ...agentsNav,
    { to: '/admin', label: (t: Words) => t('account.nav.backToWork', 'Back to work'), icon: ArrowLeft },
  ] : [
    ...overviewNav,
    // What a customer holds comes before what a shop sells.
    ...(subscriptionsEnabled ? servicesNav : []),
    ...(invoicingEnabled ? invoicesNav : []),
    ...(contractsEnabled ? agreementsNav : []),
    ...(bookingsEnabled ? bookingsNav : []),
    ...(quotesEnabled ? quotesNav : []),
    ...(ecommerceEnabled ? commerceNav : []),
    ...assistantNav,
    ...(isEmployee ? employeeNav : []),
    ...(isManager ? managerNav : []),
    ...(rolesReady && roles.length > 0 ? agentsNav : []),
    ...profileNav,
  ];

  // Also wait for module settings to hydrate — otherwise a cold navigation to
  // `/account` on an ecommerce-enabled tenant briefly sees `ecommerceEnabled=false`
  // (the default) and the guard below bounces the visitor to /assistant.
  if (loading || modulesLoading) {
    return (
      <>
        <PublicNavigation />
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </>
    );
  }

  if (!isLoggedIn) {
    navigate('/account/login?redirect=' + encodeURIComponent(location.pathname));
    return null;
  }

  // Staff are sent home — except to their OWN pages: an employee's leave,
  // payslips, contract and expenses, a manager's team, their agents. Until
  // 2026-11-01 every invited employee (roles employee + writer, no customer
  // role) was bounced from /account/payslips to /admin, so the self-service
  // the HR module built for them had no door. The person menu's "My
  // employment" opens here.
  if (rolesReady && roles.length > 0 && !roles.includes('customer') && !isStaffSelfService(location.pathname)) {
    return <Navigate to="/admin" replace />;
  }

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <>
      <Helmet><title>{t('account.title', 'My Account')}</title></Helmet>
      <PublicNavigation />

      <main className="min-h-screen bg-background">
        <div className="container mx-auto px-6 py-8 max-w-6xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-serif font-bold tracking-tight">{t('account.title', 'My Account')}</h1>
              {profile?.full_name && (
                <p className="text-muted-foreground mt-1">{t('account.welcomeBack', 'Welcome back, {name}').replace('{name}', profile.full_name)}</p>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-muted-foreground">
              <LogOut className="h-4 w-4 mr-2" />
              {t('account.signOut', 'Sign out')}
            </Button>
          </div>

          <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
            {/* Sidebar nav */}
            <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
              {navItems.map((item) => {
                const isActive = (item as { exact?: boolean }).exact
                  ? location.pathname === item.to
                  : location.pathname.startsWith(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label(t)}
                  </Link>
                );
              })}
            </nav>

            {/* Content */}
            <div className="min-w-0">
              <Outlet />
            </div>
          </div>

          <div className="mt-8 flex justify-end">
            <BuildBadge />
          </div>
        </div>
      </main>


      <PublicFooter />
    </>
  );
}
