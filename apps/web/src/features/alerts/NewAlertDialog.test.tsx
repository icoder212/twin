import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DEMO_MFA_CODE, DEMO_PASSWORD } from '@twindesk/core/mock';
import { renderWithApp } from '@/test/render';
import { NewAlertDialog } from './NewAlertDialog';

type Api = ReturnType<typeof renderWithApp>['api'];

async function signIn(api: Api) {
  const result = await api.auth.login({
    email: 'alex.morgan@demo.alchmai.com',
    password: DEMO_PASSWORD,
  });
  if (result.status !== 'mfa-required') throw new Error('expected MFA');
  await api.auth.verifyMfa({ challengeId: result.challengeId, code: DEMO_MFA_CODE });
}

async function openDialog(tenantId = 'alchmai') {
  const view = renderWithApp(<div />, { tenantId });
  await signIn(view.api);
  view.rerender(<NewAlertDialog open onOpenChange={() => undefined} initialKind="price" />);
  // The form waits for the delivery settings before it appears.
  await screen.findByRole('radio', { name: /critical/i, hidden: true });
  return view;
}

// A channel's accessible name is its label followed by any note, e.g. "WhatsApp Off for your firm".
const channel = (name: string) =>
  screen.getByRole('checkbox', { name: new RegExp(`^${name}`), hidden: true });

describe('NewAlertDialog', () => {
  it('ticks channels from the delivery settings and sends the chosen urgency', async () => {
    const user = userEvent.setup();
    const { api } = await openDialog();

    expect(channel('In the app')).toBeChecked();
    expect(channel('In the app')).toBeDisabled();
    expect(channel('Phone push')).toBeChecked();
    expect(channel('WhatsApp')).not.toBeChecked();

    await user.click(screen.getByRole('radio', { name: /critical/i, hidden: true }));
    expect(channel('WhatsApp')).toBeChecked();
    expect(channel('Microsoft Teams')).toBeChecked();
    expect(channel('Microsoft Teams')).toHaveAccessibleDescription('Not verified yet');

    await user.type(screen.getByLabelText('Instrument'), 'eurgbp');
    await user.type(screen.getByLabelText('Level'), '0.8600');
    await user.click(screen.getByRole('button', { name: 'Set alert', hidden: true }));

    await waitFor(async () => {
      const alert = (await api.alerts.list()).find((a) => a.instrument === 'EURGBP');
      expect(alert).toMatchObject({ urgency: 'critical' });
      expect(alert?.channels).toEqual(['in-app', 'push', 'email', 'whatsapp', 'teams']);
    });
  });

  it('disables channels the firm has turned off', async () => {
    await openDialog('meridian');
    const whatsapp = channel('WhatsApp');
    expect(whatsapp).toBeDisabled();
    expect(whatsapp).toHaveAccessibleDescription('Off for your firm');
    const sms = channel('Text message');
    expect(within(sms.closest('label')!).getByText('Off for your firm')).toBeInTheDocument();
  });
});
