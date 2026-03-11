import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Building2, User, Loader2, Check, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ProfileData {
  [key: string]: unknown;
}

interface CompanyProfileData extends ProfileData {
  company_name?: string;
  value_proposition?: string;
  icp?: string;
  differentiators?: string;
  competitors?: string;
  pricing_notes?: string;
  industry?: string;
}

interface UserProfileData extends ProfileData {
  full_name?: string;
  title?: string;
  email?: string;
  personal_pitch?: string;
  tone?: string;
  signature?: string;
}

const COMPANY_FIELDS = [
  { key: 'company_name', label: 'Company Name', type: 'input' },
  { key: 'industry', label: 'Industry', type: 'input' },
  { key: 'value_proposition', label: 'Value Proposition', type: 'textarea' },
  { key: 'icp', label: 'Ideal Customer Profile', type: 'textarea' },
  { key: 'differentiators', label: 'Key Differentiators', type: 'textarea' },
  { key: 'competitors', label: 'Competitors', type: 'input' },
  { key: 'pricing_notes', label: 'Pricing Strategy', type: 'textarea' },
] as const;

const USER_FIELDS = [
  { key: 'full_name', label: 'Your Name', type: 'input' },
  { key: 'title', label: 'Title / Role', type: 'input' },
  { key: 'email', label: 'Email', type: 'input' },
  { key: 'personal_pitch', label: 'Personal Pitch', type: 'textarea' },
  { key: 'tone', label: 'Preferred Tone', type: 'input' },
  { key: 'signature', label: 'Email Signature', type: 'textarea' },
] as const;

export function SalesProfileSetup() {
  const [companyData, setCompanyData] = useState<CompanyProfileData>({});
  const [userData, setUserData] = useState<UserProfileData>({});
  const [loading, setLoading] = useState(true);
  const [savingCompany, setSavingCompany] = useState(false);
  const [savingUser, setSavingUser] = useState(false);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('sales_intelligence_profiles' as any)
        .select('type, data')
        .in('type', ['company', 'user']);

      if (data) {
        for (const row of data as any[]) {
          if (row.type === 'company') setCompanyData(row.data || {});
          if (row.type === 'user') setUserData(row.data || {});
        }
      }
    } catch (e) {
      console.error('Failed to load profiles:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProfiles(); }, [loadProfiles]);

  const saveProfile = async (type: 'company' | 'user') => {
    const setter = type === 'company' ? setSavingCompany : setSavingUser;
    const data = type === 'company' ? companyData : userData;
    setter(true);

    try {
      const { error } = await supabase.functions.invoke('sales-profile-setup', {
        body: { type, data },
      });
      if (error) throw error;
      toast.success(`${type === 'company' ? 'Company' : 'User'} profile saved`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setter(false);
    }
  };

  const getCompletionScore = (data: ProfileData, fields: readonly { key: string }[]) => {
    const filled = fields.filter(f => {
      const val = data[f.key];
      return val && String(val).trim().length > 0;
    }).length;
    return Math.round((filled / fields.length) * 100);
  };

  const companyScore = getCompletionScore(companyData, COMPANY_FIELDS);
  const userScore = getCompletionScore(userData, USER_FIELDS);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading profiles...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Company Profile */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Company Profile
            </CardTitle>
            <CompletionBadge score={companyScore} />
          </div>
          <CardDescription>
            Shared business context used by AI for prospect research and fit analysis
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {COMPANY_FIELDS.map(field => (
            <div key={field.key} className="space-y-1">
              <Label className="text-xs font-medium">{field.label}</Label>
              {field.type === 'textarea' ? (
                <Textarea
                  value={String(companyData[field.key] || '')}
                  onChange={e => setCompanyData(prev => ({ ...prev, [field.key]: e.target.value }))}
                  rows={2}
                  className="text-sm"
                />
              ) : (
                <Input
                  value={String(companyData[field.key] || '')}
                  onChange={e => setCompanyData(prev => ({ ...prev, [field.key]: e.target.value }))}
                  className="text-sm"
                />
              )}
            </div>
          ))}
          <Button
            onClick={() => saveProfile('company')}
            disabled={savingCompany}
            size="sm"
            className="w-full gap-2"
          >
            {savingCompany ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Save Company Profile
          </Button>
        </CardContent>
      </Card>

      {/* User Profile */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              Your Sales Profile
            </CardTitle>
            <CompletionBadge score={userScore} />
          </div>
          <CardDescription>
            Personal context for personalized introduction letters and outreach
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {USER_FIELDS.map(field => (
            <div key={field.key} className="space-y-1">
              <Label className="text-xs font-medium">{field.label}</Label>
              {field.type === 'textarea' ? (
                <Textarea
                  value={String(userData[field.key] || '')}
                  onChange={e => setUserData(prev => ({ ...prev, [field.key]: e.target.value }))}
                  rows={2}
                  className="text-sm"
                />
              ) : (
                <Input
                  value={String(userData[field.key] || '')}
                  onChange={e => setUserData(prev => ({ ...prev, [field.key]: e.target.value }))}
                  className="text-sm"
                />
              )}
            </div>
          ))}
          <Button
            onClick={() => saveProfile('user')}
            disabled={savingUser}
            size="sm"
            className="w-full gap-2"
          >
            {savingUser ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Save User Profile
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function CompletionBadge({ score }: { score: number }) {
  if (score === 100) return <Badge variant="default" className="gap-1"><Check className="h-3 w-3" /> Complete</Badge>;
  if (score > 0) return <Badge variant="secondary" className="gap-1">{score}%</Badge>;
  return <Badge variant="outline" className="gap-1 text-muted-foreground"><AlertCircle className="h-3 w-3" /> Not configured</Badge>;
}
