import { useMemo } from 'react';
import { useSlaViolations } from '@/hooks/useSla';
import type { Ticket } from '@/hooks/useTickets';

export type TicketSlaState = 'breached' | 'due_soon' | 'ok' | 'none';

export interface TicketSlaStatus {
  state: TicketSlaState;
  dueAt: string | null;
  /** Short human label, e.g. "2h left" or "Breached 3h ago". */
  label: string;
  /** Metric the status is derived from (resolution / first_response). */
  metric?: string;
}

const CLOSED_STATUSES = new Set(['resolved', 'closed']);

function humanizeMinutes(mins: number) {
  const m = Math.abs(Math.round(mins));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/**
 * Per-ticket SLA status — READ from the sweep, never recomputed here.
 *
 * Varför den här filen inte längre räknar något:
 *
 * Det fanns två SLA-implementationer som var oense. Den här hooken räknade
 * KALENDERtimmar från created_at, ignorerade avtalsnivåns multiplikator,
 * ignorerade klockpauser, och såg bara policies med metric='resolution'.
 * `run_sla_sweep` i databasen räknade ARBETStid, pausade vid status=waiting
 * och tillämpade tier-multiplikatorn. Observerat i QA: samma ärende, samma
 * sekund, motsatta domar — admin-UI:t visade "Overdue 2d" medan svepet inte
 * hade någon brottsrad alls. Med en first_response-policy visade UI:t ingen
 * nedräkning alls förrän det plötsligt stod "Breached".
 *
 * Projektets princip är en skrivare per sanning. Svepet ÄR motorn: det äger
 * arbetstidsklockan, pauserna, tier-multiplikatorerna och vad som stoppar
 * klockan per metric. Den skriver numera sitt resultat läsbart:
 *   • `tickets.sla_deadline` + `tickets.sla_metric` — nästa klocka som
 *     fortfarande tickar (skrivs av sla_ticket_deadline(), som svepet och en
 *     trigger på tickets/ticket_comments anropar, så värdet finns från
 *     sekund ett och inte först efter nästa svep)
 *   • `sla_violations` — det som redan brustit
 *
 * Den här hooken gör därför bara tre saker: läser brottet, läser deadlinen,
 * och räknar ner. Ingen policy-, tier- eller kalenderlogik får flytta tillbaka
 * hit — då är vi tillbaka i två motorer som ljuger olika.
 */
export function useTicketSlaMap(tickets: Ticket[]) {
  const { data: violations = [] } = useSlaViolations({ resolved: false, entity_type: 'ticket' });

  return useMemo(() => {
    const breachedIds = new Map<string, { metric: string; minutes: number }>();
    violations.forEach((v) => {
      if (!breachedIds.has(v.entity_id)) {
        breachedIds.set(v.entity_id, { metric: v.metric, minutes: v.actual_minutes - v.threshold_minutes });
      }
    });

    const map = new Map<string, TicketSlaStatus>();
    const now = Date.now();

    tickets.forEach((t) => {
      const violation = breachedIds.get(t.id);
      if (violation) {
        map.set(t.id, {
          state: 'breached',
          dueAt: null,
          metric: violation.metric,
          label: `Breached by ${humanizeMinutes(violation.minutes)}`,
        });
        return;
      }

      // No running clock. For a closed ticket that means every clock stopped in
      // time; for an open one it means no policy covers it.
      if (!t.sla_deadline) {
        map.set(t.id, {
          state: 'none',
          dueAt: null,
          label: CLOSED_STATUSES.has(t.status) ? 'Met' : 'No SLA',
        });
        return;
      }

      const dueAt = new Date(t.sla_deadline).getTime();
      const minutesLeft = (dueAt - now) / 60_000;
      const metric = t.sla_metric ?? undefined;
      const iso = new Date(dueAt).toISOString();

      if (minutesLeft <= 0) {
        // Klockan har passerat deadlinen men svepet har inte hunnit skriva
        // brottet ännu (det kör var 15:e minut). "Due" — inte "Breached":
        // bara svepet får uttala sig om brott, annars är vi två domare igen.
        map.set(t.id, {
          state: 'breached',
          dueAt: iso,
          metric,
          label: `Due ${humanizeMinutes(minutesLeft)} ago`,
        });
      } else if (minutesLeft <= 120) {
        map.set(t.id, { state: 'due_soon', dueAt: iso, metric, label: `${humanizeMinutes(minutesLeft)} left` });
      } else {
        map.set(t.id, { state: 'ok', dueAt: iso, metric, label: `${humanizeMinutes(minutesLeft)} left` });
      }
    });

    return map;
  }, [tickets, violations]);
}
