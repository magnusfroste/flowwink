import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FooterBlockEditor } from '@/components/admin/blocks/FooterBlockEditor';
import { Save, Loader2, Eye } from 'lucide-react';
import { useFooterBlock, useUpdateFooterBlock, defaultFooterData } from '@/hooks/useGlobalBlocks';
import type { FooterBlockData } from '@/types/cms';

export default function FooterTab() {
  const { data: footerBlock, isLoading } = useFooterBlock();
  const updateFooter = useUpdateFooterBlock();
  const [footerData, setFooterData] = useState<FooterBlockData>(defaultFooterData);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (footerBlock?.data) {
      setFooterData({ ...defaultFooterData, ...footerBlock.data });
      setHasChanges(false);
    }
  }, [footerBlock]);

  const handleSave = async () => {
    await updateFooter.mutateAsync(footerData);
    setHasChanges(false);
  };

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-lg border p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold">Footer</h2>
            <p className="text-sm text-muted-foreground">Configure the footer that appears on all public pages</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.open('/', '_blank')}>
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Button>
            {hasChanges && (
              <Button onClick={handleSave} disabled={updateFooter.isPending} size="sm">
                {updateFooter.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save
              </Button>
            )}
          </div>
        </div>
        <FooterBlockEditor data={footerData} onChange={(data) => { setFooterData(data); setHasChanges(true); }} />
      </div>
    </div>
  );
}
