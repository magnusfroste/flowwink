import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Bot, TrendingUp, Users, Newspaper, ShoppingCart, Headphones, Check, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const GOAL_OPTIONS = [
  {
    id: 'grow-traffic',
    icon: TrendingUp,
    title: 'Grow Website Traffic',
    description: 'Publish blog posts, optimize SEO, and improve search rankings',
    objective: 'Increase website traffic by regularly publishing optimized blog content and improving SEO across all pages.',
  },
  {
    id: 'generate-leads',
    icon: Users,
    title: 'Generate More Leads',
    description: 'Capture visitors, qualify prospects, and nurture them automatically',
    objective: 'Generate and qualify leads through forms, chat interactions, and automated follow-ups. Aim for consistent lead pipeline growth.',
  },
  {
    id: 'content-marketing',
    icon: Newspaper,
    title: 'Content Marketing',
    description: 'Create newsletters, blog content, and social media copy',
    objective: 'Build a consistent content marketing engine with weekly blog posts, monthly newsletters, and cross-channel content distribution.',
  },
  {
    id: 'sell-online',
    icon: ShoppingCart,
    title: 'Sell Products/Services',
    description: 'Drive purchases, manage orders, and grow revenue',
    objective: 'Optimize the online sales funnel by improving product pages, reducing cart abandonment, and increasing average order value.',
  },
  {
    id: 'customer-support',
    icon: Headphones,
    title: 'Improve Customer Support',
    description: 'Build a knowledge base and let AI handle common questions',
    objective: 'Improve customer support by expanding the knowledge base, increasing AI chat resolution rate, and reducing response time for escalated conversations.',
  },
];

interface FlowPilotOnboardingWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateName?: string;
}

export function FlowPilotOnboardingWizard({ open, onOpenChange, templateName }: FlowPilotOnboardingWizardProps) {
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const toggleGoal = (id: string) => {
    setSelectedGoals(prev =>
      prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    if (selectedGoals.length === 0) {
      onOpenChange(false);
      return;
    }

    setSaving(true);
    try {
      // Create objectives from selected goals
      const objectives = selectedGoals.map(goalId => {
        const goal = GOAL_OPTIONS.find(g => g.id === goalId)!;
        return {
          goal: goal.objective,
          status: 'active' as const,
          constraints: {},
          success_criteria: {},
          progress: { source: 'onboarding', goal_type: goalId },
        };
      });

      const { error } = await supabase
        .from('agent_objectives')
        .insert(objectives);

      if (error) throw error;

      toast({
        title: 'Goals set!',
        description: `FlowPilot will now work toward ${selectedGoals.length} objective${selectedGoals.length > 1 ? 's' : ''}.`,
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Failed to save goals',
        description: 'You can set goals later from the Engine Room.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            What should FlowPilot focus on?
          </DialogTitle>
          <DialogDescription>
            Select your top business goals. FlowPilot will autonomously work toward these — publishing content, qualifying leads, and optimizing your site.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 my-4">
          {GOAL_OPTIONS.map((goal) => {
            const isSelected = selectedGoals.includes(goal.id);
            const Icon = goal.icon;
            return (
              <Card
                key={goal.id}
                className={cn(
                  'cursor-pointer transition-all border',
                  isSelected
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                    : 'hover:border-primary/30'
                )}
                onClick={() => toggleGoal(goal.id)}
              >
                <CardContent className="flex items-center gap-3 p-3">
                  <div className={cn(
                    'p-2 rounded-lg shrink-0',
                    isSelected ? 'bg-primary/10' : 'bg-muted'
                  )}>
                    <Icon className={cn(
                      'h-4 w-4',
                      isSelected ? 'text-primary' : 'text-muted-foreground'
                    )} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{goal.title}</p>
                    <p className="text-xs text-muted-foreground">{goal.description}</p>
                  </div>
                  {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="flex justify-between items-center">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Skip for now
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {selectedGoals.length > 0 ? (
              <>
                Set {selectedGoals.length} Goal{selectedGoals.length > 1 ? 's' : ''}
                <ArrowRight className="h-4 w-4" />
              </>
            ) : (
              'Skip'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
