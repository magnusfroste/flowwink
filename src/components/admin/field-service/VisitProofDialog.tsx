import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useRecordVisitProof } from '@/hooks/useFieldServiceRpc';
import type { ServiceVisit } from '@/hooks/useFieldService';
import { logger } from '@/lib/logger';

interface Props { visit: ServiceVisit | null; onClose: () => void; }

export function VisitProofDialog({ visit, onClose }: Props) {
  const proof$ = useRecordVisitProof();
  const [sig, setSig] = useState('');
  const [photos, setPhotos] = useState('');
  const [signedBy, setSignedBy] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!visit) return;
    setSig(visit.signature_url ?? '');
    const existing: string[] = ((visit as any).proof_photos ?? []) as string[];
    setPhotos(Array.isArray(existing) ? existing.join('\n') : '');
    setSignedBy((visit as any).signed_by ?? '');
    setNotes(visit.technician_notes ?? '');
  }, [visit?.id]);

  async function submit() {
    if (!visit) return;
    try {
      const photo_urls = photos.split('\n').map((s) => s.trim()).filter(Boolean);
      await proof$.mutateAsync({
        visit_id: visit.id,
        signature_url: sig || undefined,
        photo_urls: photo_urls.length ? photo_urls : undefined,
        signed_by: signedBy || undefined,
        notes: notes || undefined,
      });
      onClose();
    } catch (e) { logger.error('proof', e); }
  }

  const existingPhotos: string[] = ((visit as any)?.proof_photos ?? []) as string[];

  return (
    <Dialog open={!!visit} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Customer sign-off</DialogTitle>
          <DialogDescription>Record signature, photos, and who signed for this visit.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Signature URL</Label><Input value={sig} onChange={(e) => setSig(e.target.value)} placeholder="https://…/signature.png" /></div>
          {sig && <img src={sig} alt="signature" className="max-h-20 border rounded" />}
          <div>
            <Label>Photo URLs (one per line)</Label>
            <Textarea rows={3} value={photos} onChange={(e) => setPhotos(e.target.value)} />
            {Array.isArray(existingPhotos) && existingPhotos.length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {existingPhotos.map((u, i) => (
                  <img key={i} src={u} alt="" className="h-14 w-14 object-cover rounded border" />
                ))}
              </div>
            )}
          </div>
          <div><Label>Signed by</Label><Input value={signedBy} onChange={(e) => setSignedBy(e.target.value)} placeholder="Customer name" /></div>
          <div><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={proof$.isPending}>Save proof</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
