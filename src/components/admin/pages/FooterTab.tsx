import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Skeleton className="h-96 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="font-serif">Footer</CardTitle>
            <CardDescription>Configure the footer that appears on all public pages</CardDescription>
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
      </CardHeader>
      <CardContent>
        <FooterBlockEditor data={footerData} onChange={(data) => { setFooterData(data); setHasChanges(true); }} />
      </CardContent>
    </Card>
  );
}
