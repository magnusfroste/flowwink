import { describe, it, expect } from 'vitest';
import { STARTER_TEMPLATES } from '@/data/starter-templates';
import { validateTemplate } from '@/lib/template-validator';

describe('All starter templates pass validation', () => {
  STARTER_TEMPLATES.forEach((template) => {
    it(`${template.id} (${template.name}) should have no validation errors`, () => {
      const result = validateTemplate(template);
      
      if (result.errors.length > 0) {
        const errorMessages = result.errors.map(e => `  ${e.path}: ${e.message}`).join('\n');
        console.error(`\n❌ ${template.id} errors:\n${errorMessages}`);
      }
      
      if (result.warnings.length > 0) {
        const warnMessages = result.warnings.map(w => `  ${w.path}: ${w.message}`).join('\n');
        console.warn(`\n⚠️ ${template.id} warnings:\n${warnMessages}`);
      }

      expect(result.errors, `Template "${template.id}" has validation errors:\n${result.errors.map(e => `${e.path}: ${e.message}`).join('\n')}`).toHaveLength(0);
    });
  });
});
