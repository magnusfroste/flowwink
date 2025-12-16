import { useState } from 'react';
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
  Building2,
  ShieldCheck
} from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
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

const ONBOARDING_STEPS: Step[] = [
  {
    id: 'create-site',
    title: 'Create Your Site',
    description: 'Start with a complete site template that includes multiple pages, branding, and AI chat configuration. Perfect for getting started quickly.',
    icon: FileText,
    action: {
      label: 'Create Site from Template',
      href: '/admin/new-site',
    },
    tips: [
      'Each template creates multiple pre-configured pages',
      'Branding and chat settings are automatically applied',
      'Templates can be fully customized after creation',
    ],
  },
  {
    id: 'customize-branding',
    title: 'Set Up Your Branding',
    description: 'Add your logo, colors, and fonts to make the site your own. You can also use the Brand Guide Assistant to import branding from an existing website.',
    icon: Palette,
    action: {
      label: 'Configure Branding',
      href: '/admin/branding',
    },
    tips: [
      'Upload your logo in both light and dark variants',
      'Use the "Analyze Brand" feature to import colors from your existing site',
      'Preview changes in real-time before saving',
    ],
  },
  {
    id: 'configure-chat',
    title: 'Configure AI Chat',
    description: 'Set up the Private AI assistant with your knowledge base. Choose which pages to include as context and customize the chat appearance.',
    icon: MessageSquare,
    action: {
      label: 'AI Chat Settings',
      href: '/admin/chat',
    },
    tips: [
      'Select which published pages become part of the AI knowledge base',
      'Use Local OpenAI-compatible endpoint for HIPAA compliance',
      'Customize welcome messages and conversation starters',
    ],
  },
  {
    id: 'publish',
    title: 'Preview & Publish',
    description: 'Review your page in preview mode, then publish to make it live. Use the editorial workflow for team review if needed.',
    icon: Globe,
    action: {
      label: 'View Pages',
      href: '/admin/pages',
    },
    tips: [
      'Use Preview to see exactly how visitors will experience your page',
      'Published pages are automatically indexed (unless blocked)',
      'Schedule pages for future publication if needed',
    ],
  },
];

const TEMPLATE_ICONS = {
  launchpad: Rocket,
  trustcorp: Building2,
  securehealth: ShieldCheck,
};

export default function QuickStartPage() {
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);

  const toggleStep = (stepId: string) => {
    setCompletedSteps(prev => 
      prev.includes(stepId) 
        ? prev.filter(id => id !== stepId)
        : [...prev, stepId]
    );
  };

  const progress = (completedSteps.length / ONBOARDING_STEPS.length) * 100;

  return (
    <AdminLayout>
      <AdminPageHeader
        title="Quick Start Guide"
        description="Get your site up and running in minutes"
      />

      {/* Progress Section */}
      <Card className="mb-8">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-primary" />
              <span className="font-medium">Setup Progress</span>
            </div>
            <Badge variant={progress === 100 ? "default" : "secondary"}>
              {completedSteps.length} of {ONBOARDING_STEPS.length} complete
            </Badge>
          </div>
          <Progress value={progress} className="h-2" />
          {progress === 100 && (
            <p className="text-sm text-muted-foreground mt-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Congratulations! You've completed the quick start guide.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main Steps */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-semibold mb-4">Getting Started Steps</h2>
          
          {ONBOARDING_STEPS.map((step, index) => {
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
                            Pro Tips
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

        {/* Sidebar - Templates & Resources */}
        <div className="space-y-6">
          {/* Templates Quick Access */}
          <div>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Site Templates
            </h2>
            <div className="space-y-3">
              {STARTER_TEMPLATES.map((template) => {
                const TemplateIcon = TEMPLATE_ICONS[template.id as keyof typeof TEMPLATE_ICONS] || Rocket;
                const pageCount = template.pages?.length || 1;
                
                return (
                  <Card 
                    key={template.id}
                    className="hover:border-primary/50 transition-colors cursor-pointer"
                  >
                    <Link to="/admin/new-site">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className={cn(
                            "p-2 rounded-lg shrink-0",
                            template.category === 'startup' && "bg-violet-100 dark:bg-violet-900/30",
                            template.category === 'enterprise' && "bg-blue-100 dark:bg-blue-900/30",
                            template.category === 'compliance' && "bg-emerald-100 dark:bg-emerald-900/30"
                          )}>
                            <TemplateIcon className={cn(
                              "h-4 w-4",
                              template.category === 'startup' && "text-violet-600 dark:text-violet-400",
                              template.category === 'enterprise' && "text-blue-600 dark:text-blue-400",
                              template.category === 'compliance' && "text-emerald-600 dark:text-emerald-400"
                            )} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm">{template.name}</p>
                              <Badge variant="secondary" className="text-xs">
                                {pageCount} pages
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {template.tagline}
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                        </div>
                      </CardContent>
                    </Link>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Key Features */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                Key Features
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <MessageSquare className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="font-medium">Private AI Chat</p>
                  <p className="text-muted-foreground text-xs">Self-hosted AI that never sends data to the cloud</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <FileText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="font-medium">Block-Based Editor</p>
                  <p className="text-muted-foreground text-xs">16 block types with drag-and-drop editing</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Globe className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="font-medium">Headless API</p>
                  <p className="text-muted-foreground text-xs">REST & GraphQL for multi-channel delivery</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Video Tutorial Placeholder */}
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-primary/10">
                  <Play className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Video Walkthrough</p>
                  <p className="text-xs text-muted-foreground">5-minute setup tutorial</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3 italic">
                Coming soon — check back for a video guide!
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
