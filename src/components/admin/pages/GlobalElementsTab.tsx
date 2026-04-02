import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FooterBlockEditor } from '@/components/admin/blocks/FooterBlockEditor';
import { HeaderBlockEditor } from '@/components/admin/blocks/HeaderBlockEditor';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, Loader2, Eye, Navigation, LayoutGrid } from 'lucide-react';
import {
  useFooterBlock,
  useUpdateFooterBlock,
  defaultFooterData,
  useHeaderBlock,
  useUpdateHeaderBlock,
  defaultHeaderData,
} from '@/hooks/useGlobalBlocks';
import type { FooterBlockData, HeaderBlockData } from '@/types/cms';

export default function GlobalElementsTab() {
  const { data: footerBlock, isLoading: footerLoading } = useFooterBlock();
  const updateFooter = useUpdateFooterBlock();
  const [footerData, setFooterData] = useState<FooterBlockData>(defaultFooterData);
  const [hasFooterChanges, setHasFooterChanges] = useState(false);

  const { data: headerBlock, isLoading: headerLoading } = useHeaderBlock();
  const updateHeader = useUpdateHeaderBlock();
  const [headerData, setHeaderData] = useState<HeaderBlockData>(defaultHeaderData);
  const [hasHeaderChanges, setHasHeaderChanges] = useState(false);

  useEffect(() => {
    if (footerBlock?.data) {
      setFooterData({ ...defaultFooterData, ...footerBlock.data });
      setHasFooterChanges(false);
    }
  }, [footerBlock]);

  useEffect(() => {
    if (headerBlock?.data) {
      setHeaderData({ ...defaultHeaderData, ...headerBlock.data });
      setHasHeaderChanges(false);
    }
  }, [headerBlock]);

  const handleFooterChange = (data: FooterBlockData) => {
    setFooterData(data);
    setHasFooterChanges(true);
  };

  const handleHeaderChange = (data: HeaderBlockData) => {
    setHeaderData(data);
    setHasHeaderChanges(true);
  };

  const handleSaveFooter = async () => {
    await updateFooter.mutateAsync(footerData);
    setHasFooterChanges(false);
  };

  const handleSaveHeader = async () => {
    await updateHeader.mutateAsync(headerData);
    setHasHeaderChanges(false);
  };

  const hasChanges = hasFooterChanges || hasHeaderChanges;
  const isLoading = footerLoading || headerLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="header">
        <TabsList>
          <TabsTrigger value="header" className="gap-1.5">
            <Navigation className="h-3.5 w-3.5" />
            Header
          </TabsTrigger>
          <TabsTrigger value="footer" className="gap-1.5">
            <LayoutGrid className="h-3.5 w-3.5" />
            Footer
          </TabsTrigger>
        </TabsList>

        <TabsContent value="header" className="mt-6">
          <div className="bg-card rounded-lg border p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold">Header</h2>
                <p className="text-sm text-muted-foreground">
                  Configure the header navigation on all public pages
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => window.open('/', '_blank')}>
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </Button>
            </div>
            <HeaderBlockEditor data={headerData} onChange={handleHeaderChange} />
          </div>
        </TabsContent>

        <TabsContent value="footer" className="mt-6">
          <div className="bg-card rounded-lg border p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold">Footer</h2>
                <p className="text-sm text-muted-foreground">
                  Configure the footer that appears on all public pages
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => window.open('/', '_blank')}>
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </Button>
            </div>
            <FooterBlockEditor data={footerData} onChange={handleFooterChange} />
          </div>
        </TabsContent>
      </Tabs>

      {hasChanges && (
        <div className="sticky bottom-0 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 px-6 py-4 -mx-6 -mb-6 rounded-b-lg">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">You have unsaved changes</p>
            <div className="flex gap-2">
              {hasHeaderChanges && (
                <Button onClick={handleSaveHeader} disabled={updateHeader.isPending} size="sm">
                  {updateHeader.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Header
                </Button>
              )}
              {hasFooterChanges && (
                <Button onClick={handleSaveFooter} disabled={updateFooter.isPending} size="sm">
                  {updateFooter.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Footer
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
