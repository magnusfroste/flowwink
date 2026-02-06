import { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BackAction {
  label: string;
  onClick: () => void;
}

interface AdminPageHeaderProps {
  title: string;
  description?: string;
  children?: ReactNode; // For action buttons on the right
  backAction?: BackAction;
}

export function AdminPageHeader({ title, description, children, backAction }: AdminPageHeaderProps) {
  return (
    <div className="mb-8">
      {backAction && (
        <Button
          variant="ghost"
          size="sm"
          onClick={backAction.onClick}
          className="mb-4 -ml-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          {backAction.label}
        </Button>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-foreground">{title}</h1>
          {description && (
            <p className="text-muted-foreground mt-1">{description}</p>
          )}
        </div>
        {children && <div className="flex items-center gap-2">{children}</div>}
      </div>
    </div>
  );
}
