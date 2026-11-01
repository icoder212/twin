import {
  Bell,
  Info,
  Mail,
  MessageCircle,
  MessageSquareText,
  OctagonAlert,
  Smartphone,
  TriangleAlert,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import type { DeliveryChannel, DeliveryStatus, Tone, Urgency } from '@twindesk/core';

/** Generic icons only: channels are named in text, never shown with a third party's logo. */
export const CHANNEL_ICONS: Record<DeliveryChannel, LucideIcon> = {
  'in-app': Bell,
  push: Smartphone,
  email: Mail,
  whatsapp: MessageCircle,
  teams: UsersRound,
  sms: MessageSquareText,
};

export const URGENCY_META: Record<Urgency, { tone: Tone; icon: LucideIcon }> = {
  info: { tone: 'info', icon: Info },
  important: { tone: 'warning', icon: TriangleAlert },
  critical: { tone: 'danger', icon: OctagonAlert },
};

export const DELIVERY_STATUS_META: Record<DeliveryStatus, { label: string; tone: Tone }> = {
  delivered: { label: 'Delivered', tone: 'success' },
  read: { label: 'Read', tone: 'success' },
  held: { label: 'Held', tone: 'warning' },
  skipped: { label: 'Skipped', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'danger' },
};

export const WEEKDAYS = [
  { day: 1, short: 'Mon', long: 'Monday' },
  { day: 2, short: 'Tue', long: 'Tuesday' },
  { day: 3, short: 'Wed', long: 'Wednesday' },
  { day: 4, short: 'Thu', long: 'Thursday' },
  { day: 5, short: 'Fri', long: 'Friday' },
  { day: 6, short: 'Sat', long: 'Saturday' },
  { day: 0, short: 'Sun', long: 'Sunday' },
] as const;
