import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useFooterSettings, useUpdateFooterSettings, FooterSettings } from '@/hooks/useSiteSettings';
import { Loader2, Save } from 'lucide-react';

export default function SiteSettingsPage() {
  const { data: settings, isLoading } = useFooterSettings();
  const updateSettings = useUpdateFooterSettings();
  
  const [formData, setFormData] = useState<FooterSettings>({
    phone: '',
    email: '',
    address: '',
    postalCode: '',
    weekdayHours: '',
    weekendHours: '',
    brandName: '',
    brandTagline: '',
  });

  useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  const handleChange = (field: keyof FooterSettings, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    updateSettings.mutate(formData);
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl font-bold text-foreground">Webbplatsinställningar</h1>
            <p className="text-muted-foreground mt-1">Hantera footer och kontaktinformation</p>
          </div>
          <Button onClick={handleSave} disabled={updateSettings.isPending}>
            {updateSettings.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Spara ändringar
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="font-serif">Varumärke</CardTitle>
              <CardDescription>Namn och beskrivning som visas i footern</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="brandName">Organisationsnamn</Label>
                <Input
                  id="brandName"
                  value={formData.brandName}
                  onChange={(e) => handleChange('brandName', e.target.value)}
                  placeholder="Sophiahemmet"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brandTagline">Beskrivning</Label>
                <Textarea
                  id="brandTagline"
                  value={formData.brandTagline}
                  onChange={(e) => handleChange('brandTagline', e.target.value)}
                  placeholder="Kvalitetsvård med patienten i fokus..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-serif">Kontaktuppgifter</CardTitle>
              <CardDescription>Telefon, e-post och adress</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Telefonnummer</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="08-688 40 00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">E-postadress</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="info@sophiahemmet.se"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Gatuadress</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                  placeholder="Valhallavägen 91"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="postalCode">Postnummer och ort</Label>
                <Input
                  id="postalCode"
                  value={formData.postalCode}
                  onChange={(e) => handleChange('postalCode', e.target.value)}
                  placeholder="114 28 Stockholm"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="font-serif">Öppettider</CardTitle>
              <CardDescription>Tider som visas i footern</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="weekdayHours">Vardagar (mån–fre)</Label>
                <Input
                  id="weekdayHours"
                  value={formData.weekdayHours}
                  onChange={(e) => handleChange('weekdayHours', e.target.value)}
                  placeholder="08:00–17:00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weekendHours">Helger (lör–sön)</Label>
                <Input
                  id="weekendHours"
                  value={formData.weekendHours}
                  onChange={(e) => handleChange('weekendHours', e.target.value)}
                  placeholder="Stängt"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
