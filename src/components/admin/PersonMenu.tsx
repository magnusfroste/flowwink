import { Link } from 'react-router-dom';
import { LogOut, GitCommit } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useEmployeeSelf } from '@/hooks/useEmployeeSelf';
import { ROLE_LABELS } from '@/types/cms';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import packageJson from '../../../package.json';
import { PERSON_MENU_LINKS, MY_EMPLOYMENT_LINK } from '@/lib/person-menu';

const GIT_COMMIT = typeof __GIT_COMMIT__ !== 'undefined' ? __GIT_COMMIT__ : '';
const CHANGELOG_URL = 'https://github.com/magnusfroste/flowwink/blob/main/CHANGELOG.md';


/**
 * The person menu — one, top right (2026-11-01). It used to exist twice (the
 * avatar and the sidebar's user card opened two copies) and Profile a third
 * time in the sidebar's Main group.
 */
export function PersonMenu() {
  const { profile, role, signOut } = useAuth();
  const { isEmployee } = useEmployeeSelf();
  const initials = profile?.full_name?.charAt(0)?.toUpperCase() || profile?.email?.charAt(0)?.toUpperCase() || '?';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Your account">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-[11px] font-medium bg-muted text-muted-foreground">{initials}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">{profile?.full_name || 'User'}</p>
            <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
            {role && <p className="text-xs text-muted-foreground">{ROLE_LABELS[role]}</p>}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {PERSON_MENU_LINKS.map(({ to, label, icon: Icon }) => (
          <DropdownMenuItem key={to} asChild>
            <Link to={to} className="cursor-pointer"><Icon className="mr-2 h-4 w-4" />{label}</Link>
          </DropdownMenuItem>
        ))}
        {isEmployee && (
          <DropdownMenuItem asChild>
            <Link to={MY_EMPLOYMENT_LINK.to} className="cursor-pointer">
              <MY_EMPLOYMENT_LINK.icon className="mr-2 h-4 w-4" />
              <span className="flex-1">{MY_EMPLOYMENT_LINK.label}</span>
              <span className="text-[10px] text-muted-foreground">leave · payslips</span>
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={CHANGELOG_URL} target="_blank" rel="noopener noreferrer" className="cursor-pointer text-xs text-muted-foreground">
            <GitCommit className="mr-2 h-4 w-4" />
            v{packageJson.version}{GIT_COMMIT && GIT_COMMIT !== 'unknown' ? ` · ${GIT_COMMIT}` : ''}
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive cursor-pointer">
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
