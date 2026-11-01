import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DEMO_MFA_CODE, DEMO_PASSWORD } from '@twindesk/core/mock';
import { renderWithApp } from '@/test/render';
import { ContactsTab } from './ContactsTab';
import { DeliveryTab } from './DeliveryTab';

async function signedIn(
  ui: ReactElement,
  { email = 'alex.morgan@demo.alchmai.com', tenantId = 'alchmai' } = {},
) {
  const result = renderWithApp(ui, { tenantId });
  const login = await result.api.auth.login({ email, password: DEMO_PASSWORD });
  if (login.status !== 'mfa-required') throw new Error('expected MFA');
  await result.api.auth.verifyMfa({ challengeId: login.challengeId, code: DEMO_MFA_CODE });
  await result.queryClient.refetchQueries();
  return result;
}

describe('DeliveryTab', () => {
  it('saves a routing change and keeps the app on for every urgency', async () => {
    const user = userEvent.setup();
    const { api } = await signedIn(<DeliveryTab onOpenTab={vi.fn()} />);
    const critical = await screen.findByRole('group', {
      name: 'Channels for critical notifications',
    });
    expect(within(critical).getByRole('button', { name: /In the app/ })).toBeDisabled();

    await user.click(within(critical).getByRole('button', { name: /WhatsApp/ }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    // The form restarts from the saved settings, so the save bar goes away.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull());
    const saved = await api.notifications.preferences();
    expect(saved.routing.critical).toContain('in-app');
    expect(saved.routing.critical).not.toContain('whatsapp');
  });

  it('shows channels the firm turned off as unavailable', async () => {
    await signedIn(<DeliveryTab onOpenTab={vi.fn()} />, {
      email: 'sam.okafor@demo.alchmai.com',
      tenantId: 'meridian',
    });
    const critical = await screen.findByRole('group', {
      name: 'Channels for critical notifications',
    });
    expect(within(critical).getByRole('button', { name: /WhatsApp/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Standard/ })).toBeDisabled();
  });
});

describe('ContactsTab', () => {
  it('verifies a new number with consent and a code', async () => {
    const user = userEvent.setup();
    await signedIn(<ContactsTab />);
    const row = (await screen.findByText('Text message')).closest('li');
    if (!row) throw new Error('expected a row');
    await user.click(within(row).getByRole('button', { name: 'Add' }));

    await user.type(screen.getByLabelText('Mobile number'), '+44 7700 900456');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByText(/Confirm you agree/)).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    await user.type(await screen.findByLabelText('6-digit code'), '246810');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    expect(await within(row).findByText('Verified')).toBeInTheDocument();
    expect(within(row).getByText('+44 ••• ••0456')).toBeInTheDocument();
  });
});
