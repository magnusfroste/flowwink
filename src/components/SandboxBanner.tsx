import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { FlaskConical } from 'lucide-react';

/**
 * Slim banner shown on sandbox instances (site_settings.sandbox_mode = true).
 * The sandbox model: testers get FULL admin and the nightly rebuild is the
 * safety mechanism — this banner is the disclaimer that makes that deal
 * explicit. Renders nothing everywhere else, and nothing while loading, so
 * customer instances never flash it.
 */
export function SandboxBanner() {
  const { data: isSandbox } = useQuery({
    queryKey: ['site-settings', 'sandbox_mode'],
    queryFn: async () => {
      const { data } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'sandbox_mode')
        .maybeSingle();
      const v = data?.value as unknown;
      return v === true || (typeof v === 'object' && v !== null && (v as { enabled?: boolean }).enabled === true);
    },
    staleTime: 1000 * 60 * 30,
  });

  if (!isSandbox) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-primary px-4 py-1.5 text-center text-xs font-medium text-primary-foreground">
      <FlaskConical className="h-3.5 w-3.5 shrink-0" />
      <span>
        This is the FlowWink sandbox — build anything, break anything. Resets nightly at 04:00 UTC.
        Sign in with <span className="font-semibold">demo@flowwink.com / demo1234</span>.
      </span>
    </div>
  );
}
