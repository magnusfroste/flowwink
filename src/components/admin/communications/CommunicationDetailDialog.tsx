import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export type CommMetadata = {
  tags?: Record<string, string | undefined>;
  sent_by?: string;
  [key: string]: unknown;
};

export type Comm = {
  id: string;
  channel: string;
  status: string;
  direction: "inbound" | "outbound";
  provider: string | null;
  simulated: boolean;
  recipient: string;
  sender: string | null;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  source: string | null;
  thread_id: string | null;
  error_message: string | null;
  metadata: CommMetadata | null;
  created_at: string;
  sent_at: string | null;
};

export function CommunicationDetailDialog({
  comm,
  onOpenChange,
}: {
  comm: Comm | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!comm} onOpenChange={(v) => !v && onOpenChange(false)}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{comm?.subject ?? "Message"}</DialogTitle>
        </DialogHeader>
        {comm && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Direction" value={comm.direction} />
              <Field label="Channel" value={comm.channel} />
              <Field label="From" value={comm.sender ?? (comm.direction === "outbound" ? "(this mailbox)" : "—")} />
              <Field label="To" value={comm.recipient} />
              <Field label="Status" value={comm.status} />
              <Field label="Provider" value={comm.simulated ? "simulated" : (comm.provider ?? "—")} />
              <Field label="Source" value={comm.source ?? "—"} />
              <Field label="When" value={new Date(comm.created_at).toLocaleString()} />
            </div>
            {comm.error_message && (
              <div className="rounded-md bg-destructive/10 text-destructive p-3 text-sm">
                {comm.error_message}
              </div>
            )}
            {comm.body_html && (
              <div>
                <div className="text-xs uppercase text-muted-foreground mb-1">Preview</div>
                <div className="border rounded-md p-4 bg-card max-h-96 overflow-y-auto"
                     dangerouslySetInnerHTML={{ __html: comm.body_html }} />
              </div>
            )}
            {!comm.body_html && comm.body_text && (
              <pre className="border rounded-md p-4 bg-muted text-sm whitespace-pre-wrap">{comm.body_text}</pre>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
