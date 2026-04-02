import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';

const LazyBrandingContent = lazy(() =>
  import('@/pages/admin/BrandingSettingsPage').then(mod => ({
    default: mod.BrandingSettingsContent,
  }))
);

export default function BrandingTab() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <LazyBrandingContent embedded />
    </Suspense>
  );
}
