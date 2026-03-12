import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

/**
 * Customer-specific auth hook.
 * Wraps useAuth with customer signup (sets signup_type metadata).
 */
export function useCustomerAuth() {
  const auth = useAuth();

  const isCustomer = auth.role === 'customer';
  const isLoggedIn = !!auth.user;

  const customerSignUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/account`,
        data: {
          full_name: fullName,
          signup_type: 'customer',
        },
      },
    });
    return { error: error as Error | null };
  };

  const customerSignIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  return {
    ...auth,
    isCustomer,
    isLoggedIn,
    customerSignUp,
    customerSignIn,
  };
}
