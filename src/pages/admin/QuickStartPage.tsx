import { Link } from 'react-router-dom';
import { 
  Bot,
  LayoutTemplate,
  FileText,
  ArrowRight,
  Sparkles,
  Zap,
  Palette,
  Shield
} from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { STARTER_TEMPLATES } from '@/data/starter-templates';

export default function QuickStartPage() {
  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto">
        <AdminPageHeader
          title="Create your site"
          description="Choose how you want to get started"
        />

        {/* Three clear paths */}
        <div className="grid gap-6">
          {/* Copilot - Primary */}
          <Link to="/admin/copilot" className="block group">
            <Card className="relative overflow-hidden border-2 border-primary/20 hover:border-primary/50 transition-all hover:shadow-xl">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-primary/10 to-transparent" />
              <CardContent className="relative p-8">
                <div className="flex items-start gap-6">
                  <div className="p-4 rounded-2xl bg-primary/10 shrink-0">
                    <Bot className="h-8 w-8 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-2xl font-semibold">Copilot</h2>
                      <Badge className="bg-primary/20 text-primary border-0">Recommended</Badge>
                    </div>
                    <p className="text-muted-foreground text-lg mb-4">
                      Describe your business in plain language. AI builds your pages and activates the right modules.
                    </p>
                    <div className="flex items-center gap-6 text-sm text-muted-foreground">
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
                    <div className="p-3 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
                      <ArrowRight className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Templates - Secondary */}
          <Link to="/admin/templates" className="block group">
            <Card className="relative overflow-hidden hover:border-muted-foreground/50 transition-all hover:shadow-lg">
              <CardContent className="p-8">
                <div className="flex items-start gap-6">
                  <div className="p-4 rounded-2xl bg-muted shrink-0">
                    <LayoutTemplate className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-2xl font-semibold">Templates</h2>
                      <Badge variant="secondary">{STARTER_TEMPLATES.length} ready</Badge>
                    </div>
                    <p className="text-muted-foreground text-lg mb-4">
                      Pick a professionally designed template. What you see is what you get.
                    </p>
                    <div className="flex items-center gap-6 text-sm text-muted-foreground">
                      <span className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        Multi-page sites
                      </span>
                      <span className="flex items-center gap-2">
                        <Palette className="h-4 w-4" />
                        Pre-configured branding
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

          {/* Blank - Tertiary */}
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
                    <div className="flex items-center gap-6 text-sm text-muted-foreground">
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
        </div>
      </div>
    </AdminLayout>
  );
}
