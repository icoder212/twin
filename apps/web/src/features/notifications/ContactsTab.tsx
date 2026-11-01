import { BadgeCheck, Plus, ShieldCheck, Smartphone, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  CHANNEL_LABELS,
  CONTACT_CHANNELS,
  formatDateTime,
  type Contact,
  type ContactChannel,
} from '@twindesk/core';
import { useTenant } from '@/features/tenant/tenant-context';
import { QueryView } from '@/shared/components/QueryView';
import { useLocale } from '@/shared/hooks/use-locale';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { ConfirmDialog } from '@/shared/ui/dialog';
import { Skeleton } from '@/shared/ui/feedback';
import { CHANNEL_ICONS } from './notify-meta';
import { useContacts, useNotificationPolicy, useRemoveContact } from './queries';
import { VerifyContactDialog } from './VerifyContactDialog';

const PURPOSE: Record<ContactChannel, string> = {
  email: 'Alerts, briefings and your daily summary in your inbox.',
  whatsapp: 'Notifications only. The number cannot take instructions, and messages are archived.',
  teams: 'A direct message from the app in Microsoft Teams, where your firm uses it.',
  sms: 'Short text messages, useful as a backup for critical alerts.',
};

export function ContactsTab() {
  const contacts = useContacts();
  const policy = useNotificationPolicy();
  const [adding, setAdding] = useState<ContactChannel | null>(null);
  const [removing, setRemoving] = useState<Contact | null>(null);
  const remove = useRemoveContact();

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Where we can reach you</CardTitle>
            <CardDescription>
              Each address is verified with a code before anything is sent to it.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <QueryView
            query={contacts}
            loading={
              <div className="space-y-2">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-20 rounded-xl" />
                ))}
              </div>
            }
          >
            {(list) => (
              <ul className="divide-y divide-line rounded-xl border border-line">
                <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <ChannelLabel
                    icon={Smartphone}
                    name="Phone push"
                    purpose="Sent to the app on phones where you are signed in."
                  />
                  <Badge tone="success" className="ml-12 self-start sm:ml-0 sm:self-center">
                    <BadgeCheck aria-hidden /> Your phone
                  </Badge>
                </li>
                {CONTACT_CHANNELS.map((channel) => {
                  const contact = list.find((c) => c.channel === channel);
                  const allowed = policy.data?.allowedChannels.includes(channel) ?? true;
                  return (
                    <li
                      key={channel}
                      className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
                    >
                      <ChannelLabel
                        icon={CHANNEL_ICONS[channel]}
                        name={CHANNEL_LABELS[channel]}
                        purpose={PURPOSE[channel]}
                        contact={contact}
                      />
                      <div className="ml-12 flex shrink-0 items-center gap-2 self-start sm:ml-0 sm:self-center">
                        {!allowed ? (
                          <Badge tone="neutral">Off for your firm</Badge>
                        ) : contact ? (
                          <>
                            <Badge tone="success">
                              <BadgeCheck aria-hidden /> Verified
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Remove ${CHANNEL_LABELS[channel]}`}
                              onClick={() => setRemoving(contact)}
                            >
                              <Trash2 />
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" onClick={() => setAdding(channel)}>
                            <Plus aria-hidden /> Add
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </QueryView>
        </CardContent>
      </Card>

      <ContactsNotes />

      <VerifyContactDialog channel={adding} onClose={() => setAdding(null)} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={removing ? `Remove ${CHANNEL_LABELS[removing.channel]}?` : 'Remove?'}
        description="Nothing more is sent there. You can add it again at any time with a new code."
        confirmLabel="Remove"
        tone="danger"
        loading={remove.isPending}
        onConfirm={() =>
          removing && remove.mutate(removing.channel, { onSettled: () => setRemoving(null) })
        }
      />
    </div>
  );
}

function ChannelLabel({
  icon: Icon,
  name,
  purpose,
  contact,
}: {
  icon: typeof Smartphone;
  name: string;
  purpose: string;
  contact?: Contact;
}) {
  const locale = useLocale();
  return (
    <div className="flex min-w-0 flex-1 gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-fg-muted">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-fg">
          {name}
          {contact ? (
            <span className="ml-2 font-mono text-[12px] font-normal text-fg-muted">
              {contact.address}
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 text-[12px] leading-snug text-fg-subtle">{purpose}</p>
        {contact ? (
          <p className="mt-1 text-[11px] text-fg-subtle">
            Verified {formatDateTime(contact.verifiedAt, locale)}
            {contact.consentAt ? ' · consent recorded' : ''}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ContactsNotes() {
  const { tenant } = useTenant();
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>How contacts are protected</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3 text-[13px] leading-relaxed text-fg-muted">
          {[
            'Addresses are stored by the server and shown here masked.',
            'A code confirms every new address. Changing one needs a new code.',
            'WhatsApp and text messages need your consent, recorded with the date. Reply STOP to turn them off.',
            `Messages never contain links that sign you in, and ${tenant.productName} never asks for your password or a code.`,
            'Every message sent is kept in the delivery log and the audit log.',
          ].map((line) => (
            <li key={line} className="flex gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-fg" aria-hidden />
              {line}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
