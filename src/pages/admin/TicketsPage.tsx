import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageContainer } from "@/components/admin/AdminPageContainer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TicketsKanban } from "@/components/admin/tickets/TicketsKanban";
import { TicketsTable } from "@/components/admin/tickets/TicketsTable";
import { CreateTicketDialog } from "@/components/admin/tickets/CreateTicketDialog";
import { useTickets } from "@/hooks/useTickets";
import { LayoutGrid, List } from "lucide-react";
import { SavedViewsMenu } from "@/components/admin/SavedViewsMenu";

export default function TicketsPage() {
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const { data: tickets, isLoading } = useTickets();

  return (
    <AdminLayout>
      <AdminPageContainer>
        <Tabs value={view} onValueChange={(v) => setView(v as "kanban" | "table")}>
          <div className="flex items-center justify-between gap-4 mb-6">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Tickets</h1>
            <div className="flex items-center gap-3">
              <TabsList>
                <TabsTrigger value="kanban" className="gap-1.5">
                  <LayoutGrid className="h-3.5 w-3.5" />
                  Board
                </TabsTrigger>
                <TabsTrigger value="table" className="gap-1.5">
                  <List className="h-3.5 w-3.5" />
                  List
                </TabsTrigger>
              </TabsList>
              <SavedViewsMenu
                scope="tickets"
                currentConfig={{ view }}
                activeViewId={activeViewId}
                onActiveViewChange={setActiveViewId}
                onApply={(cfg) => {
                  if (cfg.view === 'kanban' || cfg.view === 'table') setView(cfg.view);
                }}
              />
              <CreateTicketDialog />
            </div>
          </div>

          <TabsContent value="kanban" className="mt-0">
            <TicketsKanban tickets={tickets ?? []} isLoading={isLoading} />
          </TabsContent>

          <TabsContent value="table" className="mt-0">
            <TicketsTable tickets={tickets ?? []} isLoading={isLoading} />
          </TabsContent>
        </Tabs>
      </AdminPageContainer>
    </AdminLayout>
  );
}
