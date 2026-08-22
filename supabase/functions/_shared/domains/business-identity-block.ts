// Business Identity as a prompt block — the grounding every outward-writing
// AI task should carry.
//
// Found while auditing campaign generation (2026-08-14): the content_proposal
// task asked the USER to retype brand voice, audience and industry per run
// while the answers sat in site_settings.company_profile — the exact page
// sales/marketing now curate. Same gap class as the fit analysis' missing
// our_context. This loader is deliberately in _shared/domains so every task
// that writes in the company's voice (content proposals, social batches, ad
// creative, …) grounds the same way — one identity, many mouths.
//
// Soft-fail: no profile → empty string, the task still runs on the brief.

export async function loadBusinessIdentityBlock(supabase: any): Promise<string> {
  try {
    const { data } = await supabase
      .from('site_settings')
      .select('key, value')
      .in('key', ['company_profile', 'brand_tone']);
    const map: Record<string, unknown> = {};
    for (const row of data ?? []) map[row.key] = row.value;
    const cp = (map.company_profile as Record<string, unknown>) ?? {};
    if (Object.keys(cp).length === 0 && !map.brand_tone) return '';

    const join = (v: unknown) => Array.isArray(v) ? v.map(String).join(', ') : typeof v === 'string' ? v : '';
    // Named items (services, differentiators) may be strings (legacy), objects,
    // or the legacy Record form — the profile is written by agents and by two
    // editors, so the projection reads every shape rather than trusting one.
    const namedItems = (v: unknown): string => {
      const rows: string[] = [];
      const push = (name: unknown, description: unknown) => {
        const n = typeof name === 'string' ? name.trim() : '';
        if (!n) return;
        const d = typeof description === 'string' ? description.trim() : '';
        rows.push(d ? `${n} — ${d}` : n);
      };
      if (Array.isArray(v)) {
        for (const it of v) {
          if (typeof it === 'string') push(it, '');
          else if (it && typeof it === 'object') {
            const o = it as Record<string, unknown>;
            push(o.name ?? o.title ?? o.label, o.description ?? o.desc ?? o.summary);
          }
        }
      } else if (v && typeof v === 'object') {
        for (const [name, description] of Object.entries(v as Record<string, unknown>)) push(name, description);
      } else if (typeof v === 'string') {
        push(v, '');
      }
      return rows.join('; ');
    };

    // The projection is an ALLOWLIST on purpose — a field reaches no prompt
    // until it is listed here. Add new identity fields in this block (and to
    // the editor), never by widening to the whole profile object: the profile
    // also holds pricing notes, competitors and financials that must not leak
    // into outward copy by default.
    const lines: string[] = [];
    if (cp.company_name) lines.push(`Company: ${cp.company_name}`);
    if (cp.tagline) lines.push(`Tagline: ${cp.tagline}`);
    if (cp.industry) lines.push(`Industry: ${cp.industry}`);
    if (cp.business_purpose) lines.push(`Business purpose: ${cp.business_purpose}`);
    if (cp.value_proposition) lines.push(`Value proposition: ${cp.value_proposition}`);
    if (cp.icp) lines.push(`Ideal customer profile: ${cp.icp}`);
    {
      const diff = namedItems(cp.differentiators);
      if (diff) lines.push(`Differentiators (label — what it means): ${diff}`);
    }
    {
      const svc = namedItems(cp.services);
      if (svc) lines.push(`Services (name — description): ${svc}`);
    }
    if (cp.target_industries) lines.push(`Target industries: ${join(cp.target_industries)}`);

    // Numbers, held as numbers. Everything else in this block is prose, and a
    // model asked for a metric will otherwise mine it out of a sentence — the
    // exact spot where a figure gets invented, rounded or re-attributed.
    if (Array.isArray(cp.proof_points) && cp.proof_points.length) {
      const rows = (cp.proof_points as Array<Record<string, unknown>>)
        .map((pp) => {
          const value = typeof pp?.value === 'string' ? pp.value.trim() : '';
          const label = typeof pp?.label === 'string' ? pp.label.trim() : '';
          const context = typeof pp?.context === 'string' ? pp.context.trim() : '';
          if (!value && !label) return '';
          return `${[value, label].filter(Boolean).join(' ')}${context ? ` (${context})` : ''}`;
        })
        .filter(Boolean);
      if (rows.length) lines.push(`Proof points (verbatim figures — the ONLY numbers you may state): ${rows.join('; ')}`);
    }

    // Testimonials carry their attribution or none at all. A quote whose author
    // is empty is published unattributed; a named person is never invented.
    if (Array.isArray(cp.client_testimonials) && cp.client_testimonials.length) {
      const rows = (cp.client_testimonials as Array<Record<string, unknown> | string>)
        .map((t) => {
          if (typeof t === 'string') return t.trim() ? `"${t.trim()}"` : '';
          const quote = typeof t?.quote === 'string' ? t.quote.trim() : '';
          if (!quote) return '';
          const who = ['author', 'role', 'company']
            .map((k) => (typeof t?.[k] === 'string' ? (t[k] as string).trim() : ''))
            .filter(Boolean).join(', ');
          return who ? `"${quote}" — ${who}` : `"${quote}" (unattributed)`;
        })
        .filter(Boolean);
      if (rows.length) lines.push(`Client testimonials: ${rows.join(' | ')}`);
    } else if (typeof cp.client_testimonials === 'string' && cp.client_testimonials.trim()) {
      lines.push(`Client testimonials: "${cp.client_testimonials.trim()}" (unattributed)`);
    }

    // What the reader should DO. Without it every generated page ends on a
    // guess — an invented form, a made-up phone number, or nothing at all.
    {
      const cta = cp.primary_cta;
      if (typeof cta === 'string' && cta.trim()) {
        lines.push(`Primary call to action: ${cta.trim()}`);
      } else if (cta && typeof cta === 'object') {
        const o = cta as Record<string, unknown>;
        const label = typeof o.label === 'string' ? o.label.trim() : '';
        const destination = typeof o.destination === 'string' ? o.destination.trim() : '';
        const intent = typeof o.intent === 'string' ? o.intent.trim() : '';
        if (label || destination) {
          lines.push(
            `Primary call to action: ${label || destination}${destination && label ? ` → ${destination}` : ''}${intent ? ` (${intent})` : ''}`,
          );
        }
      }
    }
    if (map.brand_tone) lines.push(`Brand tone: ${typeof map.brand_tone === 'string' ? map.brand_tone : JSON.stringify(map.brand_tone)}`);
    if (lines.length === 0) return '';

    // claim_stance is a RULE about form, not a fact to recite — it governs how
    // every claim is phrased (e.g. "describe our services; never interpret
    // regulations on a customer's behalf; never imply buying us = compliance").
    // Appended after the facts so it reads as an instruction, and it must win
    // over the brief: a campaign brief cannot talk the model out of the stance.
    const stance = typeof cp.claim_stance === 'string' && cp.claim_stance.trim()
      ? `\nClaim stance (a rule about HOW claims are made — it overrides the brief): ${cp.claim_stance.trim()}`
      : '';

    // Boundaries: topics this channel must NOT answer, however well it could.
    // Not secrecy — the questions are legitimate and get answered, by a person.
    // An agent that reasons freely about network routes, ownership or named
    // competitors does damage no amount of accuracy repairs, so this is stated
    // as a refusal WITH a route, never as a gap.
    const bounds = typeof cp.boundaries === 'string' && cp.boundaries.trim()
      ? `\nOff-limits for this channel (answer by pointing to a human, never by reasoning about it — say the question is legitimate and that we answer it directly): ${cp.boundaries.trim()}`
      : '';

    return `\n\n## Company identity (Business Identity — ground everything in this)\n${lines.join('\n')}${stance}${bounds}\nWrite as this company. Never contradict the identity; when the brief leaves voice, audience or industry unspecified, derive them from here. State no figure that is not a proof point above — do not derive, round or extrapolate one from prose — and attribute no quote to a person the identity does not name. When something needed is absent, leave it out; an omission is correctable, an invention is not.`;
  } catch {
    return '';
  }
}
