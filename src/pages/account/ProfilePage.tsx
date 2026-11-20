import { useState, useEffect } from 'react';
import { useCustomerAuth } from '@/hooks/useCustomerAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';
import { useCustomerFormat } from '@/hooks/useCustomerFormat';
import { useUiText } from '@/lib/ui-text';

export default function CustomerProfilePage() {
  const t = useUiText();
  const { formatDateTime } = useCustomerFormat();
  const { user, profile, refreshProfile } = useCustomerAuth();
  const [fullName, setFullName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
    }
  }, [profile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim() })
      .eq('id', user.id);
    setIsSaving(false);
    if (error) {
      toast.error(t('account.profile.saveFailed', 'Could not update the profile'));
    } else {
      toast.success(t('account.profile.saved', 'Profile updated'));
      refreshProfile();
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">{t('account.profile.title', 'Profile settings')}</h2>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('account.profile.personal', 'Personal information')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('account.profile.email', 'Email')}</Label>
              <Input value={user?.email || ''} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground">{t('account.profile.emailFixed', 'Email cannot be changed here.')}</p>
            </div>
            <div className="space-y-2">
              <Label>{t('account.addresses.fullName', 'Full name')}</Label>
              <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder={t('account.profile.yourName', 'Your name')} />
            </div>
            <Button type="submit" disabled={isSaving} size="sm">
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {t('account.profile.save', 'Save changes')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('account.profile.account', 'Account')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">
              {t('account.profile.memberSince', 'Member since {date}').replace('{date}', user?.created_at ? formatDateTime(user.created_at, { year: 'numeric', month: 'long', day: undefined, hour: undefined, minute: undefined }) : '—')}
            </p>
          </div>
          <Separator />
          <p className="text-xs text-muted-foreground">
            {t('account.profile.contactSupport', 'To delete your account or change your email, please contact support.')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
