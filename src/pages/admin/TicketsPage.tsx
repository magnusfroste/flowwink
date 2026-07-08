import { useMemo, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageContainer } from "@/components/admin/AdminPageContainer";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TicketsKanban } from "@/components/admin/tickets/TicketsKanban";
import { TicketsTable } from "@/components/admin/tickets/TicketsTable";
import { CreateTicketDialog } from "@/components/admin/tickets/CreateTicketDialog";
import { CannedResponsesDialog } from "@/components/admin/tickets/CannedResponsesDialog";
import { TicketTeamsTab } from "@/components/admin/tickets/TicketTeamsTab";
import { TicketEscalationRulesTab } from "@/components/admin/tickets/TicketEscalationRulesTab";
import { useTickets, useTicketSearch, type Ticket } from "@/hooks/useTickets";
import { LayoutGrid, List, Search, X, Users, AlarmClock } from "lucide-react";
import { SavedViewsMenu } from "@/components/admin/SavedViewsMenu";
import { useDebounce } from "@/hooks/useDebounce";

export default function TicketsPage() {
  const [view, setView] = useState<"kanban" | "table" | "teams" | "rules">("kanban");
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const debouncedSearch = useDebounce(searchInput, 300);

  const { data: tickets = [], isLoading } = useTickets();
  const { data: searchResults = [], isFetching: isSearching } = useTicketSearch(debouncedSearch);

  // When searching, map RPC results back onto full ticket rows for display parity
  const displayTickets = useMemo<Ticket[]>(() => {
    let base: Ticket[];
    if (debouncedSearch.trim().length > 0) {
      const byId = new Map(tickets.map((t) => [t.id, t]));
      base = searchResults
        .map((r) => byId.get(r.id))
        .filter((t): t is Ticket => Boolean(t));
    } else {
      base = tickets;
    }
    if (selectedTags.length > 0) {
      base = base.filter((t) => selectedTags.every((tag) => (t.tags ?? []).includes(tag)));
    }
    return base;
  }, [debouncedSearch, searchResults, tickets, selectedTags]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    tickets.forEach((t) => (t.tags ?? []).forEach((tag) => set.add(tag)));
    return Array.from(set).sort();
  }, [tickets]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const isBusy = isLoading || (debouncedSearch.trim().length > 0 && isSearching);

  return (
    <AdminLayout>
      <AdminPageContainer>
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
          <AdminPageHeader title="Tickets">
            <TabsList>
              <TabsTrigger value="kanban" className="gap-1.5">
                <LayoutGrid className="h-3.5 w-3.5" />
                Board
              </TabsTrigger>
              <TabsTrigger value="table" className="gap-1.5">
                <List className="h-3.5 w-3.5" />
                List
              </TabsTrigger>
              <TabsTrigger value="teams" className="gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Teams
              </TabsTrigger>
              <TabsTrigger value="rules" className="gap-1.5">
                <AlarmClock className="h-3.5 w-3.5" />
                Escalation
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
            <CannedResponsesDialog />
            <CreateTicketDialog />
          </AdminPageHeader>

          {/* Search + tag filter */}
          <div className="mb-4 space-y-2">
            <div className="relative max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search tickets by subject, contact, description…"
                className="pl-8 pr-8 h-9 text-sm"
              />
              {searchInput && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setSearchInput("")}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            {allTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-xs text-muted-foreground mr-1">Tags:</span>
                {allTags.map((tag) => {
                  const active = selectedTags.includes(tag);
                  return (
                    <Badge
                      key={tag}
                      variant={active ? "default" : "outline"}
                      className="cursor-pointer text-[10px]"
                      onClick={() => toggleTag(tag)}
                    >
                      {tag}
                    </Badge>
                  );
                })}
                {selectedTags.length > 0 && (
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setSelectedTags([])}>
                    Clear
                  </Button>
                )}
              </div>
            )}
          </div>

          <TabsContent value="kanban" className="mt-0">
            <TicketsKanban tickets={displayTickets} isLoading={isBusy} />
          </TabsContent>

          <TabsContent value="table" className="mt-0">
            <TicketsTable tickets={displayTickets} isLoading={isBusy} />
          </TabsContent>
        </Tabs>
      </AdminPageContainer>
    </AdminLayout>
  );
}
