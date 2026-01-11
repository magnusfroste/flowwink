import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Rocket, 
  FileText, 
  Sparkles, 
  Palette, 
  MessageSquare, 
  Globe, 
  ChevronRight,
  CheckCircle2,
  Circle,
  Play,
  ArrowRight,
  Lightbulb,
  Shield,
  Wrench,
  LayoutTemplate,
  Bot
} from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { STARTER_TEMPLATES } from '@/data/starter-templates';

interface Step {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  action?: {
    label: string;
    href: string;
  };
  tips?: string[];
}

const MANUAL_STEPS: Step[] = [
  {
    id: 'create-page',
    title: 'Create your first page',
    description: 'Start from a blank document and build your page block by block.',
    icon: FileText,
    action: {
      label: 'Create new page',
      href: '/admin/pages/new',
    },
    tips: [
      'Start with a Hero block to capture visitor attention',
      'Use Features blocks to showcase your services',
      'End with a CTA block for conversion',
    ],
  },
  {
    id: 'customize-branding',
    title: 'Customize branding',
    description: 'Add your logo, colors, and fonts to make the site your own.',
    icon: Palette,
    action: {
      label: 'Configure branding',
      href: '/admin/branding',
    },
    tips: [
      'Upload logo in both light and dark variants',
      'Use "Analyze Brand" to import colors from your existing site',
      'Preview changes in real-time before saving',
    ],
  },
  {
    id: 'configure-chat',
    title: 'Configure AI Chat',
    description: 'Enable the private AI assistant with your knowledge base.',
    icon: MessageSquare,
    action: {
      label: 'AI Chat settings',
      href: '/admin/chat',
    },
    tips: [
      'Choose which published pages become part of the AI knowledge base',
      'Customize welcome messages and conversation starters',
    ],
  },
  {
    id: 'publish',
    title: 'Preview & Publish',
    description: 'Review your page in preview mode and then publish.',
    icon: Globe,
    action: {
      label: 'View pages',
      href: '/admin/pages',
    },
    tips: [
      'Use Preview to see exactly how visitors experience your page',
      'Published pages are automatically indexed (unless blocked)',
    ],
  },
];

const STORAGE_KEY = 'cms-quickstart-progress';

export default function QuickStartPage() {
  const [completedSteps, setCompletedSteps] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(completedSteps));
  }, [completedSteps]);

  const toggleStep = (stepId: string) => {
    setCompletedSteps(prev => 
      prev.includes(stepId) 
        ? prev.filter(id => id !== stepId)
        : [...prev, stepId]
    );
  };

  const progress = (completedSteps.length / MANUAL_STEPS.length) * 100;

  // Get template counts by category
  const templateCountsByCategory = STARTER_TEMPLATES.reduce((acc, t) => {
    acc[t.category] = (acc[t.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <AdminLayout>
      <AdminPageHeader
        title="Quick Start"
        description="Choose how you want to start building your site"
      />

      {/* Hero section with three paths */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        {/* Copilot path - NEW */}
        <Card className="relative overflow-hidden group hover:border-primary/50 transition-all hover:shadow-lg">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-primary/0" />
          <CardHeader className="relative">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 rounded-xl bg-primary/10">
                <Bot className="h-6 w-6 text-primary" />
              </div>
              <Badge className="text-xs">AI-driven</Badge>
            </div>
            <CardTitle className="text-xl">Copilot</CardTitle>
            <CardDescription className="text-base">
              Describe your business and AI will build pages and activate modules for you.
            </CardDescription>
          </CardHeader>
          <CardContent className="relative">
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge variant="outline">35+ blocks</Badge>
              <Badge variant="outline">16 modules</Badge>
              <Badge variant="outline">Conversation</Badge>
            </div>
            <Button asChild className="w-full group-hover:bg-primary/90">
              <Link to="/admin/copilot">
                <Sparkles className="h-4 w-4 mr-2" />
                Start Copilot
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Template path */}
        <Card className="relative overflow-hidden group hover:border-muted-foreground/30 transition-all">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 rounded-xl bg-muted">
                <LayoutTemplate className="h-6 w-6 text-muted-foreground" />
              </div>
              <Badge variant="secondary" className="text-xs">Recommended</Badge>
            </div>
            <CardTitle className="text-xl">Templates</CardTitle>
            <CardDescription className="text-base">
              Choose a professionally designed template with ready-made pages and branding.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge variant="outline">{STARTER_TEMPLATES.length} templates</Badge>
              <Badge variant="outline">Multi-page</Badge>
              <Badge variant="outline">AI chat</Badge>
            </div>
            <Button variant="outline" asChild className="w-full">
              <Link to="/admin/templates">
                <Sparkles className="h-4 w-4 mr-2" />
                Browse templates
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Manual path */}
        <Card className="relative overflow-hidden group hover:border-muted-foreground/30 transition-all">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 rounded-xl bg-muted">
                <Wrench className="h-6 w-6 text-muted-foreground" />
              </div>
            </div>
            <CardTitle className="text-xl">Build yourself</CardTitle>
            <CardDescription className="text-base">
              Create pages manually, step by step. Full control over every block.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge variant="outline">Full control</Badge>
              <Badge variant="outline">Block-by-block</Badge>
              <Badge variant="outline">Step guide</Badge>
            </div>
            <Button variant="outline" asChild className="w-full">
              <Link to="/admin/pages/new">
                <FileText className="h-4 w-4 mr-2" />
                Create blank page
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for detailed guides */}
      <Tabs defaultValue="templates" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="templates" className="gap-2">
            <Sparkles className="h-4 w-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="manual" className="gap-2">
            <Wrench className="h-4 w-4" />
            Manual setup
          </TabsTrigger>
        </TabsList>

        {/* Templates tab */}
        <TabsContent value="templates" className="space-y-6">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {STARTER_TEMPLATES.slice(0, 6).map((template) => {
              const pageCount = template.pages?.length || 0;
              
              return (
                <Card 
                  key={template.id}
                  className="hover:border-primary/50 transition-colors cursor-pointer group"
                >
                  <Link to="/admin/templates">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div 
                          className="p-2 rounded-lg shrink-0"
                          style={{ backgroundColor: `${template.branding?.primaryColor || '#6366f1'}20` }}
                        >
                          <Rocket className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm group-hover:text-primary transition-colors">
                              {template.name}
                            </p>
                            <Badge variant="secondary" className="text-xs">
                              {pageCount} pages
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {template.tagline}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1 group-hover:text-primary transition-colors" />
                      </div>
                    </CardContent>
                  </Link>
                </Card>
              );
            })}
          </div>
          
          {STARTER_TEMPLATES.length > 6 && (
            <div className="text-center">
              <Button variant="outline" asChild>
                <Link to="/admin/templates">
                  View all {STARTER_TEMPLATES.length} templates
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
            </div>
          )}
        </TabsContent>

        {/* Manual setup tab */}
        <TabsContent value="manual" className="space-y-6">
          {/* Progress */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Rocket className="h-5 w-5 text-primary" />
                  <span className="font-medium">Setup-progress</span>
                </div>
                <Badge variant={progress === 100 ? "default" : "secondary"}>
                  {completedSteps.length} of {MANUAL_STEPS.length} done
                </Badge>
              </div>
              <Progress value={progress} className="h-2" />
              {progress === 100 && (
                <p className="text-sm text-muted-foreground mt-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Congratulations! You have completed all steps.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Steps */}
          <div className="space-y-4">
            {MANUAL_STEPS.map((step, index) => {
              const isCompleted = completedSteps.includes(step.id);
              const StepIcon = step.icon;
              
              return (
                <Card 
                  key={step.id}
                  className={cn(
                    "transition-all",
                    isCompleted && "bg-muted/30 border-green-200 dark:border-green-900"
                  )}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start gap-4">
                      <button
                        onClick={() => toggleStep(step.id)}
                        className={cn(
                          "mt-0.5 shrink-0 rounded-full p-1 transition-colors",
                          isCompleted 
                            ? "text-green-500 hover:text-green-600" 
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {isCompleted ? (
                          <CheckCircle2 className="h-6 w-6" />
                        ) : (
                          <Circle className="h-6 w-6" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <CardTitle className={cn(
                          "text-base flex items-center gap-2",
                          isCompleted && "line-through text-muted-foreground"
                        )}>
                          <span className="text-muted-foreground font-normal">Step {index + 1}:</span>
                          {step.title}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {step.description}
                        </CardDescription>
                      </div>
                      <StepIcon className={cn(
                        "h-5 w-5 shrink-0",
                        isCompleted ? "text-green-500" : "text-muted-foreground"
                      )} />
                    </div>
                  </CardHeader>
                  
                  <CardContent className="pt-0">
                    {step.tips && (
                      <Accordion type="single" collapsible className="mb-4">
                        <AccordionItem value="tips" className="border-none">
                          <AccordionTrigger className="py-2 text-sm hover:no-underline">
                            <span className="flex items-center gap-2 text-muted-foreground">
                              <Lightbulb className="h-4 w-4" />
                              Pro-tips
                            </span>
                          </AccordionTrigger>
                          <AccordionContent>
                            <ul className="space-y-2 text-sm text-muted-foreground">
                              {step.tips.map((tip, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                                  {tip}
                                </li>
                              ))}
                            </ul>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    )}
                    
                    {step.action && (
                      <Button asChild size="sm" variant={isCompleted ? "outline" : "default"}>
                        <Link to={step.action.href}>
                          {step.action.label}
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </Link>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* Quick resources */}
      <div className="mt-8 grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              Private AI Chat
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Self-hosted AI that never sends data to the cloud
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Block Editor
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            20+ block types with drag-and-drop editing
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              Headless API
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            REST & GraphQL for multi-channel delivery
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
