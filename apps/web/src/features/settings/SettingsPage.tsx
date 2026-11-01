import { Database, Layers, Palette, UserRound, Briefcase } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { env } from '@/app/env';
import { useAuth } from '@/features/auth/use-auth';
import { Page, PageHeader } from '@/shared/components/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/menu';
import { AppearanceTab } from './AppearanceTab';
import { DeskTab } from './DeskTab';
import { PrivacyTab } from './PrivacyTab';
import { ProfileTab } from './ProfileTab';
import { WhiteLabelTab } from './WhiteLabelTab';

const ALL_TABS = [
  { id: 'profile', label: 'Profile and security', icon: UserRound },
  { id: 'desk', label: 'Desk', icon: Briefcase },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'white-label', label: 'White-label', icon: Layers },
  { id: 'privacy', label: 'Data and privacy', icon: Database },
] as const;

type TabId = (typeof ALL_TABS)[number]['id'];

export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const { can } = useAuth();
  const showWhiteLabel = env.demoMode || can('tenant.configure');
  const tabs = ALL_TABS.filter((t) => t.id !== 'white-label' || showWhiteLabel);
  const requested = params.get('tab');
  // Only known, permitted tabs are honoured; anything else falls back to the first tab.
  const active: TabId = tabs.find((t) => t.id === requested)?.id ?? 'profile';

  return (
    <Page className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Your desk, your controls"
        description="Profile, security, how the twin is set up for your desk, and how your data is handled."
      />
      <Tabs
        value={active}
        onValueChange={(value) =>
          setParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              next.set('tab', value);
              return next;
            },
            { replace: true },
          )
        }
      >
        <TabsList aria-label="Settings sections" className="w-full sm:w-auto">
          {tabs.map(({ id, label, icon: Icon }) => (
            <TabsTrigger key={id} value={id}>
              <Icon aria-hidden />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="mt-6">
          <TabsContent value="profile">
            <ProfileTab />
          </TabsContent>
          <TabsContent value="desk">
            <DeskTab />
          </TabsContent>
          <TabsContent value="appearance">
            <AppearanceTab />
          </TabsContent>
          {showWhiteLabel ? (
            <TabsContent value="white-label">
              <WhiteLabelTab />
            </TabsContent>
          ) : null}
          <TabsContent value="privacy">
            <PrivacyTab />
          </TabsContent>
        </div>
      </Tabs>
    </Page>
  );
}
