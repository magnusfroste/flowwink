import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { FooterBlockEditor } from '@/components/admin/blocks/FooterBlockEditor';
import { useFooterBlock, useUpdateFooterBlock, defaultFooterData } from '@/hooks/useGlobalBlocks';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Save, Loader2, Eye, LayoutGrid } from 'lucide-react';
import { FooterBlockData } from '@/types/cms';

export default function GlobalBlocksPage() {
  const navigate = useNavigate();
  const { loading: authLoading, user, isAdmin } = useAuth();
  const { data: footerBlock, isLoading: footerLoading } = useFooterBlock();
  const updateFooter = useUpdateFooterBlock();
  
  const [footerData, setFooterData] = useState<FooterBlockData>(defaultFooterData);
  const [hasChanges, setHasChanges] = useState(false);

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
      setHasChanges(false);
    }
  }, [footerBlock]);

  const handleFooterChange = (data: FooterBlockData) => {
    setFooterData(data);
    setHasChanges(true);
  };

  const handleSave = async () => {
    await updateFooter.mutateAsync(footerData);
    setHasChanges(false);
  };

  if (authLoading || footerLoading) {
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
          <div className="max-w-5xl mx-auto space-y-8">
            {/* Footer Section */}
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
          </div>
        </div>

        {/* Sticky save bar */}
        {hasChanges && (
          <div className="shrink-0 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 px-6 py-4">
            <div className="max-w-5xl mx-auto flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                You have unsaved changes
              </p>
              <Button
                onClick={handleSave}
                disabled={updateFooter.isPending}
              >
                {updateFooter.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
