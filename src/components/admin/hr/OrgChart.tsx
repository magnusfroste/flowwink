import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { Employee } from "@/hooks/useEmployees";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";

type Node = Employee & { reports: Node[] };

function buildTree(employees: Employee[]): { roots: Node[]; orphanCount: number } {
  const map = new Map<string, Node>();
  employees.forEach((e) => map.set(e.id, { ...e, reports: [] }));
  const roots: Node[] = [];
  let orphanCount = 0;
  map.forEach((node) => {
    if (node.manager_id && map.has(node.manager_id)) {
      map.get(node.manager_id)!.reports.push(node);
    } else {
      if (node.manager_id) orphanCount++;
      roots.push(node);
    }
  });
  // Sort: managers first, then alphabetical
  const sortFn = (a: Node, b: Node) => {
    if (a.reports.length !== b.reports.length) return b.reports.length - a.reports.length;
    return a.name.localeCompare(b.name);
  };
  const sortRecursive = (nodes: Node[]) => {
    nodes.sort(sortFn);
    nodes.forEach((n) => sortRecursive(n.reports));
  };
  sortRecursive(roots);
  return { roots, orphanCount };
}

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function NodeCard({ node, depth = 0 }: { node: Node; depth?: number }) {
  const hasReports = node.reports.length > 0;
  return (
    <div className="flex flex-col items-center">
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg border bg-card p-3 shadow-sm min-w-[200px]",
          depth === 0 && "border-primary/40 bg-primary/5"
        )}
      >
        <Avatar className="h-10 w-10">
          <AvatarFallback className={cn(depth === 0 && "bg-primary/20 text-primary")}>
            {initials(node.name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{node.name}</p>
          {node.title && <p className="text-xs text-muted-foreground truncate">{node.title}</p>}
          <div className="flex items-center gap-1.5 mt-0.5">
            {node.department && <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{node.department}</Badge>}
            {hasReports && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                <Users className="h-2.5 w-2.5 mr-0.5" />{node.reports.length}
              </Badge>
            )}
            {node.status === "on_leave" && <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-yellow-500/10">On leave</Badge>}
          </div>
        </div>
      </div>

      {hasReports && (
        <>
          {/* Vertical connector */}
          <div className="w-px h-6 bg-border" />
          {/* Children row */}
          <div className="relative">
            {node.reports.length > 1 && (
              <div className="absolute left-0 right-0 top-0 h-px bg-border" />
            )}
            <div className="flex items-start gap-6 pt-0">
              {node.reports.map((child) => (
                <div key={child.id} className="flex flex-col items-center">
                  <div className="w-px h-6 bg-border" />
                  <NodeCard node={child} depth={depth + 1} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function OrgChart({ employees }: { employees: Employee[] }) {
  const { roots, orphanCount } = useMemo(() => buildTree(employees), [employees]);

  if (employees.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p>No employees yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        {orphanCount > 0 && (
          <p className="text-xs text-muted-foreground mb-4">
            Note: {orphanCount} employee(s) have a manager assigned that no longer exists — shown as roots.
          </p>
        )}
        <div className="overflow-x-auto pb-4">
          <div className="inline-flex gap-10 min-w-full justify-center">
            {roots.map((root) => (
              <NodeCard key={root.id} node={root} />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
