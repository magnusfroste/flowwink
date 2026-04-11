import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useProjects, useTimeEntries } from '@/hooks/useTimesheets';
import { useProjectTasks } from '@/hooks/useProjectTasks';
import { BarChart3, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react';

export function BudgetTab() {
  const { data: projects = [], isLoading: loadingProjects } = useProjects(false);
  const { data: allEntries = [], isLoading: loadingEntries } = useTimeEntries();
  const { data: allTasks = [], isLoading: loadingTasks } = useProjectTasks();

  const isLoading = loadingProjects || loadingEntries || loadingTasks;

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  // Calculate stats per project
  const projectStats = projects
    .filter(p => p.is_active)
    .map(p => {
      const entries = allEntries.filter(e => e.project_id === p.id);
      const tasks = allTasks.filter(t => t.project_id === p.id);
      const loggedHours = entries.reduce((s, e) => s + Number(e.hours), 0);
      const estimatedHours = tasks.reduce((s, t) => s + Number(t.estimated_hours || 0), 0);
      const budgetHours = (p as any).budget_hours ? Number((p as any).budget_hours) : null;
      const completedTasks = tasks.filter(t => t.status === 'done').length;
      const totalTasks = tasks.length;
      const rate = p.hourly_rate_cents / 100;
      const revenue = p.is_billable ? loggedHours * rate : 0;
      const budgetUsed = budgetHours ? (loggedHours / budgetHours) * 100 : null;
      const isOverBudget = budgetUsed !== null && budgetUsed > 100;

      return {
        ...p,
        loggedHours,
        estimatedHours,
        budgetHours,
        completedTasks,
        totalTasks,
        revenue,
        budgetUsed,
        isOverBudget,
      };
    })
    .sort((a, b) => b.loggedHours - a.loggedHours);

  const totalLogged = projectStats.reduce((s, p) => s + p.loggedHours, 0);
  const totalRevenue = projectStats.reduce((s, p) => s + p.revenue, 0);
  const overBudgetCount = projectStats.filter(p => p.isOverBudget).length;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <BarChart3 className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{totalLogged.toFixed(1)}h</p>
                <p className="text-xs text-muted-foreground">Total Hours Logged</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{totalRevenue.toLocaleString()} SEK</p>
                <p className="text-xs text-muted-foreground">Billable Revenue</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              {overBudgetCount > 0 ? (
                <AlertTriangle className="h-8 w-8 text-destructive" />
              ) : (
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              )}
              <div>
                <p className="text-2xl font-bold">{overBudgetCount}</p>
                <p className="text-xs text-muted-foreground">Over Budget</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-project breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project Budget & Profitability</CardTitle>
        </CardHeader>
        <CardContent>
          {projectStats.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No active projects.</p>
          ) : (
            <div className="divide-y">
              {projectStats.map(p => (
                <div key={p.id} className="py-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                      <div>
                        <span className="font-medium text-sm">{p.name}</span>
                        {p.client_name && (
                          <span className="text-xs text-muted-foreground ml-2">— {p.client_name}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {p.totalTasks > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {p.completedTasks}/{p.totalTasks} tasks
                        </Badge>
                      )}
                      {p.is_billable && (
                        <Badge variant="secondary" className="text-xs">
                          {p.revenue.toLocaleString()} {p.currency}
                        </Badge>
                      )}
                      {p.isOverBudget && (
                        <Badge variant="destructive" className="text-xs">Over budget</Badge>
                      )}
                    </div>
                  </div>

                  {/* Budget progress bar */}
                  {p.budgetHours !== null ? (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{p.loggedHours.toFixed(1)}h logged</span>
                        <span>{p.budgetHours}h budget</span>
                      </div>
                      <Progress
                        value={Math.min(p.budgetUsed!, 100)}
                        className={`h-2 ${p.isOverBudget ? '[&>div]:bg-destructive' : ''}`}
                      />
                    </div>
                  ) : (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{p.loggedHours.toFixed(1)}h logged</span>
                      {p.estimatedHours > 0 && (
                        <span>{p.estimatedHours}h estimated (from tasks)</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
