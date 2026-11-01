import { Building2, CalendarClock, ContactRound, History, SlidersHorizontal } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { Page, PageHeader } from '@/shared/components/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/menu';
import { BriefingsTab } from './BriefingsTab';
import { ContactsTab } from './ContactsTab';
import { DeliveryLogTab } from './DeliveryLogTab';
import { DeliveryTab } from './DeliveryTab';
import { FirmPolicyTab } from './FirmPolicyTab';

/** `short` labels keep all five tabs visible on phones. */
const TABS = [
  { id: 'delivery', label: 'Delivery', short: 'Delivery', icon: SlidersHorizontal },
  { id: 'briefings', label: 'Briefings', short: 'Briefings', icon: CalendarClock },
  { id: 'contacts', label: 'Contacts', short: 'Contacts', icon: ContactRound },
  { id: 'log', label: 'Delivery log', short: 'Log', icon: History },
  { id: 'firm', label: 'Firm policy', short: 'Firm', icon: Building2 },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function NotificationsPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  // Only known tabs are honoured; anything else falls back to the first one.
  const active: TabId = TABS.find((t) => t.id === requested)?.id ?? 'delivery';

  const select = (value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', value);
        return next;
      },
      { replace: true },
    );

  return (
    <Page className="space-y-6">
      <PageHeader
        eyebrow="Notifications"
        title="Reach me where I am"
        description="Choose where alerts and briefings go, when they can wait, and what happens if nobody sees a critical one. Every message is logged."
      />
      <Tabs value={active} onValueChange={select}>
        <TabsList aria-label="Notification sections" className="w-full sm:w-auto">
          {TABS.map(({ id, label, short, icon: Icon }) => (
            <TabsTrigger key={id} value={id} aria-label={label}>
              <Icon aria-hidden className="max-sm:hidden" />
              <span className="sm:hidden">{short}</span>
              <span className="max-sm:hidden">{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="mt-6">
          <TabsContent value="delivery">
            <DeliveryTab onOpenTab={select} />
          </TabsContent>
          <TabsContent value="briefings">
            <BriefingsTab />
          </TabsContent>
          <TabsContent value="contacts">
            <ContactsTab />
          </TabsContent>
          <TabsContent value="log">
            <DeliveryLogTab />
          </TabsContent>
          <TabsContent value="firm">
            <FirmPolicyTab />
          </TabsContent>
        </div>
      </Tabs>
    </Page>
  );
}
