import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Loader2, ArrowLeft, Eye } from 'lucide-react';
import { BlockRenderer } from '@/components/public/BlockRenderer';
import { PublicNavigation } from '@/components/public/PublicNavigation';
import { PublicFooter } from '@/components/public/PublicFooter';
import { SeoHead } from '@/components/public/SeoHead';
import { Button } from '@/components/ui/button';
import { ContentBlock, PageMeta } from '@/types/cms';

interface PreviewData {
  id: string;
  slug: string;
  title: string;
  content_json: ContentBlock[];
  meta_json: PageMeta;
  savedAt: string;
}

const PREVIEW_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

export default function PreviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setError('Inget sid-ID angivet');
      setIsLoading(false);
      return;
    }

    const storageKey = `preview-${id}`;
    const stored = sessionStorage.getItem(storageKey);

    if (!stored) {
      setError('Ingen förhandsgranskningsdata hittades. Öppna förhandsgranskning från editorn.');
      setIsLoading(false);
      return;
    }

    try {
      const data: PreviewData = JSON.parse(stored);
      const savedAt = new Date(data.savedAt).getTime();
      const now = Date.now();

      if (now - savedAt > PREVIEW_EXPIRY_MS) {
        sessionStorage.removeItem(storageKey);
        setError('Förhandsgranskningsdata har gått ut. Öppna förhandsgranskning från editorn igen.');
        setIsLoading(false);
        return;
      }

      setPreviewData(data);
    } catch {
      setError('Kunde inte läsa förhandsgranskningsdata');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !previewData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-8">
        <div className="text-center max-w-md">
          <Eye className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-serif font-bold mb-2">Förhandsgranskning ej tillgänglig</h1>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Button onClick={() => navigate(`/admin/pages/${id}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Tillbaka till editorn
          </Button>
        </div>
      </div>
    );
  }

  const showTitle = previewData.meta_json?.showTitle !== false;
  const titleAlignment = previewData.meta_json?.titleAlignment || 'left';

  return (
    <>
      <SeoHead
        title={previewData.meta_json?.seoTitle || previewData.title}
        description={previewData.meta_json?.description}
        noIndex={true}
      />
      
      {/* Preview Banner */}
      <div className="sticky top-0 z-50 bg-amber-500 text-amber-950 py-2 px-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            <span className="font-medium text-sm">FÖRHANDSGRANSKNING</span>
            <span className="text-sm opacity-80">– Denna sida är inte publicerad</span>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate(`/admin/pages/${id}`)}
            className="text-amber-950 hover:bg-amber-600 hover:text-amber-950"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Tillbaka till editor
          </Button>
        </div>
      </div>

      <PublicNavigation />
      
      <main className="min-h-screen">
        {showTitle && (
          <div className="max-w-4xl mx-auto px-6 pt-12">
            <h1 
              className={`text-4xl md:text-5xl font-serif font-bold text-foreground ${
                titleAlignment === 'center' ? 'text-center' : 'text-left'
              }`}
            >
              {previewData.title}
            </h1>
          </div>
        )}
        
        {(previewData.content_json || []).map((block) => (
          <BlockRenderer key={block.id} block={block} pageId={previewData.id} />
        ))}
      </main>

      <PublicFooter />
    </>
  );
}
