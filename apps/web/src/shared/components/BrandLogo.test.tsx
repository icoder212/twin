import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderWithApp } from '@/test/render';
import { BrandLogo } from './BrandLogo';

describe('BrandLogo', () => {
  afterEach(() => localStorage.clear());

  it('shows the full logo made for the current colour scheme', () => {
    localStorage.setItem('twindesk.scheme', 'light');
    renderWithApp(<BrandLogo showProduct />);
    expect(screen.getByRole('img', { name: 'AlchmAI' })).toHaveAttribute(
      'src',
      '/brand/alchmai/logo-on-light.png',
    );
    expect(screen.getByText('Desk Twin')).toBeInTheDocument();
  });

  it('falls back to the text wordmark when the logo cannot load', () => {
    localStorage.setItem('twindesk.scheme', 'dark');
    renderWithApp(<BrandLogo />);
    const logo = screen.getByRole('img', { name: 'AlchmAI' });
    expect(logo).toHaveAttribute('src', '/brand/alchmai/logo-on-dark.png');
    fireEvent.error(logo);
    expect(screen.queryByRole('img', { name: 'AlchmAI' })).toBeNull();
    expect(screen.getByText('Alchm')).toBeInTheDocument();
  });

  it('uses the text wordmark for tenants without a logo', () => {
    renderWithApp(<BrandLogo />, { tenantId: 'northbridge' });
    expect(screen.getByText('Northbridge')).toBeInTheDocument();
  });
});
