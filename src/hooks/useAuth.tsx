import { logger } from '@/lib/logger';
import { useState, useEffect, useRef, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Profile, AppRole } from '@/types/cms';
import { EMPTY_MFA_STATE, type MfaState } from '@/lib/mfa-gate';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  /** Primary role (first row in user_roles) — kept for backwards compatibility. */
  role: AppRole | null;
  /** All roles assigned to the user (multi-role support). */
  roles: AppRole[];
  loading: boolean;
  /**
   * True once user_roles has been fetched for the CURRENT user. Distinct from
   * `loading`: on sign-in, onAuthStateChange sets `user` immediately but
   * defers the roles fetch (setTimeout-deadlock guard) — in that window
   * user≠null, loading=false, roles=[] and every role-derived flag (isWriter,
   * isAdmin) is momentarily FALSE. Guards that deny on those flags must wait
   * for rolesReady, or every login flashes "Access Denied" for half a second.
   */
  rolesReady: boolean;
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
  /** True admin status from DB, ignoring any active role preview. */
  realIsAdmin: boolean;
  /** Roles the underlying account actually has (unfiltered). */
  realRoles: AppRole[];
  /** The session's MFA standing: proved level, reachable level, verified factors. */
  mfa: MfaState;
  /** Re-read the MFA standing — after a challenge, an enrollment or a removed factor. */
  refreshMfa: () => Promise<void>;
  /** Non-null when admin is previewing the app as another role set. */
  previewRoles: AppRole[] | null;
  /** Admin-only: activate a preview of another role set (visual-only, RLS unchanged). */
  setPreviewRoles: (roles: AppRole[] | null) => void;
}


const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * The role a user IS, for display: admin first, then any functional role,
 * customer last. "First row" is insertion order, and the signup trigger's
 * fail-closed customer row is always oldest — so any account upgraded from a
 * signup was displayed as "Customer" forever. This bug has now been fixed
 * TWICE (fetchUserData 2026-07, effectivePrimary 2026-08-13) because the
 * derivation existed in two copies; this is the only one.
 */
export function primaryRole(roles: AppRole[]): AppRole | null {
  if (roles.includes('admin')) return 'admin';
  return roles.find((r) => r !== 'customer') ?? roles[0] ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [rolesReady, setRolesReady] = useState(false);
  const [mfa, setMfa] = useState<MfaState>(EMPTY_MFA_STATE);

  // The session's second-factor standing. Two reads, both cheap and local to
  // the Auth server; failure leaves `loaded: false`, and an unloaded state
  // gates nothing — the database's own gate still holds (session_mfa_ok).
  const refreshMfa = async () => {
    try {
      const [{ data: aal, error: aalErr }, { data: factors, error: facErr }] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]);
      if (aalErr || facErr) {
        logger.warn('[auth] MFA standing unreadable:', aalErr?.message ?? facErr?.message);
        setMfa(EMPTY_MFA_STATE);
        return;
      }
      const verified = (factors?.totp ?? []).filter((f) => f.status === 'verified').length;
      setMfa({
        currentLevel: (aal?.currentLevel as MfaState['currentLevel']) ?? null,
        nextLevel: (aal?.nextLevel as MfaState['nextLevel']) ?? null,
        verifiedFactors: verified,
        loaded: true,
      });
    } catch (e) {
      logger.warn('[auth] MFA standing unreadable:', e);
      setMfa(EMPTY_MFA_STATE);
    }
  };
  // Token refreshes re-fire onAuthStateChange for the SAME user — roles are
  // already loaded then, and resetting rolesReady would flash the spinner
  // mid-session. Only unknown users reset it.
  const rolesFetchedFor = useRef<string | null>(null);

  const [previewRoles, setPreviewRolesState] = useState<AppRole[] | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = sessionStorage.getItem('flowwink.rolePreview');
      if (!raw) return null;
      const parsed = JSON.parse(raw) as AppRole[];
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
    } catch { return null; }
  });

  const setPreviewRoles = (next: AppRole[] | null) => {
    setPreviewRolesState(next);
    try {
      if (next && next.length > 0) {
        sessionStorage.setItem('flowwink.rolePreview', JSON.stringify(next));
      } else {
        sessionStorage.removeItem('flowwink.rolePreview');
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);


        // Defer profile fetch with setTimeout to avoid deadlock
        if (session?.user) {
          if (rolesFetchedFor.current !== session.user.id) setRolesReady(false);
          setTimeout(() => {
            fetchUserData(session.user.id);
            // A challenge or an enrollment refreshes the session (MFA_CHALLENGE_VERIFIED
            // arrives as a token refresh), so the standing is re-read on every event.
            void refreshMfa();
          }, 0);
        } else {
          setMfa(EMPTY_MFA_STATE);
          setProfile(null);
          setRole(null);
          setRoles([]);
          rolesFetchedFor.current = null;
          setRolesReady(true); // nothing to load — guards may judge
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
        void refreshMfa();
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
      setRole(primaryRole(allRoles));
      rolesFetchedFor.current = userId;
    } catch (error) {
      logger.error('Error fetching user data:', error);
    } finally {
      // Ready even on error — an infinite spinner is worse than a deny the
      // user can retry; the error is logged above.
      setRolesReady(true);
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      trackAuthEvent('failed_login', null, email, { reason: error.message });
    } else {
      trackAuthEvent('sign_in', data.user?.id ?? null, data.user?.email ?? email);
    }
    return { error: error as Error | null };
  };


  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });
    if (!error) {
      trackAuthEvent('sign_up', data.user?.id ?? null, data.user?.email ?? email);
    }
    return { error: error as Error | null };
  };

  const signOut = async () => {
    const currentUserId = user?.id ?? null;
    const currentEmail = user?.email ?? null;
    await supabase.auth.signOut();
    trackAuthEvent('sign_out', currentUserId, currentEmail);
    setUser(null);
    setSession(null);
    setProfile(null);
    setRole(null);
    setRoles([]);
    setMfa(EMPTY_MFA_STATE);
  };


  const refreshProfile = async () => {
    if (user) {
      await fetchUserData(user.id);
    }
  };

  const realRoles = roles;
  const realIsAdmin = realRoles.includes('admin');

  // If admin has an active preview, use those roles for all downstream checks.
  // Preview is a visual-only override — server-side RLS uses the real JWT.
  const effectiveRoles: AppRole[] = realIsAdmin && previewRoles && previewRoles.length > 0
    ? previewRoles
    : realRoles;
  const effectivePrimary: AppRole | null = primaryRole(effectiveRoles);

  const isAdmin = effectiveRoles.includes('admin');
  // #102: `length > 0` counted CUSTOMER as staff — a customer navigating to
  // /admin passed this gate (matrix-empty nav, but inside the shell). Staff =
  // any non-customer role.
  const isWriter = isAdmin || effectiveRoles.some((r) => r !== 'customer');
  const isApprover = isAdmin || effectiveRoles.includes('approver');

  const hasRole = (r: AppRole) => isAdmin || effectiveRoles.includes(r);
  const hasAnyRole = (rs: AppRole[]) => isAdmin || rs.some(r => effectiveRoles.includes(r));

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      role: effectivePrimary,
      roles: effectiveRoles,
      loading,
      rolesReady,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      hasRole,
      hasAnyRole,
      isWriter,
      isApprover,
      isAdmin,
      realIsAdmin,
      realRoles,
      mfa,
      refreshMfa,
      previewRoles: realIsAdmin ? previewRoles : null,
      setPreviewRoles,
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
