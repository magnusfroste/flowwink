import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntegrationConfigPanel } from '../IntegrationsStatusPage';
import { DRAWER_KEYS } from '@/lib/integration-drawers';
import { CONFIG_BASED_KEYS } from '@/hooks/useIntegrations';

/**
 * SMTP was reachable in theory and unreachable in practice: the catalog entry
 * existed, but no card ever rendered its host field, and the panel was hidden
 * until a secret was present — which a passwordless relay (Mailpit, MailHog, an
 * internal Postfix) never has. So the one transport that needs no vendor account
 * was the one you could not configure.
 */

function renderSmtp(config = {}, onConfigChange = vi.fn()) {
  render(
    <IntegrationConfigPanel
      integrationKey="smtp"
      config={config}
      onConfigChange={onConfigChange}
      hasKey={false}
      isEnabled={false}
    />,
  );
  return onConfigChange;
}

describe('SMTP config panel', () => {
  it('renders with no secret and no prior config — the passwordless-relay case', () => {
    renderSmtp();
    expect(screen.getByLabelText(/Server host/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Port$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Implicit TLS/i)).toBeInTheDocument();
  });

  it('defaults the port to 587 rather than leaving it blank', () => {
    renderSmtp();
    expect(screen.getByLabelText(/^Port$/i)).toHaveValue(587);
  });

  it('reports the host upward so it reaches site_settings', () => {
    const onChange = renderSmtp();
    fireEvent.change(screen.getByLabelText(/Server host/i), {
      target: { value: 'mailpit.internal' },
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ host: 'mailpit.internal' }));
  });

  it('keeps existing config when one field changes', () => {
    const onChange = renderSmtp({ host: 'smtp.example.com', user: 'noreply@example.com' });
    fireEvent.change(screen.getByLabelText(/^Port$/i), { target: { value: '465' } });
    expect(onChange).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      user: 'noreply@example.com',
      port: 465,
    });
  });

  it('says the password is not stored in the card, and names the secret with its vault status', () => {
    renderSmtp();
    expect(screen.getAllByText(/SMTP_PASS/).length).toBeGreaterThan(0);
    expect(screen.getByText(/supabase secrets set SMTP_PASS/)).toBeInTheDocument();
  });

  it('offers a provider preset so the admin picks a server instead of a port', () => {
    renderSmtp();
    expect(screen.getByLabelText(/^Provider$/i)).toBeInTheDocument();
  });

  it('names the matched provider\'s password for a preset host — Cloudflare wants an API token', () => {
    renderSmtp({ host: 'smtp.mx.cloudflare.net', port: 465, secure: true, user: 'api_token' });
    expect(screen.getByText(/Email Sending: Edit/)).toBeInTheDocument();
  });

  it('carries a From identity of its own so SMTP mail does not fall back to noreply@example.com', () => {
    const onChange = renderSmtp({ host: 'smtp.mx.cloudflare.net' });
    fireEvent.change(screen.getByLabelText(/From address/i), {
      target: { value: 'info@nordbrygg.flowwink.com' },
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ fromEmail: 'info@nordbrygg.flowwink.com' }));
    expect(screen.getByLabelText(/From name/i)).toBeInTheDocument();
  });

  it('shows the vault status it is handed', () => {
    render(
      <IntegrationConfigPanel
        integrationKey="smtp"
        config={{ host: 'smtp.mx.cloudflare.net' }}
        onConfigChange={vi.fn()}
        hasKey
        isEnabled
        secretPresent={false}
      />,
    );
    expect(screen.getByText(/^missing$/)).toBeInTheDocument();
  });

  it('an unrelated secret-based integration still stays hidden without its key', () => {
    // Guards the widening: only smtp joined the always-show list.
    const { container } = render(
      <IntegrationConfigPanel
        integrationKey="openai"
        config={{}}
        onConfigChange={vi.fn()}
        hasKey={false}
        isEnabled={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('every config-based card opens its drawer — the card is the only way to enter the credential', () => {
    // The panel rendered fine in isolation while the card itself never opened
    // it: smtp was absent from DRAWER_KEYS, so "Setup needed" was a dead end.
    for (const key of CONFIG_BASED_KEYS) expect(DRAWER_KEYS).toContain(key);
  });
});
