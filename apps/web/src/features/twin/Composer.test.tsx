import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApp } from '@/test/render';
import { Composer } from './Composer';

describe('Composer', () => {
  it('warns about card numbers and removes them on request', async () => {
    const user = userEvent.setup();
    renderWithApp(<Composer onSend={vi.fn()} onStop={vi.fn()} pending={false} />);
    const box = screen.getByRole('combobox', { name: /ask/i });
    await user.type(box, 'my card is 4242 4242 4242 4242');
    expect(await screen.findByText(/card number/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /remove them now/i }));
    expect(box).toHaveValue('my card is [card ending 4242]');
  });

  it('sends on Enter and keeps Shift+Enter for new lines', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    renderWithApp(<Composer onSend={onSend} onStop={vi.fn()} pending={false} />);
    const box = screen.getByRole('combobox', { name: /ask/i });
    await user.type(box, 'How close am I{Shift>}{Enter}{/Shift}to my limit?{Enter}');
    expect(onSend).toHaveBeenCalledWith('How close am I\nto my limit?');
    expect(box).toHaveValue('');
  });

  it('offers a stop button while an answer is streaming', () => {
    const onStop = vi.fn();
    renderWithApp(<Composer onSend={vi.fn()} onStop={onStop} pending />);
    expect(screen.getByRole('button', { name: /stop the answer/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^send$/i })).toBeNull();
  });
});
