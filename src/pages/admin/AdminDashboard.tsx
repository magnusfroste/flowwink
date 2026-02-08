import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Clock, CheckCircle, AlertCircle, Plus, ArrowRight, UserCheck, Headphones, BookOpen, Megaphone, BarChart3, Settings2, GripVertical, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { EmptyDashboard } from '@/components/admin/EmptyDashboard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { StatusBadge } from '@/components/StatusBadge';
import { WelcomeModal } from '@/components/admin/WelcomeModal';
import { LeadsDashboardWidget } from '@/components/admin/LeadsDashboardWidget';
import { AeoDashboardWidget } from '@/components/admin/AeoDashboardWidget';
import { ChatFeedbackDashboardWidget } from '@/components/admin/ChatFeedbackDashboardWidget';
import { ChatAnalyticsDashboardWidget } from '@/components/admin/ChatAnalyticsDashboardWidget';
import { LiveSupportDashboardWidget } from '@/components/admin/LiveSupportDashboardWidget';
import { usePages } from '@/hooks/usePages';
import { useAuth } from '@/hooks/useAuth';
import { useIsModuleEnabled } from '@/hooks/useModules';
import { useLeadStats } from '@/hooks/useLeads';
import { useSupportConversations } from '@/hooks/useSupportConversations';
import { useChatSettings } from '@/hooks/useSiteSettings';
import { useDashboardLayout } from '@/hooks/useDashboardLayout';
import { toast } from 'sonner';

// Widget metadata
const WIDGET_META: Record<string, { title: string; description: string; moduleId?: string }> = {
  'needs-attention': { title: 'Needs Attention', description: 'Action items requiring your attention' },
  'content-overview': { title: 'Content Overview', description: 'Page statistics overview' },
  'leads': { title: 'Leads', description: 'Recent leads and stats', moduleId: 'leads' },
  'live-support': { title: 'Live Support', description: 'Support conversations', moduleId: 'liveSupport' },
  'chat-analytics': { title: 'Chat Analytics', description: 'AI chat usage statistics', moduleId: 'chat' },
  'chat-feedback': { title: 'Chat Feedback', description: 'User feedback on AI chat', moduleId: 'chat' },
  'aeo': { title: 'AEO Insights', description: 'Answer Engine Optimization' },
  'recent-pages': { title: 'Recent Pages', description: 'Recently updated pages' },
  'quick-actions': { title: 'Quick Actions', description: 'Common shortcuts' },
};

function SortableWidgetItem({ id, visible, onToggle }: { id: string; visible: boolean; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const meta = WIDGET_META[id];
  if (!meta) return null;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 rounded-lg border bg-background"
    >
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground">
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{meta.title}</p>
        <p className="text-xs text-muted-foreground truncate">{meta.description}</p>
      </div>
      <Switch checked={visible} onCheckedChange={onToggle} />
    </div>
  );
}

function NeedsAttentionItem({
  icon: Icon,
  label,
  count,
  href,
  variant = 'default',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  href: string;
  variant?: 'warning' | 'default';
}) {
  if (count === 0) return null;
  return (
    <Link
      to={href}
      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
        variant === 'warning'
          ? 'border-warning/30 bg-warning/5 hover:bg-warning/10'
          : 'border-border hover:bg-muted/50'
      }`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${variant === 'warning' ? 'text-warning' : 'text-muted-foreground'}`} />
      <span className="text-sm flex-1">{label}</span>
      <span className={`text-sm font-semibold ${
        variant === 'warning' ? 'text-warning' : 'text-foreground'
      }`}>{count}</span>
      <ArrowRight className="h-3 w-3 text-muted-foreground" />
    </Link>
  );
}

export default function AdminDashboard() {
  const { data: pages, isLoading } = usePages();
  const { profile, isApprover } = useAuth();
  const leadsEnabled = useIsModuleEnabled('leads');
  const chatEnabled = useIsModuleEnabled('chat');
  const liveSupportEnabled = useIsModuleEnabled('liveSupport');
  const { layout, toggleWidget, reorderWidgets, resetLayout, isWidgetVisible } = useDashboardLayout();
  const [customizeOpen, setCustomizeOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Action item data
  const { data: leadStats } = useLeadStats();
  const { data: chatSettings } = useChatSettings();
  const { waitingConversations } = useSupportConversations();

  const stats = {
    total: pages?.length || 0,
    draft: pages?.filter(p => p.status === 'draft').length || 0,
    reviewing: pages?.filter(p => p.status === 'reviewing').length || 0,
    published: pages?.filter(p => p.status === 'published').length || 0,
  };

  const recentPages = pages?.slice(0, 5) || [];
  const pendingReview = pages?.filter(p => p.status === 'reviewing') || [];

  const isEmpty = !isLoading && stats.total === 0;

  // Build action items
  const actionItems = [
    { icon: AlertCircle, label: 'Pages pending review', count: stats.reviewing, href: '/admin/pages', variant: 'warning' as const },
    leadsEnabled && { icon: UserCheck, label: 'Leads need review', count: leadStats?.needsReview || 0, href: '/admin/contacts', variant: 'warning' as const },
    chatEnabled && chatSettings?.humanHandoffEnabled && { icon: Headphones, label: 'Waiting for support', count: waitingConversations?.length || 0, href: '/admin/live-support', variant: 'warning' as const },
  ].filter(Boolean) as Array<{ icon: React.ComponentType<{ className?: string }>; label: string; count: number; href: string; variant: 'warning' | 'default' }>;

  const totalActionItems = actionItems.reduce((sum, item) => sum + item.count, 0);

  // Module availability map
  const moduleAvailable: Record<string, boolean> = {
    'needs-attention': true,
    'content-overview': true,
    'leads': leadsEnabled,
    'live-support': liveSupportEnabled !== false,
    'chat-analytics': chatEnabled,
    'chat-feedback': chatEnabled,
    'aeo': true,
    'recent-pages': true,
    'quick-actions': true,
  };

  // Widget renderers
  const renderWidget = (widgetId: string) => {
    if (!isWidgetVisible(widgetId)) return null;
    if (!moduleAvailable[widgetId]) return null;

    switch (widgetId) {
      case 'needs-attention':
        return totalActionItems > 0 ? (
          <Card key={widgetId}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-warning" />
                Needs Attention
                <span className="text-xs font-normal text-muted-foreground">({totalActionItems})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {actionItems.map((item) => (
                  <NeedsAttentionItem key={item.label} {...item} />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null;

      case 'content-overview':
        return (
          <div key={widgetId} className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link to="/admin/pages" className="group">
              <Card className="transition-colors group-hover:border-primary/30">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between mb-1">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-2xl font-bold">{isLoading ? '-' : stats.total}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Pages</p>
                </CardContent>
              </Card>
            </Link>
            <Link to="/admin/pages" className="group">
              <Card className="transition-colors group-hover:border-primary/30">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between mb-1">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-2xl font-bold">{isLoading ? '-' : stats.draft}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Drafts</p>
                </CardContent>
              </Card>
            </Link>
            <Link to="/admin/pages" className="group">
              <Card className="transition-colors group-hover:border-primary/30">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between mb-1">
                    <CheckCircle className="h-4 w-4 text-success" />
                    <span className="text-2xl font-bold">{isLoading ? '-' : stats.published}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Published</p>
                </CardContent>
              </Card>
            </Link>
            <Link to="/admin/analytics" className="group">
              <Card className="transition-colors group-hover:border-primary/30">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between mb-1">
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground">View Analytics →</p>
                </CardContent>
              </Card>
            </Link>
          </div>
        );

      case 'leads':
        return <LeadsDashboardWidget key={widgetId} />;

      case 'live-support':
        return <LiveSupportDashboardWidget key={widgetId} />;

      case 'chat-analytics':
        return <ChatAnalyticsDashboardWidget key={widgetId} />;

      case 'chat-feedback':
        return <ChatFeedbackDashboardWidget key={widgetId} />;

      case 'aeo':
        return <AeoDashboardWidget key={widgetId} />;

      case 'recent-pages':
        return (
          <Card key={widgetId}>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="font-serif">Recent Pages</CardTitle>
                <CardDescription>Recently updated pages</CardDescription>
              </div>
              <Button asChild size="sm">
                <Link to="/admin/pages/new">
                  <Plus className="h-4 w-4 mr-1" />
                  New Page
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : recentPages.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No pages yet. Create your first page!
                </p>
              ) : (
                <div className="space-y-3">
                  {recentPages.map((page) => (
                    <Link
                      key={page.id}
                      to={`/admin/pages/${page.id}`}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                    >
                      <div>
                        <p className="font-medium">{page.title}</p>
                        <p className="text-sm text-muted-foreground">/{page.slug}</p>
                      </div>
                      <StatusBadge status={page.status} />
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );

      case 'quick-actions':
        return isApprover ? (
          <Card key={widgetId}>
            <CardHeader>
              <CardTitle className="font-serif">Pending Review</CardTitle>
              <CardDescription>Pages awaiting approval</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : pendingReview.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-success mx-auto mb-3" />
                  <p className="text-muted-foreground">
                    No pages pending review
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingReview.map((page) => (
                    <Link
                      key={page.id}
                      to={`/admin/pages/${page.id}`}
                      className="flex items-center justify-between p-3 rounded-lg border border-warning/30 bg-warning/5 hover:bg-warning/10 transition-colors"
                    >
                      <div>
                        <p className="font-medium">{page.title}</p>
                        <p className="text-sm text-muted-foreground">
                          Updated {new Date(page.updated_at).toLocaleDateString('en-US')}
                        </p>
                      </div>
                      <Button size="sm" variant="outline">
                        Review
                      </Button>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card key={widgetId}>
            <CardHeader>
              <CardTitle className="font-serif">Quick Actions</CardTitle>
              <CardDescription>Common actions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild className="w-full justify-start" variant="outline">
                <Link to="/admin/pages/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Create new page
                </Link>
              </Button>
              <Button asChild className="w-full justify-start" variant="outline">
                <Link to="/admin/blog/new">
                  <BookOpen className="h-4 w-4 mr-2" />
                  Write blog post
                </Link>
              </Button>
              <Button asChild className="w-full justify-start" variant="outline">
                <Link to="/admin/campaigns">
                  <Megaphone className="h-4 w-4 mr-2" />
                  Create campaign
                </Link>
              </Button>
              <Button asChild className="w-full justify-start" variant="outline">
                <Link to="/admin/analytics">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  View analytics
                </Link>
              </Button>
            </CardContent>
          </Card>
        );

      default:
        return null;
    }
  };

  // Group widgets that should be in 2-col grid
  const pairedWidgets = new Set(['leads', 'live-support', 'chat-analytics', 'chat-feedback', 'recent-pages', 'quick-actions']);

  // Render widgets in order, grouping paired ones
  const renderOrderedWidgets = () => {
    const widgetOrder = layout.widgets.map(w => w.id);
    const rendered: React.ReactNode[] = [];
    let i = 0;

    while (i < widgetOrder.length) {
      const id = widgetOrder[i];
      const isVisible = isWidgetVisible(id);
      const isAvailable = moduleAvailable[id];

      if (!isVisible || !isAvailable) {
        i++;
        continue;
      }

      if (pairedWidgets.has(id)) {
        // Collect consecutive paired widgets
        const pair: string[] = [id];
        let j = i + 1;
        while (j < widgetOrder.length && pair.length < 2) {
          const nextId = widgetOrder[j];
          if (pairedWidgets.has(nextId) && isWidgetVisible(nextId) && moduleAvailable[nextId]) {
            pair.push(nextId);
            j++;
            break;
          } else if (!pairedWidgets.has(nextId)) {
            break;
          }
          j++;
        }

        rendered.push(
          <div key={`pair-${pair.join('-')}`} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {pair.map(pid => renderWidget(pid))}
          </div>
        );
        i = j;
      } else {
        rendered.push(renderWidget(id));
        i++;
      }
    }

    return rendered;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = layout.widgets.findIndex(w => w.id === active.id);
      const newIndex = layout.widgets.findIndex(w => w.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        reorderWidgets(oldIndex, newIndex);
      }
    }
  };

  const handleReset = () => {
    resetLayout();
    toast.success('Dashboard reset to default layout');
  };

  return (
    <AdminLayout>
      <WelcomeModal />
      <AdminPageContainer>
        <div className="flex items-center justify-between">
          <AdminPageHeader 
            title={`Welcome, ${profile?.full_name?.split(' ')[0] || 'user'}`}
            description={isEmpty ? "Let's get your site up and running" : "Here's what's happening"}
          />
          {!isEmpty && (
            <Sheet open={customizeOpen} onOpenChange={setCustomizeOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Settings2 className="h-4 w-4" />
                  Customize
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Customize Dashboard</SheetTitle>
                  <SheetDescription>
                    Drag to reorder and toggle widgets on or off
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-4">
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={layout.widgets.map(w => w.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {layout.widgets.map(widget => {
                          const meta = WIDGET_META[widget.id];
                          if (!meta) return null;
                          const available = moduleAvailable[widget.id];
                          return (
                            <div key={widget.id} className={!available ? 'opacity-50' : ''}>
                              <SortableWidgetItem
                                id={widget.id}
                                visible={widget.visible && available}
                                onToggle={() => available && toggleWidget(widget.id)}
                              />
                              {!available && (
                                <p className="text-[10px] text-muted-foreground ml-10 mt-0.5">
                                  Module disabled
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </SortableContext>
                  </DndContext>
                  <Button variant="outline" size="sm" className="w-full gap-2" onClick={handleReset}>
                    <RotateCcw className="h-3 w-3" />
                    Reset to Default
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          )}
        </div>

        {/* Empty State - Show when no pages exist */}
        {isEmpty ? (
          <EmptyDashboard />
        ) : (
          <div className="space-y-6">
            {renderOrderedWidgets()}
          </div>
        )}
      </AdminPageContainer>
    </AdminLayout>
  );
}
