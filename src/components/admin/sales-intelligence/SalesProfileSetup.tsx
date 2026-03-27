import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { User, Loader2, Check, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface UserProfileData {
  [key: string]: unknown;
  full_name?: string;
  title?: string;
  email?: string;
  personal_pitch?: string;
  tone?: string;
  signature?: string;
}

const USER_FIELDS = [
  { key: 'full_name', label: 'Your Name', type: 'input', placeholder: 'e.g. Anna Lindberg' },
  { key: 'title', label: 'Title / Role', type: 'input', placeholder: 'e.g. Head of Partnerships' },
  { key: 'email', label: 'Email', type: 'input', placeholder: 'e.g. anna@yourcompany.com' },
  { key: 'personal_pitch', label: 'Personal Pitch', type: 'textarea', placeholder: 'e.g. I help growing agencies streamline their digital operations with AI-powered tools — reducing manual work by 40% on average.' },
  { key: 'tone', label: 'Preferred Tone', type: 'input', placeholder: 'e.g. Professional but friendly, solution-oriented' },
  { key: 'signature', label: 'Email Signature', type: 'textarea', placeholder: 'e.g. Best regards,\nAnna Lindberg\nHead of Partnerships | YourCompany\n+46 70 123 45 67' },
] as const;

export function SalesProfileSetup() {
  const [userData, setUserData] = useState<UserProfileData>({});
  const [loading, setLoading] = useState(true);
  const [savingUser, setSavingUser] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('sales_intelligence_profiles' as any)
        .select('type, data')
        .eq('type', 'user');

      if (data) {
        for (const row of data as any[]) {
          if (row.type === 'user') setUserData(row.data || {});
        }
      }
    } catch (e) {
      console.error('Failed to load profile:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const saveProfile = async () => {
    setSavingUser(true);
    try {
      const { error } = await supabase.functions.invoke('sales-profile-setup', {
        body: { type: 'user', data: userData },
      });
      if (error) throw error;
      toast.success('Sales profile saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingUser(false);
    }
  };

  const getCompletionScore = () => {
    const filled = USER_FIELDS.filter(f => {
      const val = userData[f.key];
      return val && String(val).trim().length > 0;
    }).length;
    return Math.round((filled / USER_FIELDS.length) * 100);
  };

  const userScore = getCompletionScore();

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading profile...
        </CardContent>
      </Card>
    );
  }

  return (
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
          onClick={saveProfile}
          disabled={savingUser}
          size="sm"
          className="w-full gap-2"
        >
          {savingUser ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Save Sales Profile
        </Button>
      </CardContent>
    </Card>
  );
}

function CompletionBadge({ score }: { score: number }) {
  if (score === 100) return <Badge variant="default" className="gap-1"><Check className="h-3 w-3" /> Complete</Badge>;
  if (score > 0) return <Badge variant="secondary" className="gap-1">{score}%</Badge>;
  return <Badge variant="outline" className="gap-1 text-muted-foreground"><AlertCircle className="h-3 w-3" /> Not configured</Badge>;
}
