import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { FooterBlockEditor } from '@/components/admin/blocks/FooterBlockEditor';
import { HeaderBlockEditor } from '@/components/admin/blocks/HeaderBlockEditor';
import { 
  useFooterBlock, 
  useUpdateFooterBlock, 
  defaultFooterData,
  useHeaderBlock,
  useUpdateHeaderBlock,
  defaultHeaderData,
} from '@/hooks/useGlobalBlocks';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, Loader2, Eye, LayoutGrid, Navigation } from 'lucide-react';
import { FooterBlockData, HeaderBlockData } from '@/types/cms';

export default function GlobalBlocksPage() {
  const navigate = useNavigate();
  const { loading: authLoading, user, isAdmin } = useAuth();
  
  // Footer
  const { data: footerBlock, isLoading: footerLoading } = useFooterBlock();
  const updateFooter = useUpdateFooterBlock();
  const [footerData, setFooterData] = useState<FooterBlockData>(defaultFooterData);
  const [hasFooterChanges, setHasFooterChanges] = useState(false);

  // Header
  const { data: headerBlock, isLoading: headerLoading } = useHeaderBlock();
  const updateHeader = useUpdateHeaderBlock();
  const [headerData, setHeaderData] = useState<HeaderBlockData>(defaultHeaderData);
  const [hasHeaderChanges, setHasHeaderChanges] = useState(false);

  // Redirect if not authenticated or not admin
  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        navigate('/auth');
      } else if (!isAdmin) {
        navigate('/admin');
      }
    }
  }, [authLoading, user, isAdmin, navigate]);

  // Initialize footer data when loaded
  useEffect(() => {
    if (footerBlock?.data) {
      setFooterData({ ...defaultFooterData, ...footerBlock.data });
      setHasFooterChanges(false);
    }
  }, [footerBlock]);

  // Initialize header data when loaded
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

  if (authLoading || isLoading) {
    return (
      <AdminLayout>
        <div className="p-6 max-w-5xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="flex-1 flex flex-col min-h-0">
        <AdminPageHeader
          title="Global Elements"
          description="Manage reusable elements that appear across all pages"
        />

        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-5xl mx-auto">
            <Tabs defaultValue="header" className="space-y-6">
              <TabsList>
                <TabsTrigger value="header" className="gap-2">
                  <Navigation className="h-4 w-4" />
                  Header
                </TabsTrigger>
                <TabsTrigger value="footer" className="gap-2">
                  <LayoutGrid className="h-4 w-4" />
                  Footer
                </TabsTrigger>
              </TabsList>

              {/* Header Tab */}
              <TabsContent value="header" className="space-y-6">
                <div className="bg-card rounded-lg border p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Navigation className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold">Header</h2>
                        <p className="text-sm text-muted-foreground">
                          Configure the header navigation on all public pages
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open('/', '_blank')}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Preview
                    </Button>
                  </div>

                  <HeaderBlockEditor
                    data={headerData}
                    onChange={handleHeaderChange}
                  />
                </div>
              </TabsContent>

              {/* Footer Tab */}
              <TabsContent value="footer" className="space-y-6">
                <div className="bg-card rounded-lg border p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <LayoutGrid className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold">Footer</h2>
                        <p className="text-sm text-muted-foreground">
                          Configure the footer that appears on all public pages
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open('/', '_blank')}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Preview
                    </Button>
                  </div>

                  <FooterBlockEditor
                    data={footerData}
                    onChange={handleFooterChange}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Sticky save bar */}
        {hasChanges && (
          <div className="shrink-0 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 px-6 py-4">
            <div className="max-w-5xl mx-auto flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                You have unsaved changes
              </p>
              <div className="flex gap-2">
                {hasHeaderChanges && (
                  <Button
                    onClick={handleSaveHeader}
                    disabled={updateHeader.isPending}
                  >
                    {updateHeader.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving Header...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Header
                      </>
                    )}
                  </Button>
                )}
                {hasFooterChanges && (
                  <Button
                    onClick={handleSaveFooter}
                    disabled={updateFooter.isPending}
                  >
                    {updateFooter.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving Footer...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Footer
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

