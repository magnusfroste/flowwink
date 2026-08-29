import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LinkifiedText } from '@/components/ui/linkified-text';

const show = (text: string) =>
  render(<MemoryRouter><LinkifiedText text={text} /></MemoryRouter>);

describe('LinkifiedText renderar på riktigt', () => {
  it('samma origin blir en router-länk (relativ href, ingen ny flik)', () => {
    const url = `${window.location.origin}/admin/wiki/MoteRedeye`;
    show(`Teamets reflektioner finns i wikin : ${url}`);
    const a = screen.getByRole('link');
    expect(a.getAttribute('href')).toBe('/admin/wiki/MoteRedeye');
    expect(a.getAttribute('target')).toBeNull();
    expect(a.textContent).toBe(url);
  });

  it('extern länk öppnas i ny flik utan referrer', () => {
    show('Se https://redeye.se/analys för underlaget');
    const a = screen.getByRole('link');
    expect(a.getAttribute('href')).toBe('https://redeye.se/analys');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noreferrer');
  });

  it('punkten efter adressen hör till meningen', () => {
    show('Underlaget ligger på https://redeye.se/analys.');
    expect(screen.getByRole('link').getAttribute('href')).toBe('https://redeye.se/analys');
    expect(document.body.textContent).toContain('analys.');
  });

  it('text utan länk lämnas orörd', () => {
    show('Bara en vanlig anteckning');
    expect(screen.queryByRole('link')).toBeNull();
  });
});
