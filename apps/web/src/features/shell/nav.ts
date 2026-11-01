import {
  Bell,
  BellRing,
  Cable,
  Inbox,
  LayoutDashboard,
  ListChecks,
  ScrollText,
  Sparkles,
  SquareSlash,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import type { FeatureKey, Permission } from '@twindesk/core';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  group: 'Desk' | 'Automate' | 'Control';
  feature?: FeatureKey;
  permission?: Permission;
  badge?: 'approvals';
  /** Keywords for the command palette. */
  keywords?: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    to: '/desk',
    label: 'Today',
    icon: LayoutDashboard,
    group: 'Desk',
    keywords: 'dashboard home routine rule watch',
  },
  {
    to: '/twin',
    label: 'Ask the twin',
    icon: Sparkles,
    group: 'Desk',
    feature: 'twin',
    keywords: 'chat question answer ai',
  },
  {
    to: '/tasks',
    label: 'Tasks',
    icon: ListChecks,
    group: 'Automate',
    feature: 'tasks',
    keywords: 'say it once schedule',
  },
  {
    to: '/workflows',
    label: 'Workflows',
    icon: Workflow,
    group: 'Automate',
    feature: 'workflows',
    keywords: 'sources destinations automation',
  },
  {
    to: '/shortcuts',
    label: 'Shortcuts',
    icon: SquareSlash,
    group: 'Automate',
    feature: 'shortcuts',
    keywords: 'slash commands',
  },
  {
    to: '/alerts',
    label: 'Alerts',
    icon: BellRing,
    group: 'Automate',
    feature: 'alerts',
    keywords: 'price loss limit release',
  },
  {
    to: '/approvals',
    label: 'Approvals',
    icon: Inbox,
    group: 'Control',
    feature: 'approvals',
    badge: 'approvals',
    keywords: 'approve send email',
  },
  {
    to: '/sources',
    label: 'Connected sources',
    icon: Cable,
    group: 'Control',
    feature: 'sources',
    keywords: 'mt5 ctrader api keys data',
  },
  {
    to: '/notifications',
    label: 'Notifications',
    icon: Bell,
    group: 'Control',
    keywords: 'whatsapp email push teams sms text briefing morning brief quiet hours escalation',
  },
  {
    to: '/audit',
    label: 'Audit log',
    icon: ScrollText,
    group: 'Control',
    feature: 'audit',
    permission: 'audit.read',
    keywords: 'logs compliance export',
  },
];

export const NAV_GROUPS: NavItem['group'][] = ['Desk', 'Automate', 'Control'];
