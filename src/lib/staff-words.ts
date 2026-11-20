/**
 * The words an employee reads for a stored value on their own pages — a leave
 * request's status and type, an expense's category, a contract's state. They
 * go through the visitor texts, so the pages follow the site's language. Each
 * call spells its key out: the catalogue reads them from the source (a file
 * that names `useUiText`, whose function `t` is). A value nobody has named
 * here is shown as it is stored.
 */
export type Words = (key: string, fallback: string) => string;

/** "1 day" / "3 days". */
export function daysWord(count: number, t: Words): string {
  const phrase = count === 1
    ? t('staff.common.dayOne', '{count} day')
    : t('staff.common.dayMany', '{count} days');
  return phrase.replace('{count}', String(count));
}

export function leaveTypeWord(type: string, t: Words): string {
  if (type === 'vacation') return t('staff.leave.type.vacation', 'Vacation');
  if (type === 'sick') return t('staff.leave.type.sick', 'Sick leave');
  if (type === 'parental') return t('staff.leave.type.parental', 'Parental');
  if (type === 'other') return t('staff.leave.type.other', 'Other');
  return type;
}

export function leaveStatusWord(status: string, t: Words): string {
  if (status === 'pending') return t('staff.leave.status.pending', 'Pending review');
  if (status === 'approved') return t('staff.leave.status.approved', 'Approved');
  if (status === 'denied') return t('staff.leave.status.denied', 'Denied');
  if (status === 'rejected') return t('staff.leave.status.rejected', 'Rejected');
  if (status === 'cancelled') return t('staff.leave.status.cancelled', 'Cancelled');
  return status;
}

export function expenseStatusWord(status: string, t: Words): string {
  if (status === 'draft') return t('staff.expenses.status.draft', 'Draft');
  if (status === 'submitted') return t('staff.expenses.status.submitted', 'Submitted');
  if (status === 'approved') return t('staff.expenses.status.approved', 'Approved');
  if (status === 'rejected') return t('staff.expenses.status.rejected', 'Rejected');
  if (status === 'booked') return t('staff.expenses.status.booked', 'Booked');
  if (status === 'paid') return t('staff.expenses.status.paid', 'Paid');
  return status;
}

export function expenseCategoryWord(category: string, t: Words): string {
  if (category === 'travel') return t('staff.expenses.category.travel', 'Travel');
  if (category === 'meals') return t('staff.expenses.category.meals', 'Meals');
  if (category === 'lodging') return t('staff.expenses.category.lodging', 'Lodging');
  if (category === 'supplies') return t('staff.expenses.category.supplies', 'Supplies');
  if (category === 'software') return t('staff.expenses.category.software', 'Software');
  if (category === 'other') return t('staff.expenses.category.other', 'Other');
  return category;
}

export function payslipStatusWord(status: string, t: Words): string {
  if (status === 'draft') return t('staff.payslips.status.draft', 'Draft');
  if (status === 'approved') return t('staff.payslips.status.approved', 'Approved');
  if (status === 'paid') return t('staff.payslips.status.paid', 'Paid');
  if (status === 'cancelled') return t('staff.payslips.status.cancelled', 'Cancelled');
  return status;
}

export function contractStatusWord(status: string, t: Words): string {
  if (status === 'draft') return t('staff.contracts.status.draft', 'Draft');
  if (status === 'sent') return t('staff.contracts.status.sent', 'To sign');
  if (status === 'signed') return t('staff.contracts.status.signed', 'Signed');
  if (status === 'active') return t('staff.contracts.status.active', 'Active');
  if (status === 'terminated') return t('staff.contracts.status.terminated', 'Terminated');
  if (status === 'expired') return t('staff.contracts.status.expired', 'Expired');
  return status;
}

export function employmentTypeWord(type: string, t: Words): string {
  if (type === 'full_time') return t('staff.contracts.type.fullTime', 'Full time');
  if (type === 'part_time') return t('staff.contracts.type.partTime', 'Part time');
  if (type === 'contractor') return t('staff.contracts.type.contractor', 'Contractor');
  return type;
}

/** A person's state at work, as a manager reads it in the team list. */
export function employeeStatusWord(status: string, t: Words): string {
  if (status === 'active') return t('staff.team.status.active', 'Active');
  if (status === 'on_leave') return t('staff.team.status.onLeave', 'On leave');
  if (status === 'terminated') return t('staff.team.status.terminated', 'Terminated');
  return status.replace('_', ' ');
}

export function goalCategoryWord(category: string, t: Words): string {
  if (category === 'professional') return t('staff.performance.category.professional', 'Professional');
  if (category === 'personal') return t('staff.performance.category.personal', 'Personal');
  if (category === 'skill') return t('staff.performance.category.skill', 'Skill');
  if (category === 'business') return t('staff.performance.category.business', 'Business');
  return category;
}

export function meetingStatusWord(status: string, t: Words): string {
  if (status === 'scheduled') return t('staff.performance.meeting.scheduled', 'Scheduled');
  if (status === 'completed') return t('staff.performance.meeting.completed', 'Completed');
  if (status === 'cancelled') return t('staff.performance.meeting.cancelled', 'Cancelled');
  return status;
}

export function reviewStatusWord(status: string, t: Words): string {
  if (status === 'draft') return t('staff.performance.review.draft', 'Draft');
  if (status === 'employee_review') return t('staff.performance.review.employeeReview', 'Awaiting your acknowledgement');
  if (status === 'completed') return t('staff.performance.review.completed', 'Completed');
  if (status === 'acknowledged') return t('staff.performance.review.acknowledged', 'Acknowledged');
  return status;
}

/** The heading of a review: "Annual review". */
export function reviewPeriodWord(periodType: string, t: Words): string {
  if (periodType === 'annual') return t('staff.performance.period.annual', 'Annual review');
  if (periodType === 'quarterly') return t('staff.performance.period.quarterly', 'Quarterly review');
  if (periodType === 'probation') return t('staff.performance.period.probation', 'Probation review');
  if (periodType === 'ad_hoc') return t('staff.performance.period.adHoc', 'Ad-hoc review');
  return t('staff.performance.period.other', '{type} review').replace('{type}', periodType);
}

/** A line on the payslip: what kind of pay it is. */
export function payComponentWord(type: string, t: Words): string {
  if (type === 'salary') return t('staff.payslip.type.salary', 'Salary');
  if (type === 'benefit') return t('staff.payslip.type.benefit', 'Benefit');
  if (type === 'deduction') return t('staff.payslip.type.deduction', 'Deduction');
  if (type === 'bonus') return t('staff.payslip.type.bonus', 'Bonus');
  if (type === 'overtime') return t('staff.payslip.type.overtime', 'Overtime');
  return type;
}

/** Worked time, from minutes: "8 h 30 min". */
export function durationWord(minutes: number | null | undefined, t: Words): string {
  if (minutes == null) return '–';
  const whole = Math.max(0, Math.round(minutes));
  const h = Math.floor(whole / 60);
  const m = whole % 60;
  if (h === 0) return t('staff.common.minutes', '{minutes} min').replace('{minutes}', String(m));
  return t('staff.common.hoursMinutes', '{hours} h {minutes} min').replace('{hours}', String(h)).replace('{minutes}', String(m));
}
