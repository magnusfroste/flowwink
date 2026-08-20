import { describe, it, expect } from 'vitest';
import { isHeicFile, getWebPFileName } from './image-utils';

const makeFile = (name: string, type: string) => new File([''], name, { type });

describe('isHeicFile', () => {
  it('detects HEIC by mime type', () => {
    expect(isHeicFile(makeFile('photo.heic', 'image/heic'))).toBe(true);
    expect(isHeicFile(makeFile('photo.heif', 'image/heif'))).toBe(true);
  });

  it('detects HEIC by extension when mime type is empty (Chrome)', () => {
    expect(isHeicFile(makeFile('IMG_1234.HEIC', ''))).toBe(true);
    expect(isHeicFile(makeFile('photo.heif', ''))).toBe(true);
  });

  it('does not flag other image formats', () => {
    expect(isHeicFile(makeFile('photo.jpg', 'image/jpeg'))).toBe(false);
    expect(isHeicFile(makeFile('photo.png', 'image/png'))).toBe(false);
    expect(isHeicFile(makeFile('photo.webp', 'image/webp'))).toBe(false);
    // "heic" in the basename but not as extension
    expect(isHeicFile(makeFile('heic-guide.png', 'image/png'))).toBe(false);
  });
});

describe('getWebPFileName', () => {
  it('replaces the extension with .webp', () => {
    expect(getWebPFileName('photo.jpg')).toBe('photo.webp');
    expect(getWebPFileName('IMG_1234.HEIC')).toBe('IMG_1234.webp');
  });

  it('appends .webp when there is no extension', () => {
    expect(getWebPFileName('photo')).toBe('photo.webp');
  });
});
