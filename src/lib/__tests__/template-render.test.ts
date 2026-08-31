/**
 * The one substitution engine for email templates — sections included.
 *
 * The rule under test is the language rule (docs/architecture/language.md
 * §Email templates): ALL language lives in the template text, the sender sends
 * only data. `{{#notes}}…{{/notes}}` is what makes a labelled, conditional box
 * expressible IN the template — before it, booking_confirmation prerendered
 * the whole box in code with a hardcoded English "Your note:" label.
 */
import { describe, it, expect } from 'vitest';
import { renderTemplate } from '../../../supabase/functions/_shared/template-render';
import { renderTokens, detectTokens, buildSampleValues } from '../email-preview';

describe('renderTemplate', () => {
  it('substitutes plain tokens, unknown keys render empty', () => {
    expect(renderTemplate('Hi {{name}}, re {{missing}}!', { name: 'Anna' })).toBe('Hi Anna, re !');
  });

  it('tolerates whitespace and dots/hyphens in tokens (email-send legacy charset)', () => {
    expect(renderTemplate('{{ a.b-c }}', { 'a.b-c': 'x' })).toBe('x');
  });

  it('keeps a section when the variable is non-empty', () => {
    const tpl = 'before {{#notes}}<strong>Din anteckning:</strong> {{notes}}{{/notes}} after';
    expect(renderTemplate(tpl, { notes: 'ring mig' })).toBe(
      'before <strong>Din anteckning:</strong> ring mig after',
    );
  });

  it('drops the whole section — label included — when the variable is empty or missing', () => {
    const tpl = 'before {{#notes}}<strong>Your note:</strong> {{notes}}{{/notes}}after';
    expect(renderTemplate(tpl, { notes: '' })).toBe('before after');
    expect(renderTemplate(tpl, {})).toBe('before after');
  });

  it('handles several independent sections in one template', () => {
    const tpl = '{{#a}}A={{a}}{{/a}}|{{#b}}B={{b}}{{/b}}';
    expect(renderTemplate(tpl, { a: '1' })).toBe('A=1|');
    expect(renderTemplate(tpl, { a: '1', b: '2' })).toBe('A=1|B=2');
  });

  it('spans newlines — templates are multi-line HTML', () => {
    expect(renderTemplate('{{#x}}\nline\n{{/x}}', { x: 'y' })).toBe('\nline\n');
    expect(renderTemplate('{{#x}}\nline\n{{/x}}', {})).toBe('');
  });

  it('legacy {{notes_block}} keeps working as a plain token (backward compat)', () => {
    expect(renderTemplate('{{notes_block}}', { notes_block: '<div>x</div>' })).toBe('<div>x</div>');
    expect(renderTemplate('{{notes_block}}', { notes_block: '' })).toBe('');
  });
});

describe('admin preview uses the same engine', () => {
  it('renderTokens strips section markers exactly like the sender', () => {
    const tpl = '{{#notes}}<strong>Your note:</strong> {{notes}}{{/notes}}';
    expect(renderTokens(tpl, { notes: 'hej' })).not.toContain('{{#notes}}');
    expect(renderTokens(tpl, { notes: 'hej' })).toContain('hej');
    expect(renderTokens(tpl, {})).toBe('');
  });

  it('detectTokens sees the inner variable, not the markers, so the sample fills the section', () => {
    const tpl = 'a {{#notes}}{{notes}}{{/notes}} {{site_name}}';
    const tokens = detectTokens(tpl);
    expect(tokens).toContain('notes');
    expect(tokens).toContain('site_name');
    expect(tokens).not.toContain('#notes');
    const rendered = renderTokens(tpl, buildSampleValues(tokens));
    expect(rendered).not.toContain('{{');
  });
});
