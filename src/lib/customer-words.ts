/**
 * The words a customer reads for a stored value — a ticket's status, a
 * service's state, a billing interval. The admin's maps are English labels
 * for staff; these go through the visitor texts, so the portal follows the
 * site's language. Each call spells its key out: the catalogue reads them
 * from the source (a file that names `useUiText`, whose function `t` is).
 */
export type Words = (key: string, fallback: string) => string;

export function ticketStatusWord(status: string, t: Words): string {
  if (status === 'new') return t('ticket.status.new', 'New');
  if (status === 'open') return t('ticket.status.open', 'Open');
  if (status === 'in_progress') return t('ticket.status.inProgress', 'In progress');
  if (status === 'waiting') return t('ticket.status.waiting', 'Waiting');
  if (status === 'resolved') return t('ticket.status.resolved', 'Resolved');
  if (status === 'closed') return t('ticket.status.closed', 'Closed');
  return status;
}

export function ticketPriorityWord(priority: string, t: Words): string {
  if (priority === 'low') return t('ticket.priority.low', 'Low');
  if (priority === 'medium') return t('ticket.priority.medium', 'Medium');
  if (priority === 'high') return t('ticket.priority.high', 'High');
  if (priority === 'urgent') return t('ticket.priority.urgent', 'Urgent');
  return priority;
}

export function ticketCategoryWord(category: string, t: Words): string {
  if (category === 'bug') return t('ticket.category.bug', 'Something is not working');
  if (category === 'feature') return t('ticket.category.feature', 'A wish');
  if (category === 'question') return t('ticket.category.question', 'Question');
  if (category === 'billing') return t('ticket.category.billing', 'Billing');
  if (category === 'other') return t('ticket.category.other', 'Other');
  return category;
}

export function serviceStatusWord(status: string, t: Words): string {
  if (status === 'active') return t('service.status.active', 'Active');
  if (status === 'provisioning') return t('service.status.provisioning', 'Being set up');
  if (status === 'trialing') return t('service.status.trialing', 'Trial');
  if (status === 'past_due') return t('service.status.pastDue', 'Payment due');
  if (status === 'canceled') return t('service.status.canceled', 'Ended');
  return status;
}

/** "/ month" after a price. */
export function billingIntervalWord(interval: string, t: Words): string {
  if (interval === 'day') return t('billing.interval.day', 'day');
  if (interval === 'week') return t('billing.interval.week', 'week');
  if (interval === 'month') return t('billing.interval.month', 'month');
  if (interval === 'quarter') return t('billing.interval.quarter', 'quarter');
  if (interval === 'year') return t('billing.interval.year', 'year');
  return interval;
}

/** Where an order is: paid, then the four steps of its way to the customer. */
export function orderStepWord(step: string, t: Words): string {
  if (step === 'paid') return t('account.orders.paid', 'Paid');
  if (step === 'pending') return t('account.orders.pending', 'Pending');
  if (step === 'failed') return t('account.orders.failed', 'Failed');
  if (step === 'refunded') return t('account.orders.refunded', 'Refunded');
  if (step === 'picked') return t('account.orders.picked', 'Picked');
  if (step === 'packed') return t('account.orders.packed', 'Packed');
  if (step === 'shipped') return t('account.orders.shipped', 'Shipped');
  if (step === 'delivered') return t('account.orders.delivered', 'Delivered');
  return step;
}
