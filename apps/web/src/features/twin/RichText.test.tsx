import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RichText } from './RichText';

describe('RichText', () => {
  it('renders markup in model output as text, never as elements', () => {
    const { container } = render(
      <RichText text={'<img src=x onerror="alert(1)"> <script>alert(2)</script> **bold**'} />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(screen.getByText('bold').tagName).toBe('STRONG');
  });

  it('only turns retrieved citations into buttons', async () => {
    const onCitation = vi.fn();
    render(
      <RichText text="Fact [1] and invented [7]." validCitations={[1]} onCitation={onCitation} />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Source 1' }));
    expect(onCitation).toHaveBeenCalledWith(1);
    expect(screen.getByText(/invented \[7\]/)).toBeInTheDocument();
  });

  it('renders bullets and shortcut tokens without swallowing punctuation', () => {
    const { container } = render(
      <RichText text={'- Set an alert, for example /alert EURUSD 1.0900.'} />,
    );
    expect(container.querySelector('li')).not.toBeNull();
    expect(screen.getByText('/alert EURUSD 1.0900').tagName).toBe('CODE');
  });
});
