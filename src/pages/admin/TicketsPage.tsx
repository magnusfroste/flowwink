import { useState, useMemo } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TicketsKanban } from "@/components/admin/tickets/TicketsKanban";
import { TicketsTable } from "@/components/admin/tickets/TicketsTable";
import { CreateTicketDialog } from "@/components/admin/tickets/CreateTicketDialog";
import { useTickets } from "@/hooks/useTickets";

export default function TicketsPage() {
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const { data: tickets, isLoading } = useTickets();

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <AdminPageHeader
            title="Tickets"
            description="Manage support tickets and customer requests"
          />
          <CreateTicketDialog />
        </div>

        <Tabs value={view} onValueChange={(v) => setView(v as "kanban" | "table")}>
          <TabsList>
            <TabsTrigger value="kanban">Board</TabsTrigger>
            <TabsTrigger value="table">List</TabsTrigger>
          </TabsList>

          <TabsContent value="kanban" className="mt-4">
            <TicketsKanban tickets={tickets ?? []} isLoading={isLoading} />
          </TabsContent>

          <TabsContent value="table" className="mt-4">
            <TicketsTable tickets={tickets ?? []} isLoading={isLoading} />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
