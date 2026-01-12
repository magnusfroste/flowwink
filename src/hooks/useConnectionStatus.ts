import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type ConnectionStatus = 'connected' | 'disconnected' | 'checking';

export function useConnectionStatus(checkInterval = 30000) {
  const [status, setStatus] = useState<ConnectionStatus>('checking');
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkConnection = useCallback(async () => {
    setStatus('checking');
    
    try {
      // Simple query to check database connectivity
      const { error } = await supabase
        .from('site_settings')
        .select('id')
        .limit(1)
        .maybeSingle();

      if (error) {
        // Check if it's a connection error vs permission error
        const errorMessage = error.message?.toLowerCase() || '';
        const isConnectionError = 
          errorMessage.includes('fetch') ||
          errorMessage.includes('network') ||
          errorMessage.includes('connection') ||
          errorMessage.includes('failed to fetch') ||
          error.code === 'PGRST000';
        
        setStatus(isConnectionError ? 'disconnected' : 'connected');
      } else {
        setStatus('connected');
      }
    } catch {
      setStatus('disconnected');
    }
    
    setLastChecked(new Date());
  }, []);

  useEffect(() => {
    // Initial check
    checkConnection();

    // Set up interval for periodic checks
    const interval = setInterval(checkConnection, checkInterval);

    return () => clearInterval(interval);
  }, [checkConnection, checkInterval]);

  return { status, lastChecked, checkConnection };
}
