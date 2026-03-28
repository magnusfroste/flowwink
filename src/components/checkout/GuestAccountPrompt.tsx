import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { UserPlus, CheckCircle, Loader2 } from 'lucide-react';

interface GuestAccountPromptProps {
  email: string;
  name: string | null;
}

export function GuestAccountPrompt({ email, name }: GuestAccountPromptProps) {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [created, setCreated] = useState(false);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name || email.split('@')[0],
            signup_type: 'customer',
          },
        },
      });

      if (error) throw error;

      setCreated(true);
      toast.success('Account created! Check your email to verify.');
    } catch (err: any) {
      toast.error(err.message || 'Could not create account');
    } finally {
      setIsLoading(false);
    }
  };

  if (created) {
    return (
      <Card className="border-green-500/20 bg-green-500/5">
        <CardContent className="pt-6 text-center space-y-2">
          <CheckCircle className="h-8 w-8 mx-auto text-green-500" />
          <p className="font-medium">Account created!</p>
          <p className="text-sm text-muted-foreground">
            Check <span className="font-medium">{email}</span> to verify your account and track future orders.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <UserPlus className="h-4 w-4" />
          Create an account
        </CardTitle>
        <CardDescription>
          Save your order history and get faster checkout next time.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleCreateAccount} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="guest-email" className="text-xs">Email</Label>
            <Input
              id="guest-email"
              value={email}
              disabled
              className="bg-muted/50 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="guest-password" className="text-xs">Choose a password</Label>
            <Input
              id="guest-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 6 characters"
              minLength={6}
              required
              disabled={isLoading}
            />
          </div>
          <Button type="submit" className="w-full" size="sm" disabled={isLoading}>
            {isLoading ? (
              <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Creating...</>
            ) : (
              <><UserPlus className="h-3 w-3 mr-1" /> Create Account</>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
