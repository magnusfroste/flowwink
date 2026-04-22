import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, ClipboardList } from "lucide-react";
import {
  onboardingProgress,
  useOnboardingChecklists,
  useToggleOnboardingItem,
  type OnboardingChecklist,
} from "@/hooks/useOnboarding";
import { format } from "date-fns";

interface Props {
  employeeId: string;
  startDate?: string | null;
  compact?: boolean;
}

export function OnboardingPanel({ employeeId, startDate, compact = false }: Props) {
  const { data, isLoading } = useOnboardingChecklists(employeeId);
  const toggle = useToggleOnboardingItem();

  if (isLoading) {
    return <Skeleton className={compact ? "h-6 w-32" : "h-24 w-full"} />;
  }

  const checklists = data || [];

  if (!checklists.length) {
    return compact ? (
      <span className="text-xs text-muted-foreground">No onboarding plan</span>
    ) : (
      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        <ClipboardList className="mx-auto mb-2 h-6 w-6 opacity-50" />
        No onboarding plan yet. One is created automatically when an employee is hired from a candidate.
      </div>
    );
  }

  // Aggregate progress across all checklists for this employee
  const allItems = checklists.flatMap((c) => c.items);
  const overall = onboardingProgress(allItems);

  if (compact) {
    return (
      <div className="flex items-center gap-2 min-w-[140px]">
        <Progress value={overall.pct} className="h-1.5 flex-1" />
        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          {overall.done}/{overall.total}
        </span>
        {overall.pct === 100 && <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Onboarding progress</p>
          {startDate && (
            <p className="text-xs text-muted-foreground">Started {format(new Date(startDate), "MMM d, yyyy")}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={overall.pct === 100 ? "default" : "secondary"}>
            {overall.done}/{overall.total} steps
          </Badge>
          <span className="text-sm font-medium tabular-nums">{overall.pct}%</span>
        </div>
      </div>
      <Progress value={overall.pct} />

      {checklists.map((cl: OnboardingChecklist) => (
        <div key={cl.id} className="rounded-md border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{cl.title || "Onboarding checklist"}</p>
            {cl.completed_at && (
              <Badge variant="outline" className="text-green-700 border-green-300">
                Completed {format(new Date(cl.completed_at), "MMM d")}
              </Badge>
            )}
          </div>
          <ul className="space-y-1.5">
            {cl.items.map((item, idx) => (
              <li key={idx} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={item.done}
                  onCheckedChange={(v) =>
                    toggle.mutate({
                      checklist_id: cl.id,
                      employee_id: employeeId,
                      index: idx,
                      done: Boolean(v),
                      currentItems: cl.items,
                    })
                  }
                />
                <span className={item.done ? "line-through text-muted-foreground" : ""}>{item.title}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
