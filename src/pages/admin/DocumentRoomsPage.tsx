/**
 * Document rooms — a named collection of documents and who may see it.
 * Route: /admin/documents/rooms[?room=<id>]
 *
 * The room points at documents that stay where they are; a recipient gets a
 * PERSONAL link (view or download, optional expiry) and the access log reads
 * in their name. Peter's backlog (optic, 2026-11-05): Board room, legal
 * counsel, a partner — without duplicating the source data.
 */
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageContainer } from "@/components/admin/AdminPageContainer";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDocuments } from "@/hooks/useDocuments";
import {
  useDocumentRooms,
  useDocumentRoom,
  useManageDocumentRoom,
  documentRoomUrl,
  type DocumentRoomMember,
  type DocumentRoomSummary,
} from "@/hooks/useDocumentRooms";
import { usePlatformFormat } from "@/hooks/usePlatformFormat";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Plus, FileText, Trash2, Copy, Ban, DoorOpen, Users, History, Pencil } from "lucide-react";

function formatSize(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentRoomsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("room");
  const select = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("room", id); else next.delete("room");
    setParams(next, { replace: true });
  };
  const { data: rooms, isLoading } = useDocumentRooms();
  const manage = useManageDocumentRoom();
  const [newOpen, setNewOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "", description: "" });

  const createRoom = async () => {
    const res = (await manage.mutateAsync({ action: "create", name: draft.name, description: draft.description || null })) as { room?: { id: string } };
    setNewOpen(false);
    setDraft({ name: "", description: "" });
    if (res.room?.id) select(res.room.id);
  };

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Document rooms"
          description="A named set of documents and who may see it — the files stay where they are, every recipient gets a personal link, and the log names who opened what."
          backAction={{ label: "Documents", onClick: () => navigate("/admin/documents") }}
        >
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New room
          </Button>
        </AdminPageHeader>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <aside className="w-full shrink-0 space-y-2 lg:w-72">
            {isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : !rooms?.length ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  <DoorOpen className="mx-auto mb-3 h-10 w-10 opacity-50" />
                  No rooms yet. A room is for a board, a lawyer, a partner — anyone who should see a set of documents and nothing else.
                </CardContent>
              </Card>
            ) : (
              rooms.map((r) => <RoomCard key={r.id} room={r} selected={r.id === selectedId} onSelect={() => select(r.id)} />)
            )}
          </aside>
          <div className="min-w-0 flex-1">
            {selectedId ? (
              <RoomDetail roomId={selectedId} onDeleted={() => select(null)} />
            ) : (
              <Card>
                <CardContent className="py-16 text-center text-sm text-muted-foreground">
                  Pick a room to see its documents, its members and who opened what.
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New room</DialogTitle>
              <DialogDescription>Name it for who it is for — "Board room", "Legal counsel", "Partner: Stokab".</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus />
              </div>
              <div>
                <Label>Purpose</Label>
                <Textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={3} placeholder="What the recipients are here to read. Shown to them." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
              <Button onClick={createRoom} disabled={draft.name.trim().length < 2 || manage.isPending}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AdminPageContainer>
    </AdminLayout>
  );
}

function RoomCard({ room, selected, onSelect }: { room: DocumentRoomSummary; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/50",
        selected && "border-primary bg-muted/40",
        !room.is_active && "opacity-60",
      )}
    >
      <div className="flex items-center gap-2">
        <DoorOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{room.name}</span>
        {!room.is_active && <Badge variant="outline" className="text-[10px]">closed</Badge>}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {room.document_count} {room.document_count === 1 ? "document" : "documents"} · {room.member_count} {room.member_count === 1 ? "member" : "members"}
      </p>
    </button>
  );
}

function RoomDetail({ roomId, onDeleted }: { roomId: string; onDeleted: () => void }) {
  const { formatDateTime } = usePlatformFormat();
  const { data, isLoading } = useDocumentRoom(roomId);
  const manage = useManageDocumentRoom();
  const { data: allDocuments = [] } = useDocuments("all");
  const [pickOpen, setPickOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState({ name: "", description: "" });
  const [memberOpen, setMemberOpen] = useState(false);
  const [member, setMember] = useState<{ name: string; email: string; permission: "view" | "download"; days: string }>({ name: "", email: "", permission: "view", days: "" });

  const inRoom = useMemo(() => new Set((data?.documents ?? []).map((d) => d.id)), [data]);
  const candidates = useMemo(() => allDocuments.filter((d) => !inRoom.has(d.id)), [allDocuments, inRoom]);

  if (isLoading || !data) return <Skeleton className="h-64 w-full" />;
  const { room, documents, members, recent_access } = data;

  const copyLink = (m: DocumentRoomMember) => {
    navigator.clipboard.writeText(documentRoomUrl(m.token)).then(
      () => toast.success(`Link for ${m.name} copied — hand it to them only`),
      () => toast.error("Could not copy"),
    );
  };

  const addMember = async () => {
    const days = member.days ? Number(member.days) : null;
    const expires = days && days > 0 ? new Date(Date.now() + days * 86400_000).toISOString() : null;
    const res = (await manage.mutateAsync({
      action: "add_member", room_id: roomId, member_name: member.name, member_email: member.email || null,
      permission: member.permission, expires_at: expires,
    })) as { member?: DocumentRoomMember };
    setMemberOpen(false);
    setMember({ name: "", email: "", permission: "view", days: "" });
    if (res.member) copyLink(res.member);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-4">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              {room.name}
              {!room.is_active && <Badge variant="outline">closed</Badge>}
            </CardTitle>
            {room.description && <p className="mt-1 text-sm text-muted-foreground">{room.description}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={room.is_active} onCheckedChange={(v) => manage.mutate({ action: "update", room_id: roomId, is_active: v })} aria-label="Room open" />
              {room.is_active ? "Open" : "Closed"}
            </label>
            <Button variant="ghost" size="icon" aria-label="Edit room" onClick={() => { setEdit({ name: room.name, description: room.description ?? "" }); setEditOpen(true); }}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost" size="icon" className="text-destructive" aria-label="Delete room"
              onClick={() => {
                if (confirm(`Delete the room "${room.name}"? The documents are untouched; every member link stops working.`)) {
                  manage.mutate({ action: "delete", room_id: roomId }, { onSuccess: onDeleted });
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4 text-muted-foreground" /> Documents ({documents.length})</CardTitle>
          <Popover open={pickOpen} onOpenChange={setPickOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1.5" /> Add document</Button>
            </PopoverTrigger>
            <PopoverContent className="w-96 p-0" align="end">
              <Command>
                <CommandInput placeholder="Search documents…" />
                <CommandList>
                  <CommandEmpty>Nothing to add — every document you can see is already here.</CommandEmpty>
                  <CommandGroup>
                    {candidates.map((d) => (
                      <CommandItem
                        key={d.id}
                        value={`${d.title} ${d.file_name} ${d.folder ?? ""}`}
                        onSelect={() => { manage.mutate({ action: "add_documents", room_id: roomId, document_id: d.id }); setPickOpen(false); }}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm">{d.title}</p>
                          <p className="truncate text-xs text-muted-foreground">{d.folder ? `${d.folder} · ` : ""}{d.file_name}</p>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </CardHeader>
        <CardContent>
          {!documents.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Empty room. Add the documents the recipients should see.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Folder</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <p className="font-medium">{d.title}</p>
                      <p className="text-xs text-muted-foreground">{d.file_name}</p>
                    </TableCell>
                    <TableCell className="text-sm">{d.folder || "—"}</TableCell>
                    <TableCell className="text-sm">{formatSize(d.file_size_bytes)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Remove from room" title="Remove from the room — the document stays in Documents"
                        onClick={() => manage.mutate({ action: "remove_document", room_id: roomId, document_id: d.id })}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4 text-muted-foreground" /> Members ({members.filter((m) => !m.revoked_at).length})</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setMemberOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> Add member</Button>
        </CardHeader>
        <CardContent>
          {!members.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nobody yet. A member gets a personal link; the log reads in their name.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>May</TableHead>
                  <TableHead>Opened</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => {
                  const expired = !!m.expires_at && new Date(m.expires_at) < new Date();
                  const live = !m.revoked_at && !expired;
                  return (
                    <TableRow key={m.id} className={cn(!live && "opacity-60")}>
                      <TableCell>
                        <p className="font-medium">{m.name}</p>
                        <p className="text-xs text-muted-foreground">{m.email || "—"}</p>
                      </TableCell>
                      <TableCell><Badge variant="outline">{m.permission}</Badge></TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {m.access_count}×{m.last_accessed_at ? ` · ${formatDateTime(m.last_accessed_at)}` : ""}
                      </TableCell>
                      <TableCell className="text-sm">
                        {m.revoked_at ? <Badge variant="destructive">revoked</Badge> : expired ? <Badge variant="destructive">expired</Badge> : m.expires_at ? formatDateTime(m.expires_at, { hour: undefined, minute: undefined }) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {live && (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Copy personal link" title="Copy this member's personal link" onClick={() => copyLink(m)}>
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label="Revoke link" title="Revoke — the link stops working now"
                              onClick={() => manage.mutate({ action: "revoke_member", room_id: roomId, member_id: m.id })}>
                              <Ban className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4 text-muted-foreground" /> Access log</CardTitle>
        </CardHeader>
        <CardContent>
          {!recent_access.length ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nobody has opened the room yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {recent_access.map((a, i) => (
                <li key={i} className="flex flex-wrap items-center gap-x-2 py-1.5">
                  <span className="w-40 shrink-0 text-xs text-muted-foreground tabular-nums">{formatDateTime(a.at)}</span>
                  <span className="font-medium">{a.member}</span>
                  <span className="text-muted-foreground">{a.action === "open" ? "opened the room" : a.action === "download" ? "downloaded" : "viewed"}</span>
                  {a.document && <span className="truncate">{a.document}</span>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit room</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
            <div><Label>Purpose</Label><Textarea rows={3} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button disabled={edit.name.trim().length < 2} onClick={() => { manage.mutate({ action: "update", room_id: roomId, name: edit.name, description: edit.description }); setEditOpen(false); }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={memberOpen} onOpenChange={setMemberOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add member</DialogTitle>
            <DialogDescription>One link per person. Nothing is sent — you copy the link and hand it over yourself.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={member.name} onChange={(e) => setMember({ ...member, name: e.target.value })} autoFocus /></div>
            <div><Label>E-mail (for your records)</Label><Input type="email" value={member.email} onChange={(e) => setMember({ ...member, email: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>May</Label>
                <Select value={member.permission} onValueChange={(v) => setMember({ ...member, permission: v as "view" | "download" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="view">View in the browser</SelectItem>
                    <SelectItem value="download">View and download</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Expires in (days)</Label>
                <Input type="number" min="1" placeholder="Never" value={member.days} onChange={(e) => setMember({ ...member, days: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberOpen(false)}>Cancel</Button>
            <Button disabled={!member.name.trim() || manage.isPending} onClick={addMember}>Add and copy link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
