/**
 * A skill parameter's enum is a promise about the column it filters. browse_products
 * offered type ∈ {physical, digital, service}; product_type is {one_time,
 * recurring}; every typed browse died on the cast (Nordbrygg, 2026-10-31).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('browse_products filters on values product_type has', () => {
  it('its type enum is exactly the database enum', () => {
    const baseline = readFileSync('supabase/migrations/00000000000000_baseline.sql', 'utf8');
    const m = baseline.match(/CREATE TYPE "public"\."product_type" AS ENUM \(([^)]*)\)/);
    expect(m).not.toBeNull();
    const dbValues = [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
    const mod = readFileSync('src/lib/modules/products-module.ts', 'utf8');
    const skill = mod.slice(mod.indexOf("name: 'browse_products'"), mod.indexOf("name: 'manage_product'"));
    const e = skill.match(/type: \{\s*type: 'string',[\s\S]*?enum: \[([\s\S]*?)\]/);
    expect(e).not.toBeNull();
    const skillValues = [...e![1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
    expect(skillValues).toEqual(dbValues);
  });
});
