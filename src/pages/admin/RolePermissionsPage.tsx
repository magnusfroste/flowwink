import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useModules } from '@/hooks/useModules';
import {
  useRoleModuleAccess,
  useToggleRoleModuleAccess,
} from '@/hooks/useRoleModuleAccess';
import { useResetRoleModuleAccess } from '@/hooks/useResetRoleModuleAccess';
import { FUNCTIONAL_ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, type AppRole } from '@/types/cms';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { RotateCcw, Shield } from 'lucide-react';
import { RoleAccessAuditPanel } from '@/components/admin/RoleAccessAuditPanel';
import { AdminLayout } from '@/components/admin/AdminLayout';

export default function RolePermissionsPage() {
  return (
    <AdminLayout>
      <RolePermissionsContent />
    </AdminLayout>
  );
}

function RolePermissionsContent() {
  const { data: modules, isLoading: loadingModules } = useModules();
  const { data: accessMap, isLoading: loadingAccess } = useRoleModuleAccess();
  const toggle = useToggleRoleModuleAccess();
  const { resetOne, resetAll } = useResetRoleModuleAccess();
  const [resetRoleTarget, setResetRoleTarget] = useState<AppRole | null>(null);

  const moduleEntries = useMemo(() => {
    if (!modules) return [];
    return Object.entries(modules)
      .filter(([_, cfg]) => cfg && cfg.adminUI !== false && !cfg.core)
      .map(([id, cfg]) => ({ id, name: cfg.name, category: cfg.category }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [modules]);

  const isLoading = loadingModules || loadingAccess;

  return (
    <div className="space-y-6">
      <Helmet>
        <title>Role permissions — Admin</title>
      </Helmet>

      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2">
          <Shield className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Role permissions</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Control which modules each functional role can see in the admin sidebar.
            Admins always see everything. MCP agents are unaffected — skill exposure
            is module-based, not role-based.
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <RotateCcw className="h-3.5 w-3.5" />
              Reset all to defaults
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset all roles to defaults?</AlertDialogTitle>
              <AlertDialogDescription>
                This wipes the entire matrix and restores the seeded baseline for
                every role. The change is logged in the audit trail.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => resetAll.mutate()}>
                Reset all
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="min-w-[220px] sticky left-0 bg-background z-20">
                    Module
                  </TableHead>
                  {FUNCTIONAL_ROLES.map((role) => (
                    <TableHead
                      key={role}
                      className="text-center min-w-[110px]"
                      title={ROLE_DESCRIPTIONS[role]}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span>{ROLE_LABELS[role]}</span>
                        <button
                          type="button"
                          onClick={() => setResetRoleTarget(role)}
                          className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 transition-colors"
                          title={`Reset ${ROLE_LABELS[role]} to defaults`}
                        >
                          <RotateCcw className="h-2.5 w-2.5" />
                          reset
                        </button>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {moduleEntries.map((mod) => (
                  <TableRow key={mod.id}>
                    <TableCell className="font-medium sticky left-0 bg-background">
                      <div>{mod.name}</div>
                      <div className="text-xs text-muted-foreground">{mod.id}</div>
                    </TableCell>
                    {FUNCTIONAL_ROLES.map((role) => {
                      const granted = accessMap?.[role]?.has(mod.id) ?? false;
                      return (
                        <TableCell key={role} className="text-center">
                          <Checkbox
                            checked={granted}
                            disabled={toggle.isPending}
                            onCheckedChange={(checked) =>
                              toggle.mutate({
                                role,
                                moduleId: mod.id,
                                grant: Boolean(checked),
                              })
                            }
                            aria-label={`${ROLE_LABELS[role]} can access ${mod.name}`}
                          />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
                {moduleEntries.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={FUNCTIONAL_ROLES.length + 1}
                      className="text-center text-muted-foreground py-12"
                    >
                      No modules to configure.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <p className="text-xs text-muted-foreground">
        Changes apply immediately. Affected users will see the updated sidebar on
        next page load.
      </p>

      <RoleAccessAuditPanel />

      <AlertDialog
        open={resetRoleTarget !== null}
        onOpenChange={(open) => !open && setResetRoleTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Reset {resetRoleTarget ? ROLE_LABELS[resetRoleTarget] : ''} to defaults?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This wipes all current module grants for this role and restores the
              seeded baseline. The change is logged in the audit trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (resetRoleTarget) resetOne.mutate(resetRoleTarget);
                setResetRoleTarget(null);
              }}
            >
              Reset role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
