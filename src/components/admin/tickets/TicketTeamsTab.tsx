import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, UserPlus, X } from "lucide-react";
import {
  useTicketTeams, useCreateTicketTeam, useUpdateTicketTeam, useDeleteTicketTeam,
  useTicketTeamMembers, useAddTeamMember, useRemoveTeamMember,
} from "@/hooks/useTicketTeams";

export function TicketTeamsTab() {
  const { data: teams = [] } = useTicketTeams();
  const createTeam = useCreateTicketTeam();
  const updateTeam = useUpdateTicketTeam();
  const deleteTeam = useDeleteTicketTeam();

  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr,1.5fr] gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Teams</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 border border-border rounded-md p-3 bg-muted/30">
            <Input placeholder="Team name" value={newName} onChange={(e) => setNewName(e.target.value)} className="h-8 text-sm" />
            <Textarea placeholder="Description (optional)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={2} className="text-sm" />
            <Button
              size="sm"
              disabled={!newName.trim() || createTeam.isPending}
              onClick={() => {
                createTeam.mutate(
                  { name: newName.trim(), description: newDesc.trim() || undefined },
                  { onSuccess: () => { setNewName(""); setNewDesc(""); } }
                );
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Create team
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.map((t) => (
                <TableRow
                  key={t.id}
                  className={`cursor-pointer ${selectedTeamId === t.id ? "bg-muted/50" : ""}`}
                  onClick={() => setSelectedTeamId(t.id)}
                >
                  <TableCell>
                    <div className="font-medium text-sm">{t.name}</div>
                    {t.description && <div className="text-xs text-muted-foreground">{t.description}</div>}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={t.is_active}
                      onCheckedChange={(v) => updateTeam.mutate({ id: t.id, is_active: v })}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => { e.stopPropagation(); if (confirm(`Delete team ${t.name}?`)) deleteTeam.mutate(t.id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {teams.length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center text-xs text-muted-foreground">No teams yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selectedTeamId ? (
        <TeamMembersPanel teamId={selectedTeamId} teamName={teams.find(t => t.id === selectedTeamId)?.name ?? ""} />
      ) : (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Select a team to manage its members.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TeamMembersPanel({ teamId, teamName }: { teamId: string; teamName: string }) {
  const { data: members = [] } = useTicketTeamMembers(teamId);
  const addMember = useAddTeamMember();
  const removeMember = useRemoveTeamMember();
  const [userId, setUserId] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Members — {teamName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="User UUID"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="h-8 text-sm font-mono"
          />
          <Button
            size="sm"
            disabled={!userId.trim() || addMember.isPending}
            onClick={() => addMember.mutate(
              { team_id: teamId, user_id: userId.trim() },
              { onSuccess: () => setUserId("") }
            )}
          >
            <UserPlus className="h-3.5 w-3.5 mr-1" /> Add
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Paste a user UUID (from the profiles table). A picker will be added when the users directory ships.
        </p>
        <div className="space-y-1.5">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <div className="font-mono text-xs">{m.user_id}</div>
              <div className="flex items-center gap-2">
                {m.is_lead && <Badge variant="secondary" className="text-[10px]">Lead</Badge>}
                <Button size="icon" variant="ghost" onClick={() => removeMember.mutate({ id: m.id, team_id: teamId })}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
          {members.length === 0 && <div className="text-xs text-muted-foreground py-6 text-center">No members yet</div>}
        </div>
      </CardContent>
    </Card>
  );
}
