---
title: "Workspaces — Accounting, HR, Sales, Support"
description: The four kinds of work that get their own left menu in the admin — what each menu holds, how the FlowWink sidebar folds and comes back, who sees a workspace and who does not, and why there is no setting for any of it.
category: operators
---

# Workspaces

Most of the admin is a list of modules: Pages, Blog, Leads, Orders. That is
right for a site owner who touches each now and then. It is wrong for the
person who does the books all day, or runs HR, sales or support: their work
is a sequence — *what needs doing, the day to day, the month, the reports* —
and the module list makes them hunt for it.

So four kinds of work are **workspaces**. Opening one swaps the left menu for
that work's own.

| Workspace | Opens from | Menu sections |
|---|---|---|
| **Accounting** | `/admin/accounting` and its pages (invoices, expenses, bank, payroll, fixed assets…) | To do · Day to day · Month · Reports · Year & authorities · Setup |
| **HR** | `/admin/hr` and its pages (employees, leave, timesheets, recruitment…) | To do (*Start here — guides*, recruitment, approvals) · People · Time & leave · Pay · Development |
| **Sales** | `/admin/deals`, contacts, leads, companies, activities, pipelines, Customer 360 | Pipeline · Selling · Insight · Setup |
| **Support** | `/admin/tickets`, Flowbox, SLA | Inbox · Customers · Knowledge · Quality |

A detail page keeps its workspace: a company opened from the sales menu is
still in Sales. A page two workspaces share (the calendar, approvals) stays in
the one you came from.

## The sidebar folds, and comes back

Inside a workspace the FlowWink sidebar folds to a rail of icons on the far
left — one click opens it, one click folds it again. **Whether you keep it
folded is remembered per person, in your browser.** It is your gesture, not a
setting: there is nothing to configure, and nothing an admin can set for
someone else.

## Who sees a workspace

The role matrix decides, as everywhere. A workspace is only offered to a role
that has its modules: an accountant gets Accounting, an HR person gets HR, a
salesperson gets Sales. Admins get all four.

**Employees who are none of those never see them.** An employee's own
expenses, timesheets, leave, payslips, reviews and skills live under
**My account** — the person menu — beside their orders if they are also a
customer. Their everyday work does not pass through the accountant's or HR's
screens, and the accountant's menu is not cluttered with what belongs to
everyone.

## Every page is still a module page

A workspace is a menu, not a copy. `/admin/invoices` in the accounting
workspace is the invoicing module's page; its skills (`manage_invoice`,
`list_invoices`…) are the ones FlowChat, Flowwork, FlowPilot and an external
agent run. Switching a module off removes its entries from every workspace
menu; nothing else changes.

## For builders

The menus are data: `src/lib/workspaces.ts` holds one definition per
workspace (sections, items, the module each item needs, the detail-page
prefixes that keep the workspace active). The shell reads the person's roles
and the enabled modules and shows what applies. Adding a page to a workspace
is one line there; a guardrail test checks every item names a real route and
a real module.
