import { useEffect, useMemo, useState } from "react";
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
import { useTicketSlaMap } from "@/hooks/useTicketSla";
import { LayoutGrid, List, Search, X, Users, AlarmClock, Inbox, TriangleAlert } from "lucide-react";
import { SavedViewsMenu } from "@/components/admin/SavedViewsMenu";
import { useDebounce } from "@/hooks/useDebounce";
import { useOpenOnQueryParam } from "@/hooks/useOpenOnQueryParam";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadDemoDataButton } from "@/components/admin/LoadDemoDataButton";
import { Ticket as TicketIcon } from "lucide-react";
import { InboundMailboxesSection } from "@/components/admin/email/InboundMailboxesSection";
import { useIsIntegrationActive } from "@/hooks/useIntegrations";
import { Link, useSearchParams } from "react-router-dom";

export default function TicketsPage() {
  const [view, setView] = useState<"kanban" | "table" | "teams" | "rules" | "inbound">("kanban");
  const composioActive = useIsIntegrationActive("composio").isActive;
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  // The Support Queue tiles link here filtered (?assignee=unassigned,
  // ?sla=breached, ?priority=urgent); the page used to ignore all three.
  const [slaOnly, setSlaOnly] = useState(searchParams.get('sla') === 'breached');
  const assigneeFilter = searchParams.get('assignee');
  const priorityFilter = searchParams.get('priority');
  const clearQueueFilters = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('assignee');
    next.delete('priority');
    next.delete('sla');
    setSearchParams(next, { replace: true });
    setSlaOnly(false);
  };
  const [createOpen, setCreateOpen] = useState(false);
  useOpenOnQueryParam('new', '1', () => setCreateOpen(true));
  const debouncedSearch = useDebounce(searchInput, 300);
  const deepLinkTicketId = searchParams.get('ticket');

  const { data: tickets = [], isLoading } = useTickets();
  const { data: searchResults = [], isFetching: isSearching } = useTicketSearch(debouncedSearch);
  const slaMap = useTicketSlaMap(tickets);

  // A deep link from the SLA Monitor should land on the list view with the drawer open.
  useEffect(() => {
    if (deepLinkTicketId) setView('table');
  }, [deepLinkTicketId]);

  const breachedCount = useMemo(
    () => tickets.filter((t) => slaMap.get(t.id)?.state === 'breached').length,
    [tickets, slaMap]
  );

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
    if (slaOnly) {
      base = base.filter((t) => slaMap.get(t.id)?.state === 'breached');
    }
    if (assigneeFilter === 'unassigned') base = base.filter((t) => !t.assigned_to);
    if (priorityFilter) base = base.filter((t) => t.priority === priorityFilter);
    return base;
  }, [debouncedSearch, searchResults, tickets, selectedTags, slaOnly, slaMap, assigneeFilter, priorityFilter]);

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
              <TabsTrigger value="inbound" className="gap-1.5">
                <Inbox className="h-3.5 w-3.5" />
                Inbound
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
            <CreateTicketDialog open={createOpen} onOpenChange={setCreateOpen} />
          </AdminPageHeader>

          {/* Search + tag filter (only for queue views) */}
          {(view === "kanban" || view === "table") && (
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
            <div className="flex flex-wrap gap-1.5 items-center">
              {(assigneeFilter === 'unassigned' || priorityFilter) && (
                <Button size="sm" variant="secondary" className="h-7 px-2 text-xs gap-1" onClick={clearQueueFilters}>
                  {assigneeFilter === 'unassigned' ? 'Unassigned' : `Priority: ${priorityFilter}`}
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                size="sm"
                variant={slaOnly ? "default" : "outline"}
                className="h-7 px-2 text-xs gap-1"
                onClick={() => setSlaOnly((v) => !v)}
              >
                <TriangleAlert className="h-3.5 w-3.5" />
                SLA breached
                {breachedCount > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px]">{breachedCount}</Badge>
                )}
              </Button>
              <Link to="/admin/sla" className="text-xs text-muted-foreground underline">
                SLA policies
              </Link>
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
          )}

          <TabsContent value="kanban" className="mt-0">
            {!isBusy && tickets.length === 0 ? (
              <EmptyState
                icon={TicketIcon}
                title="No tickets yet"
                description="Tickets appear when customers reach out via contact form, email or chat. Load a demo queue to explore triage, canned responses and escalation rules."
                action={
                  <LoadDemoDataButton
                    moduleId="tickets"
                    invalidateKeys={[['tickets']]}
                    label="Load demo tickets"
                  />
                }
                secondaryAction={
                  <Button variant="outline" onClick={() => setCreateOpen(true)}>
                    New ticket
                  </Button>
                }
              />
            ) : (
              <TicketsKanban tickets={displayTickets} isLoading={isBusy} />
            )}
          </TabsContent>

          <TabsContent value="table" className="mt-0">
            <TicketsTable tickets={displayTickets} isLoading={isBusy} autoOpenTicketId={deepLinkTicketId} />
          </TabsContent>

          <TabsContent value="teams" className="mt-0">
            <TicketTeamsTab />
          </TabsContent>

          <TabsContent value="rules" className="mt-0">
            <TicketEscalationRulesTab />
          </TabsContent>

          <TabsContent value="inbound" className="mt-0">
            <div className="space-y-3 max-w-3xl">
              <p className="text-sm text-muted-foreground">
                Route inbound mail into tickets. The full mailbox registry lives in the{" "}
                <Link to="/admin/communications" className="underline">Email Router</Link> —
                this tab is a shortcut so ticket admins can adjust routing without leaving Tickets.
              </p>
              <InboundMailboxesSection emphasis="tickets" isGmailConnected={composioActive} />
            </div>
          </TabsContent>
        </Tabs>
      </AdminPageContainer>
    </AdminLayout>
  );
}
