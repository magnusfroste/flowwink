import { Link } from 'react-router-dom';
import { 
  Bot,
  LayoutTemplate,
  FileText,
  ArrowRight,
  Sparkles,
  Zap,
  Palette,
  Shield,
  Settings
} from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { STARTER_TEMPLATES } from '@/data/starter-templates';
import { useIsAIConfigured } from '@/hooks/useIntegrationStatus';

export default function QuickStartPage() {
  const isAIConfigured = useIsAIConfigured();

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto">
        <AdminPageHeader
          title="Create your site"
          description="Choose how you want to get started"
        />

        <div className="grid gap-6">
          {isAIConfigured ? (
            <>
              {/* AI Configured: Copilot First */}
              <CopilotCard isPrimary isAIConfigured />
              <TemplatesCard isPrimary={false} />
              <BlankCard />
            </>
          ) : (
            <>
              {/* AI Not Configured: Templates First */}
              <TemplatesCard isPrimary />
              <CopilotCard isPrimary={false} isAIConfigured={false} />
              <BlankCard />
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

function CopilotCard({ isPrimary, isAIConfigured }: { isPrimary: boolean; isAIConfigured: boolean }) {
  const linkTo = isAIConfigured ? '/admin/copilot' : '/admin/integrations#ai';
  
  return (
    <Link to={linkTo} className="block group">
      <Card className={`relative overflow-hidden transition-all hover:shadow-xl ${
        isPrimary 
          ? 'border-2 border-primary/20 hover:border-primary/50' 
          : 'hover:border-muted-foreground/50 hover:shadow-lg'
      }`}>
        {isPrimary && (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-primary/10 to-transparent" />
        )}
        <CardContent className="relative p-8">
          <div className="flex items-start gap-6">
            <div className={`p-4 rounded-2xl shrink-0 ${isPrimary ? 'bg-primary/10' : 'bg-muted'}`}>
              <Bot className={`h-8 w-8 ${isPrimary ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h2 className="text-2xl font-semibold">Copilot</h2>
                {isPrimary && isAIConfigured && (
                  <Badge className="bg-primary/20 text-primary border-0">Recommended</Badge>
                )}
                {!isAIConfigured && (
                  <Badge variant="outline" className="border-amber-500 text-amber-600">
                    Setup required
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground text-lg mb-4">
                {isAIConfigured 
                  ? 'Describe your business in plain language. AI builds your pages and activates the right modules.'
                  : 'Describe your business in plain language. Requires OpenAI or Gemini API key.'
                }
              </p>
              <div className="flex items-center gap-6 text-sm text-muted-foreground flex-wrap">
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  AI-powered
                </span>
                <span className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Fastest setup
                </span>
                <span className="flex items-center gap-2">
                  <Palette className="h-4 w-4" />
                  Full customization
                </span>
              </div>
            </div>
            <div className="shrink-0 self-center">
              <div className={`p-3 rounded-full transition-colors ${
                isPrimary 
                  ? 'bg-primary/10 group-hover:bg-primary/20' 
                  : 'bg-muted group-hover:bg-muted/80'
              }`}>
                {isAIConfigured ? (
                  <ArrowRight className={`h-5 w-5 ${isPrimary ? 'text-primary' : 'text-muted-foreground'}`} />
                ) : (
                  <Settings className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function TemplatesCard({ isPrimary }: { isPrimary: boolean }) {
  return (
    <Link to="/admin/templates" className="block group">
      <Card className={`relative overflow-hidden transition-all hover:shadow-xl ${
        isPrimary 
          ? 'border-2 border-primary/20 hover:border-primary/50' 
          : 'hover:border-muted-foreground/50 hover:shadow-lg'
      }`}>
        {isPrimary && (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-primary/10 to-transparent" />
        )}
        <CardContent className="relative p-8">
          <div className="flex items-start gap-6">
            <div className={`p-4 rounded-2xl shrink-0 ${isPrimary ? 'bg-primary/10' : 'bg-muted'}`}>
              <LayoutTemplate className={`h-8 w-8 ${isPrimary ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h2 className="text-2xl font-semibold">Templates</h2>
                {isPrimary && (
                  <Badge className="bg-primary/20 text-primary border-0">Recommended</Badge>
                )}
                <Badge variant="secondary">{STARTER_TEMPLATES.length} ready</Badge>
              </div>
              <p className="text-muted-foreground text-lg mb-4">
                Pick a professionally designed template. What you see is what you get.
              </p>
              <div className="flex items-center gap-6 text-sm text-muted-foreground flex-wrap">
                <span className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Multi-page sites
                </span>
                <span className="flex items-center gap-2">
                  <Palette className="h-4 w-4" />
                  Pre-configured branding
                </span>
                <span className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Works immediately
                </span>
              </div>
            </div>
            <div className="shrink-0 self-center">
              <div className={`p-3 rounded-full transition-colors ${
                isPrimary 
                  ? 'bg-primary/10 group-hover:bg-primary/20' 
                  : 'bg-muted group-hover:bg-muted/80'
              }`}>
                <ArrowRight className={`h-5 w-5 ${isPrimary ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function BlankCard() {
  return (
    <Link to="/admin/pages/new" className="block group">
      <Card className="relative overflow-hidden hover:border-muted-foreground/50 transition-all hover:shadow-lg">
        <CardContent className="p-8">
          <div className="flex items-start gap-6">
            <div className="p-4 rounded-2xl bg-muted shrink-0">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-2xl font-semibold">Start blank</h2>
              </div>
              <p className="text-muted-foreground text-lg mb-4">
                Build from scratch with full control. Add blocks one by one.
              </p>
              <div className="flex items-center gap-6 text-sm text-muted-foreground flex-wrap">
                <span className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Full control
                </span>
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  35+ block types
                </span>
              </div>
            </div>
            <div className="shrink-0 self-center">
              <div className="p-3 rounded-full bg-muted group-hover:bg-muted/80 transition-colors">
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
