/**
 * The admin address of one record, by entity type — the one map every list
 * that links "back to the record" uses (SLA Monitor, Activities). Only
 * addresses the router and the target page actually answer: Activities used
 * to build the address by pluralising the entity type, which 404s for most
 * types.
 * Null when the type has no page of its own.
 */
export function entityLink(entityType: string | null | undefined, entityId: string | null | undefined): string | null {
  if (!entityType || !entityId) return null;
  switch (entityType) {
    case 'ticket': return `/admin/tickets?ticket=${entityId}`;
    case 'lead': return `/admin/contacts/${entityId}`;
    case 'deal': return `/admin/deals/${entityId}`;
    case 'company': return `/admin/companies/${entityId}`;
    case 'contract': return `/admin/contracts/${entityId}`;
    case 'order': return `/admin/orders?order=${entityId}`;
    case 'invoice': return `/admin/invoices?invoice=${entityId}`;
    case 'quote': return `/admin/quotes?id=${entityId}`;
    case 'project': return `/admin/projects?project=${entityId}`;
    case 'page': return `/admin/pages/${entityId}`;
    case 'blog_post': return `/admin/blog/${entityId}`;
    case 'chat': return '/admin/flowbox';
    default: return null;
  }
}
