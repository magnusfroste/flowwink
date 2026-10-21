import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { planImport, readImageHeader, WEB_MAX_WIDTH, MAX_MEGAPIXELS } from '../../../supabase/functions/_shared/media/import-plan.ts';
import { mediaModule } from '../modules/media-module';

/**
 * Guardrail: an image an agent imports arrives web-sized, or the import says
 * why not.
 *
 * Synclair, 2026-10-19: media_browse import_from_url stored an 8014×4500 px,
 * 7 MB PNG texture as it was and handed back its URL; the agent wrote it into
 * the site and every page view downloads it since. The import had a 15 MB cap
 * and nothing else to say. The easy path has to be the right one: the URL an
 * agent gets back is the one pages should carry.
 */
const root = join(__dirname, '../../..');

/** A PNG header: signature + IHDR with the given size and colour type. */
function png(width: number, height: number, colourType: number): Uint8Array {
  const b = new Uint8Array(40);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  b[24] = 8; b[25] = colourType;
  return b;
}
/** A JPEG header: SOI, an APP0 segment, then SOF0 with the given size. */
function jpeg(width: number, height: number): Uint8Array {
  const app0 = [0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const sof0 = [0xff, 0xc0, 0, 17, 8, height >> 8, height & 0xff, width >> 8, width & 0xff, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof0, 0xff, 0xd9]);
}

describe('imported images arrive web-sized', () => {
  it('reads dimensions from the header without decoding', () => {
    expect(readImageHeader(png(8014, 4500, 6), 'image/png')).toEqual({ width: 8014, height: 4500, hasAlpha: true });
    expect(readImageHeader(png(800, 600, 2), 'image/png')).toEqual({ width: 800, height: 600, hasAlpha: false });
    expect(readImageHeader(jpeg(3000, 2000), 'image/jpeg')).toEqual({ width: 3000, height: 2000, hasAlpha: false });
    expect(readImageHeader(new Uint8Array([1, 2, 3]), 'image/png')).toBeNull();
  });

  it("the synclair texture — 8014×4500, 7 MB — is refused, and the refusal says what to send instead", () => {
    const plan = planImport({ bytes: 7_064_046, contentType: 'image/png', header: readImageHeader(png(8014, 4500, 6), 'image/png') });
    expect(plan.verdict).toBe('refuse');
    expect(plan.reason).toMatch(/8014×4500/);
    expect(plan.reason).toMatch(/36 Mpx/);
    expect(plan.reason).toMatch(new RegExp(`Resize to ≤ ${WEB_MAX_WIDTH} px`));
    expect(plan.reason).toMatch(/never in custom_scripts/);
    expect(MAX_MEGAPIXELS).toBeLessThanOrEqual(16); // decode ≈ 4 bytes/px on the edge
  });

  it('a big photo gets a web-sized JPEG copy; a big transparent PNG keeps its alpha', () => {
    const photo = planImport({ bytes: 2_100_000, contentType: 'image/jpeg', header: readImageHeader(jpeg(3000, 2000), 'image/jpeg') });
    expect(photo).toMatchObject({ verdict: 'optimize', targetWidth: WEB_MAX_WIDTH, format: 'jpeg' });
    const texture = planImport({ bytes: 900_000, contentType: 'image/png', header: readImageHeader(png(2400, 1200, 6), 'image/png') });
    expect(texture).toMatchObject({ verdict: 'optimize', targetWidth: WEB_MAX_WIDTH, format: 'png' });
    // small but heavy (an unoptimized 1200 px PNG) is still copied — bytes are what visitors pay
    const heavy = planImport({ bytes: 650_000, contentType: 'image/png', header: readImageHeader(png(1200, 800, 2), 'image/png') });
    expect(heavy).toMatchObject({ verdict: 'optimize', targetWidth: 1200, format: 'jpeg' });
  });

  it("a WebP the edge cannot resize is refused above the same trigger PNG/JPEG would be resized at, and the refusal names the alternative; below it, kept", () => {
    // synclair 2026-10-21: four 3200 px webps of 0.4–2.9 MB went straight onto 26 dividers with "imported".
    const big = planImport({ bytes: 2_886_000, contentType: 'image/webp', header: { width: 3200, height: 1800, hasAlpha: true } });
    expect(big.verdict).toBe('refuse');
    expect(big.reason).toMatch(/cannot resize image\/webp/);
    expect(big.reason).toMatch(/PNG \(transparency\) or JPEG \(photo\)/);
    expect(big.reason).toMatch(/pixel-gradient/);
    const wide = planImport({ bytes: 180_000, contentType: 'image/webp', header: { width: 3200, height: 900, hasAlpha: false } });
    expect(wide.verdict).toBe('refuse');
    const small = planImport({ bytes: 120_000, contentType: 'image/webp', header: { width: 1200, height: 675, hasAlpha: false } });
    expect(small.verdict).toBe('keep');
    expect(small.reason).toMatch(/already web-sized/);
  });

  it('what is already web-sized, vector or animated is kept as it is', () => {
    expect(planImport({ bytes: 120_000, contentType: 'image/jpeg', header: readImageHeader(jpeg(1200, 800), 'image/jpeg') }).verdict).toBe('keep');
    expect(planImport({ bytes: 30_000, contentType: 'image/svg+xml', header: null }).verdict).toBe('keep');
    expect(planImport({ bytes: 3_000_000, contentType: 'image/gif', header: { width: 4000, height: 3000, hasAlpha: null } }).verdict).toBe('keep');
    expect(planImport({ bytes: 16 * 1024 * 1024, contentType: 'image/jpeg', header: readImageHeader(jpeg(1000, 1000), 'image/jpeg') }).verdict).toBe('refuse');
  });

  it('upload (base64) is the same road as import_from_url — a file an agent was handed needs no public URL first', () => {
    // synclair 2026-10-20: the brand texture, resized locally to 1600 px,
    // could not get into the library — import_from_url needs a URL and the
    // agent had bytes. Two doors, one plan: upload decodes base64 and joins
    // the import path before the plan is made.
    const ae = readFileSync(join(root, 'supabase/functions/agent-execute/index.ts'), 'utf8');
    const start = ae.indexOf("if (action === 'import_from_url' || action === 'upload')");
    expect(start).toBeGreaterThan(-1);
    const block = ae.slice(start, ae.indexOf("if (action === 'list')", start));
    expect(block).toMatch(/content_base64/);
    expect(block).toMatch(/upload requires "mime_type" of an image or an mp4\/webm video/);
    expect(block).toMatch(/atob\(/);
    expect(block.indexOf('planImport(')).toBeGreaterThan(block.indexOf('atob('));
    expect(block).toMatch(/\$\{action\} refused: \$\{plan\.reason\}/);
    expect(block).not.toMatch(/source_url: url\b/);

    const seed = mediaModule.skillSeeds.find((s) => s.name === 'media_browse')!;
    const props = (seed.tool_definition as { function: { parameters: { properties: Record<string, { enum?: string[]; description?: string }> } } }).function.parameters.properties;
    expect(props.action.enum).toContain('upload');
    expect(props.content_base64.description).toMatch(/base64/);
    expect(props.mime_type).toBeTruthy();
    expect(seed.instructions).toMatch(/never paste a file into custom_scripts or a data: URL/);
  });

  it('the handler plans before it stores, answers with the web copy as url, and the skill says so', () => {
    const ae = readFileSync(join(root, 'supabase/functions/agent-execute/index.ts'), 'utf8');
    const start = ae.indexOf("if (action === 'import_from_url' || action === 'upload')");
    const block = ae.slice(start, ae.indexOf("if (action === 'list')", start));
    expect(block.indexOf('planImport(')).toBeGreaterThan(-1);
    expect(block.indexOf('planImport(')).toBeLessThan(block.indexOf(".from('cms-images')\n          .upload(path"));
    expect(block).toMatch(/url: webUrl, path: webPath/);
    expect(block).toMatch(/original_url: publicUrl/);
    expect(block).toMatch(/\.optimize !== false/);
    expect(block).toMatch(/plan\.format === 'png' \? await resized\.encode\(\) : await resized\.encodeJPEG\(82\)/);

    const seed = mediaModule.skillSeeds.find((s) => s.name === 'media_browse')!;
    const props = (seed.tool_definition as { function: { parameters: { properties: Record<string, { description?: string }> } } }).function.parameters.properties;
    expect(props.optimize).toBeTruthy();
    expect(props.url.description).toMatch(/web-sized copy/);
    expect(seed.instructions).toMatch(/Put `url` in blocks/);
    expect(seed.instructions).toMatch(/16 megapixels/);
  });
});
