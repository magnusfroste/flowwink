import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { PublicNavigation } from '@/components/public/PublicNavigation';
import { PublicFooter } from '@/components/public/PublicFooter';
import { useCustomerAuth } from '@/hooks/useCustomerAuth';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Package, MapPin, Heart, User, LogOut, Loader2, CalendarOff, Receipt, Users, Target, Clock, GraduationCap, FileText } from 'lucide-react';
import { useEmployeeSelf } from '@/hooks/useEmployeeSelf';
import { useIsManager } from '@/hooks/useTeam';

const customerNav = [
  { to: '/account', label: 'Orders', icon: Package, exact: true },
  { to: '/account/addresses', label: 'Addresses', icon: MapPin },
  { to: '/account/wishlist', label: 'Wishlist', icon: Heart },
];

const employeeNav = [
  { to: '/account/attendance', label: 'Time clock', icon: Clock },
  { to: '/account/leave', label: 'Leave', icon: CalendarOff },
  { to: '/account/expenses', label: 'Expenses', icon: Receipt },
  { to: '/account/performance', label: 'Performance', icon: Target },
  { to: '/account/skills', label: 'Skills', icon: GraduationCap },
  { to: '/account/contracts', label: 'Contracts', icon: FileText },
];

const managerNav = [{ to: '/account/team', label: 'My Team', icon: Users }];

const profileNav = [{ to: '/account/profile', label: 'Profile', icon: User }];

export default function AccountLayout() {
  const { isLoggedIn, loading, signOut, profile } = useCustomerAuth();
  const { isEmployee } = useEmployeeSelf();
  const { isManager } = useIsManager();
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    ...customerNav,
    ...(isEmployee ? employeeNav : []),
    ...(isManager ? managerNav : []),
    ...profileNav,
  ];

  if (loading) {
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

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <>
      <Helmet><title>{'My Account'}</title></Helmet>
      <PublicNavigation />

      <main className="min-h-screen bg-background">
        <div className="container mx-auto px-6 py-8 max-w-6xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-serif font-bold tracking-tight">My Account</h1>
              {profile?.full_name && (
                <p className="text-muted-foreground mt-1">Welcome back, {profile.full_name}</p>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-muted-foreground">
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
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
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* Content */}
            <div className="min-w-0">
              <Outlet />
            </div>
          </div>
        </div>
      </main>

      <PublicFooter />
    </>
  );
}
