import { Link } from 'react-router-dom';
import { Sparkles, LayoutTemplate, FileText, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function EmptyDashboard() {
  return (
    <div className="py-8">
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
          <Sparkles className="h-8 w-8 text-primary" />
        </div>
        <h2 className="font-serif text-2xl font-bold mb-2">
          Let's build your website
        </h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Your site is ready for content. Choose how you'd like to get started.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
        {/* Copilot - Primary/Recommended */}
        <Card className="border-primary/50 bg-primary/5 relative overflow-hidden">
          <div className="absolute top-3 right-3">
            <span className="text-xs font-medium bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
              Recommended
            </span>
          </div>
          <CardHeader className="pb-3">
            <div className="p-3 rounded-lg bg-primary/10 w-fit mb-2">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="font-serif text-lg">AI Copilot</CardTitle>
            <CardDescription>
              Describe what you want and let AI build it for you
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              The fastest way to create a complete website. Just describe your vision.
            </p>
            <Button asChild className="w-full gap-2">
              <Link to="/admin/copilot">
                Start with Copilot
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Templates */}
        <Card>
          <CardHeader className="pb-3">
            <div className="p-3 rounded-lg bg-muted w-fit mb-2">
              <LayoutTemplate className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle className="font-serif text-lg">Templates</CardTitle>
            <CardDescription>
              Start with a pre-designed site template
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Professional layouts with pages, branding, and chat pre-configured.
            </p>
            <Button asChild variant="outline" className="w-full gap-2">
              <Link to="/admin/templates">
                Browse Templates
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Blank Page */}
        <Card>
          <CardHeader className="pb-3">
            <div className="p-3 rounded-lg bg-muted w-fit mb-2">
              <FileText className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle className="font-serif text-lg">Blank Page</CardTitle>
            <CardDescription>
              Start from scratch with full control
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Create pages manually using the block editor. Best for custom builds.
            </p>
            <Button asChild variant="outline" className="w-full gap-2">
              <Link to="/admin/pages/new">
                Create Page
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
