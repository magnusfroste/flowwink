import { Bot, Briefcase, ShieldCheck, UserCircle } from 'lucide-react';

/**
 * Every link the person menu offers. It is about YOU — your profile, your
 * security, your employment, your agents — so every one of them must open for
 * every role (a guardrail checks it against the route gate). Organisation
 * settings live in the Admin group of the sidebar, never here: "Settings"
 * used to sit in this menu, pointed at Site Settings, and denied everyone
 * but admins.
 */
export const PERSON_MENU_LINKS = [
  { to: '/admin/profile', label: 'My profile', icon: UserCircle },
  { to: '/admin/profile#security', label: 'Password & two-factor', icon: ShieldCheck },
  { to: '/admin/agents', label: 'My agents & keys', icon: Bot },
] as const;

/** Your own employment — leave, payslips, contract, expenses — when you are an employee. */
export const MY_EMPLOYMENT_LINK = { to: '/account/leave', label: 'My employment', icon: Briefcase } as const;
