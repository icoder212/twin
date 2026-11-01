import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import type { TwinDeskApi } from '@twindesk/core';
import { DEMO_MFA_CODE, DEMO_PASSWORD } from '@twindesk/core/mock';
import { renderWithApp } from '@/test/render';
import { BriefingsTab } from './BriefingsTab';
import { DeliveryLogTab } from './DeliveryLogTab';

/** Signs in through the mock API, then refetches the queries that ran signed out. */
async function signedIn(ui: ReactElement) {
  const result = renderWithApp(ui);
  await signIn(result.api);
  await result.queryClient.refetchQueries();
  return result;
}

async function signIn(api: TwinDeskApi) {
  const login = await api.auth.login({
    email: 'alex.morgan@demo.alchmai.com',
    password: DEMO_PASSWORD,
  });
  if (login.status !== 'mfa-required') throw new Error('expected MFA');
  await api.auth.verifyMfa({ challengeId: login.challengeId, code: DEMO_MFA_CODE });
}

describe('DeliveryLogTab', () => {
  it('acknowledges a notification and removes its button', async () => {
    const user = userEvent.setup();
    await signedIn(<DeliveryLogTab />);
    const button = await screen.findByRole('button', {
      name: 'Acknowledge “Release in 10 minutes”',
    });
    const item = button.closest('li');
    if (!item) throw new Error('expected a list item');
    await user.click(button);
    expect(
      await within(item).findByText(/Acknowledged \d{2}:\d{2} via the app/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Acknowledge/ })).toBeNull();
  });

  it('filters by urgency and shows each delivery with minimal wording', async () => {
    const user = userEvent.setup();
    await signedIn(<DeliveryLogTab />);
    await screen.findByText('Release in 10 minutes');
    await user.selectOptions(screen.getByLabelText('Urgency'), 'critical');
    expect(screen.queryByText('Release in 10 minutes')).toBeNull();
    expect(screen.getByText('Data warehouse stopped fetching')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Details for/ }));
    const table = screen.getByRole('table', { name: /Deliveries for NT-X2C5VJ/ });
    expect(within(table).getAllByText('Escalation').length).toBeGreaterThan(0);
    expect(within(table).getByText('Risk desk')).toBeInTheDocument();
    // Minimal wording keeps the details inside the app.
    expect(screen.getAllByText('Data source alert').length).toBeGreaterThan(0);
  });
});

describe('BriefingsTab', () => {
  it('keeps Save disabled until something changes', async () => {
    const user = userEvent.setup();
    await signedIn(<BriefingsTab />);
    const card = (await screen.findByRole('heading', { name: 'Morning brief' })).closest('section');
    if (!card) throw new Error('expected the morning brief card');
    const save = within(card).getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await user.click(within(card).getByRole('button', { name: 'Saturday' }));
    expect(save).toBeEnabled();
    // Text messages are allowed by the firm but not verified yet.
    expect(within(card).getByRole('link', { name: 'Verify Text message first' })).toHaveAttribute(
      'href',
      '/?tab=contacts',
    );
  });
});
