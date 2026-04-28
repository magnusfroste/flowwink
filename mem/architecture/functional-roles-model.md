---
name: Functional Roles Model
description: Odoo-style one-level functional roles per user. Multi-role via user_roles rows. Admin sees all. MCP unchanged.
type: feature
---

## Model
- **One-level functional roles** (no user/manager split). Manager-rights handled separately on `employees` if needed.
- Roles in `app_role` enum: `admin`, `customer`, `sales`, `hr`, `accounting`, `support`, `warehouse`, `marketing`, `purchasing`, `projects`. Plus deprecated `writer`/`approver`.
- A user can have **multiple roles** — one row per role in `user_roles`.
- `admin` always sees everything (super-role). Other roles are additive.

## Navigation gating
- `NavGroup.allowedRoles?: AppRole[]` and `NavItem.allowedRoles?: AppRole[]` filter the admin sidebar.
- Admin bypasses all gates. Group with no `allowedRoles` and no `adminOnly` is visible to any authenticated user (Main, Content, Setup).
- Filter logic in `src/components/admin/AdminSidebar.tsx` uses `useAuth().hasAnyRole()`.

## useAuth API
- `roles: AppRole[]` — all assigned roles
- `role: AppRole | null` — primary (admin if present, else first)
- `hasRole(r)`, `hasAnyRole(rs)` — admin always returns true
- `isAdmin` — strict admin check
- `isWriter`/`isApprover` — **deprecated**, return true for any authenticated user with roles / for admin. Kept so existing CMS publish-flow gates don't break.

## MCP / agents — unchanged
Skills exposure is module-based, not role-based. External peers (Jan Bergman etc.) operate at system level. Do NOT add role scoping to api_keys.

## Writer/Approver legacy
Removed from CreateUserDialog and UsersPage UI. Existing rows kept in DB and treated as admin-equivalent for backwards compat. Future: migrate to `admin` and drop enum values once safe.

## Adding a new functional role
1. `ALTER TYPE app_role ADD VALUE 'foo'` (idempotent migration)
2. Add to `AppRole` union + `FUNCTIONAL_ROLES` + `ROLE_LABELS` + `ROLE_DESCRIPTIONS` in `src/types/cms.ts`
3. Set `allowedRoles: ['foo']` on relevant nav groups/items
4. Add option to `CreateUserDialog`
