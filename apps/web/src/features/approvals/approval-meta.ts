import { CalendarPlus, Headset, Mail, MessageSquare, Stamp, type LucideIcon } from 'lucide-react';
import type { ApprovalKind } from '@twindesk/core';

export const APPROVAL_KINDS: Record<
  ApprovalKind,
  { label: string; icon: LucideIcon; action: string }
> = {
  email: { label: 'Email', icon: Mail, action: 'Approve and send' },
  message: { label: 'Message', icon: MessageSquare, action: 'Approve and send' },
  'calendar-invite': {
    label: 'Calendar invite',
    icon: CalendarPlus,
    action: 'Approve and send invite',
  },
  'support-reply': { label: 'Support reply', icon: Headset, action: 'Approve and send reply' },
  'payout-check': { label: 'Payout check', icon: Stamp, action: 'Approve payout check' },
};
