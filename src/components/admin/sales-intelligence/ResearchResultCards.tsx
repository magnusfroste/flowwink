import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Building2,
  Users,
  MessageSquare,
  CheckCircle2,
  ExternalLink,
  Mail,
} from "lucide-react";
import { SendEmailDialog } from "@/components/admin/crm/SendEmailDialog";
import type { ResearchResult } from "./types";
import { ProvenanceLine } from '@/components/ui/provenance-line';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';

interface ResearchResultCardsProps {
  result: ResearchResult;
}

/**
 * Multi-threading without batch machinery: the seller picks WHO gets outreach
 * by composing per contact — each send passes its own verify gate and
 * suppression check in SendEmailDialog. Verification costs a Hunter credit
 * per address, so "choose your targets" is also the budget gate.
 */
function ContactRow({ contact, companyName }: {
  contact: ResearchResult["contacts"][number];
  companyName?: string;
}) {
  const [composeOpen, setComposeOpen] = useState(false);
  const meta = [contact.position, contact.seniority].filter(Boolean).join(" · ");

  return (
    <div className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50">
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">
          {contact.name || "Unknown"}
          {contact.seniority === "executive" && (
            <Badge variant="default" className="ml-2 text-[10px] align-middle">executive</Badge>
          )}
          {contact.type === "generic" && (
            <Badge variant="outline" className="ml-2 text-[10px] align-middle">generic address</Badge>
          )}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {contact.email}
          {meta && <span> · {meta}</span>}
          {typeof contact.confidence === "number" && <span> · {contact.confidence}%</span>}
        </p>
      </div>
      <Button size="sm" variant="ghost" className="gap-1.5 shrink-0" onClick={() => setComposeOpen(true)}>
        <Mail className="h-3.5 w-3.5" />
        Compose
      </Button>
      <SendEmailDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        recipientEmail={contact.email}
        recipientName={contact.name || undefined}
        leadId={contact.id}
        leadContext={{
          name: contact.name || undefined,
          email: contact.email,
          role: contact.position ?? undefined,
          company_name: companyName,
        }}
      />
    </div>
  );
}

export function ResearchResultCards({ result }: ResearchResultCardsProps) {
  const { formatDateTime } = usePlatformFormat();
  return (
    <div className="space-y-4">
      {/* CRM Status */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        Company and contacts saved to CRM automatically
      </div>

      {/* Company Summary */}
      {result.company_summary && (
        <Card>
          <CardHeader className="pb-3 space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              {result.company_summary.name || result.company.name}
              {result.company_summary.industry && (
                <Badge variant="secondary" className="text-xs font-normal">
                  {result.company_summary.industry}
                </Badge>
              )}
            </CardTitle>
            {result.read_from && (
              <ProvenanceLine>
                Read from {result.read_from.url ? new URL(result.read_from.url).hostname.replace(/^www\./, '') : 'their site'} on{' '}
                {formatDateTime(result.read_from.fetched_at, { hour: undefined, minute: undefined })} — distilled by AI, not verified.
              </ProvenanceLine>
            )}
            {result.company_summary.size_estimate && (
              <CardDescription>Size: {result.company_summary.size_estimate}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {result.company_summary.main_offerings && result.company_summary.main_offerings.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Main Offerings</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.company_summary.main_offerings.map((o, i) => (
                    <Badge key={i} variant="outline" className="text-xs font-normal">{o}</Badge>
                  ))}
                </div>
              </div>
            )}
            {result.company_summary.potential_pain_points && result.company_summary.potential_pain_points.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Potential Pain Points</p>
                <ul className="text-sm space-y-1">
                  {result.company_summary.potential_pain_points.map((p, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.company.domain && (
              <a
                href={`https://${result.company.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                {result.company.domain}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </CardContent>
        </Card>
      )}

      {/* Contacts Found */}
      {(result.contacts?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Contacts Found
              <Badge variant="default" className="text-xs">{result.hunter_contacts_found}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {result.contacts?.map((contact) => (
                <ContactRow
                  key={contact.id}
                  contact={contact}
                  companyName={result.company_summary?.name || result.company?.name}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Qualifying Questions */}
      {(result.questions_and_answers?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Qualifying Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[500px]">
              <div className="space-y-4">
                {result.questions_and_answers?.map((qa, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{qa.question}</p>
                      <Badge
                        variant={qa.relevance_score >= 7 ? "default" : qa.relevance_score >= 4 ? "secondary" : "outline"}
                        className="text-xs shrink-0"
                      >
                        {qa.relevance_score}/10
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{qa.answer}</p>
                    {i < (result.questions_and_answers?.length ?? 0) - 1 && <Separator />}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
