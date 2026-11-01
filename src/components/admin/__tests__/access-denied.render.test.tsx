/**
 * The deny screen, rendered: the refused path on screen, a dashboard link, a
 * sign-out door that fires. The guardrail test reads the source; this one
 * reads what a colleague sees.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AccessDenied } from '../AccessDenied';

describe('AccessDenied', () => {
  it('names the refused path and links to the dashboard', () => {
    render(
      <MemoryRouter>
        <AccessDenied reason="route" pathname="/admin/flowchat" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Access Denied' })).toBeInTheDocument();
    expect(screen.getByText('/admin/flowchat')).toBeInTheDocument();
    expect(screen.getByText(/Users → Roles/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to dashboard' })).toHaveAttribute('href', '/admin');
    expect(screen.queryByRole('button', { name: 'Switch account' })).toBeNull();
  });

  it('sends a non-staff account to the portal and offers sign-out', () => {
    const onSignOut = vi.fn();
    render(
      <MemoryRouter>
        <AccessDenied reason="not-staff" onSignOut={onSignOut} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Go to customer portal' })).toHaveAttribute('href', '/account');
    fireEvent.click(screen.getByRole('button', { name: 'Switch account' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
