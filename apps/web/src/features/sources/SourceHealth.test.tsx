import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ConnectedSource, SourceCheck } from '@twindesk/core';
import { renderWithApp } from '@/test/render';
import { SourceCard } from './SourceCard';

const retrying: ConnectedSource = {
  id: 'src_ctrader',
  provider: 'ctrader',
  name: 'cTrader',
  category: 'platform',
  description: 'Trades and account state.',
  status: 'connected',
  authMethod: 'oauth',
  access: 'read-only',
  scopes: [],
  lastSyncAt: new Date().toISOString(),
  staleAfterHours: 2,
  alertOnDisconnect: true,
  health: {
    successRate24h: 88,
    hourly: [...Array<SourceCheck>(19).fill('ok'), 'slow', 'slow', 'failed', 'failed', 'failed'],
    latencyMs: 2400,
    retry: { attempt: 2, maxAttempts: 5, nextAt: new Date().toISOString() },
  },
};

describe('SourceCard health', () => {
  it('summarises the 24-hour history in words, not colour alone', () => {
    renderWithApp(<SourceCard source={retrying} onConnect={() => undefined} />);
    expect(
      screen.getByRole('img', { name: '21 of 24 hourly checks succeeded, 2 slow, 3 failed.' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText(/Retrying, attempt 2 of 5/)).toBeInTheDocument();
    expect(screen.getByText('2.4 s')).toBeInTheDocument();
    // Without source management access the alert setting is shown, not offered.
    expect(screen.getByText('Disconnect alerts are on')).toBeInTheDocument();
  });
});
