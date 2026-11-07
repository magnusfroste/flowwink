/**
 * A document room as its recipient sees it — on their personal link.
 * Route: /room/:token
 *
 * The database answers the list (open_document_room) and writes the access
 * log in the member's name; a file is fetched through document-share with the
 * same token, which logs view/download and refuses a download on a view-only
 * link. Nothing here carries a file URL. Not indexed: a personal link is not
 * a page.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useUiText } from '@/lib/ui-text';
import { useCustomerFormat } from '@/hooks/useCustomerFormat';
import { documentRoomFileUrl } from '@/hooks/useDocumentRooms';
import { FileText, Download, Eye, DoorClosed } from 'lucide-react';

interface RoomDocument {
  id: string;
  title: string;
  file_name: string;
  file_type: string | null;
  file_size_bytes: number | null;
  folder: string | null;
  description: string | null;
  updated_at: string;
}

interface OpenedRoom {
  ok: true;
  room: { name: string; description: string | null };
  member: { name: string; permission: 'view' | 'download'; expires_at: string | null };
  documents: RoomDocument[];
}

type Opened = OpenedRoom | { ok: false; code: 'INVALID_LINK' | 'ROOM_CLOSED' };

function formatSize(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PublicDocumentRoomPage() {
  const t = useUiText();
  const { formatDate } = useCustomerFormat();
  const { token } = useParams<{ token: string }>();
  const [opened, setOpened] = useState<Opened | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data, error } = await supabase.rpc('open_document_room' as never, {
        p_token: token,
        p_user_agent: navigator.userAgent.slice(0, 300),
      } as never);
      if (error) setFailed(true);
      else setOpened(data as Opened);
    })();
  }, [token]);

  if (!opened && !failed) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">{t('room.loading', 'Opening the room…')}</p></div>;
  }
  if (failed || !opened || !opened.ok || !token) {
    const closed = opened !== null && opened.ok === false && opened.code === 'ROOM_CLOSED';
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
        <Card className="max-w-md">
          <CardHeader><CardTitle className="flex items-center gap-2"><DoorClosed className="h-5 w-5" /> {closed ? t('room.closedTitle', 'This room is closed') : t('room.invalidTitle', 'This link does not open anything')}</CardTitle></CardHeader>
          <CardContent><p className="text-muted-foreground">{closed ? t('room.closedBody', 'The owner has closed the room. Ask them if you still need the documents.') : t('room.invalidBody', 'The link is invalid, has expired or has been revoked. Ask the person who gave it to you for a new one.')}</p></CardContent>
        </Card>
      </div>
    );
  }

  const { room, member, documents } = opened;
  const canDownload = member.permission === 'download';
  const folders = new Map<string, RoomDocument[]>();
  for (const d of documents) {
    const key = d.folder ?? '';
    folders.set(key, [...(folders.get(key) ?? []), d]);
  }

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{room.name}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="mx-auto max-w-3xl px-4 py-10 space-y-6">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('room.kicker', 'Document room')}</p>
          <h1 className="text-2xl font-semibold">{room.name}</h1>
          {room.description && <p className="text-muted-foreground">{room.description}</p>}
          <p className="text-sm text-muted-foreground">
            {t('room.openedFor', 'Opened for')} <span className="font-medium text-foreground">{member.name}</span>
            {' · '}
            {canDownload ? t('room.mayDownload', 'you may view and download') : t('room.mayView', 'you may view in the browser')}
            {member.expires_at && <> · {t('room.until', 'until')} {formatDate(member.expires_at)}</>}
          </p>
        </header>

        {!documents.length ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">{t('room.empty', 'Nothing has been placed in this room yet.')}</CardContent></Card>
        ) : (
          [...folders.entries()].map(([folder, docs]) => (
            <section key={folder || '_'} className="space-y-2">
              {folder && <h2 className="text-sm font-medium text-muted-foreground">{folder}</h2>}
              <ul className="divide-y rounded-lg border">
                {docs.map((d) => (
                  <li key={d.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-4">
                    <FileText className="hidden h-5 w-5 shrink-0 text-muted-foreground sm:block" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{d.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.file_name}{d.file_size_bytes ? ` · ${formatSize(d.file_size_bytes)}` : ''} · {formatDate(d.updated_at)}
                      </p>
                      {d.description && <p className="mt-1 text-sm text-muted-foreground">{d.description}</p>}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button asChild size="sm" variant="outline">
                        <a href={documentRoomFileUrl(token, d.id, 'view')} target="_blank" rel="noopener noreferrer"><Eye className="h-4 w-4 mr-1.5" />{t('room.view', 'View')}</a>
                      </Button>
                      {canDownload && (
                        <Button asChild size="sm">
                          <a href={documentRoomFileUrl(token, d.id, 'download')}><Download className="h-4 w-4 mr-1.5" />{t('room.download', 'Download')}</a>
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}

        <p className="text-xs text-muted-foreground">{t('room.footer', 'This link is personal. Every opening, view and download is recorded in your name.')}</p>
      </div>
    </div>
  );
}
