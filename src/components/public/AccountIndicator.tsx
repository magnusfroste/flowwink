import { Link } from 'react-router-dom';
import { User } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

export function AccountIndicator() {
  const { user } = useAuth();

  return (
    <Link
      to={user ? '/account' : '/account/login'}
      className={cn(
        'relative inline-flex items-center justify-center rounded-md p-2 transition-colors',
        'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
      aria-label={user ? 'My Account' : 'Sign in'}
    >
      <User className="h-5 w-5" />
      {user && (
        <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-primary border-2 border-card" />
      )}
    </Link>
  );
}
