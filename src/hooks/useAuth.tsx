import { logger } from '@/lib/logger';
import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Profile, AppRole } from '@/types/cms';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  /** Primary role (first row in user_roles) — kept for backwards compatibility. */
  role: AppRole | null;
  /** All roles assigned to the user (multi-role support). */
  roles: AppRole[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  /** True if user has the given functional role, OR is admin (admin sees everything). */
  hasRole: (role: AppRole) => boolean;
  /** True if user has any of the given roles, OR is admin. */
  hasAnyRole: (roles: AppRole[]) => boolean;
  /** Legacy gates — writer/approver are deprecated, treated as admin. */
  isWriter: boolean;
  isApprover: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        // Fire-and-forget auth event tracking (admin login monitor)
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' || event === 'PASSWORD_RECOVERY') {
          const map: Record<string, string> = {
            SIGNED_IN: 'sign_in',
            SIGNED_OUT: 'sign_out',
            TOKEN_REFRESHED: 'token_refreshed',
            PASSWORD_RECOVERY: 'password_reset',
          };
          // Skip noisy token_refreshed for now (keeps table tidy)
          if (event !== 'TOKEN_REFRESHED') {
            trackAuthEvent(map[event], session?.user?.id ?? null, session?.user?.email ?? null);
          }
        }

        // Defer profile fetch with setTimeout to avoid deadlock
        if (session?.user) {
          setTimeout(() => {
            fetchUserData(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setRole(null);
          setRoles([]);
          setLoading(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        fetchUserData(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const trackAuthEvent = (
    event_type: string,
    user_id: string | null,
    email: string | null,
    metadata: Record<string, unknown> = {},
  ) => {
    try {
      const ua = navigator.userAgent;
      const device_type = /tablet|ipad|playbook|silk/i.test(ua)
        ? 'tablet'
        : /mobile|iphone|ipod|android/i.test(ua) ? 'mobile' : 'desktop';
      const browser = ua.includes('Firefox') ? 'Firefox'
        : ua.includes('Edg') ? 'Edge'
        : ua.includes('Chrome') ? 'Chrome'
        : ua.includes('Safari') ? 'Safari' : 'Other';
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-auth-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type, user_id, email, user_agent: ua, device_type, browser, metadata }),
      }).catch(() => { /* silent */ });
    } catch (_) { /* silent */ }
  };



  const fetchUserData = async (userId: string) => {
    try {
      // Fetch profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      
      setProfile(profileData as Profile | null);

      // Fetch ALL roles (multi-role support)
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);
      
      const allRoles = (roleData ?? []).map(r => r.role as AppRole);
      setRoles(allRoles);
      // Primary role: prefer admin, otherwise first row
      const primary = allRoles.includes('admin')
        ? 'admin'
        : (allRoles[0] ?? null);
      setRole(primary);
    } catch (error) {
      logger.error('Error fetching user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      trackAuthEvent('failed_login', null, email, { reason: error.message });
    }
    return { error: error as Error | null };
  };


  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRole(null);
    setRoles([]);
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchUserData(user.id);
    }
  };

  const isAdmin = roles.includes('admin');
  // Legacy gates: writer/approver are deprecated. Treat them as admin so existing
  // CMS publish-flow checks still grant access. New code should use hasRole/hasAnyRole.
  const isWriter = isAdmin || roles.includes('writer') || roles.includes('approver') || roles.length > 0;
  const isApprover = isAdmin || roles.includes('approver');

  const hasRole = (r: AppRole) => isAdmin || roles.includes(r);
  const hasAnyRole = (rs: AppRole[]) => isAdmin || rs.some(r => roles.includes(r));

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      role,
      roles,
      loading,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      hasRole,
      hasAnyRole,
      isWriter,
      isApprover,
      isAdmin,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
