import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Save } from 'lucide-react';
import type { BrandingSettings } from '@/hooks/useSiteSettings';

const defaultBranding: BrandingSettings = {
  logo: '',
  logoDark: '',
  favicon: '',
  organizationName: '',
  primaryColor: '220 100% 26%',
  secondaryColor: '210 40% 96%',
  accentColor: '199 89% 48%',
  headingFont: 'PT Serif',
  bodyFont: 'Inter',
  borderRadius: 'md',
  shadowIntensity: 'subtle',
};

export default function BrandingTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [branding, setBranding] = useState<BrandingSettings>(defaultBranding);

  const { data, isLoading } = useQuery({
    queryKey: ['site-settings', 'branding'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'branding')
        .maybeSingle();
      if (error) throw error;
      return (data?.value as unknown as BrandingSettings) || defaultBranding;
    },
  });

  useEffect(() => {
    if (data) setBranding(data);
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: async (newBranding: BrandingSettings) => {
      const { error } = await supabase
        .from('site_settings')
        .upsert({ key: 'branding', value: newBranding as any });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-settings', 'branding'] });
      toast({ title: 'Branding updated' });
    },
  });

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Organization Branding</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>Organization Name</Label>
            <Input 
              value={branding.organizationName} 
              onChange={(e) => setBranding({ ...branding, organizationName: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Primary Color (HSL)</Label>
              <Input 
                value={branding.primaryColor} 
                onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Accent Color (HSL)</Label>
              <Input 
                value={branding.accentColor} 
                onChange={(e) => setBranding({ ...branding, accentColor: e.target.value })}
              />
            </div>
          </div>
          <Button onClick={() => updateMutation.mutate(branding)} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Changes
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
