/**
 * The /account pages that are a staff member's own — an employee's self-service,
 * a manager's team, their agents. Staff without a customer role may open these
 * and only these (AccountLayout sends them to /admin for the rest).
 */
export const STAFF_SELF_SERVICE_PATHS = [
  '/account/leave', '/account/expenses', '/account/attendance', '/account/performance',
  '/account/skills', '/account/contracts', '/account/payslips', '/account/team', '/account/agents',
] as const;

export function isStaffSelfService(pathname: string): boolean {
  return STAFF_SELF_SERVICE_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}
