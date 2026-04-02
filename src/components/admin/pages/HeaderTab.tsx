import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { HeaderBlockEditor } from '@/components/admin/blocks/HeaderBlockEditor';
import { Save, Loader2, Eye } from 'lucide-react';
import { useHeaderBlock, useUpdateHeaderBlock, defaultHeaderData } from '@/hooks/useGlobalBlocks';
import type { HeaderBlockData } from '@/types/cms';

export default function HeaderTab() {
  const { data: headerBlock, isLoading } = useHeaderBlock();
  const updateHeader = useUpdateHeaderBlock();
  const [headerData, setHeaderData] = useState<HeaderBlockData>(defaultHeaderData);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (headerBlock?.data) {
      setHeaderData({ ...defaultHeaderData, ...headerBlock.data });
      setHasChanges(false);
    }
  }, [headerBlock]);

  const handleSave = async () => {
    await updateHeader.mutateAsync(headerData);
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
            <CardTitle className="font-serif">Header</CardTitle>
            <CardDescription>Configure the header navigation on all public pages</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.open('/', '_blank')}>
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Button>
            {hasChanges && (
              <Button onClick={handleSave} disabled={updateHeader.isPending} size="sm">
                {updateHeader.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <HeaderBlockEditor data={headerData} onChange={(data) => { setHeaderData(data); setHasChanges(true); }} />
      </CardContent>
    </Card>
  );
}
