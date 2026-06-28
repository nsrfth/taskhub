import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(__dirname, 'AboutPage.tsx'), 'utf8');

describe('AboutPage author credit', () => {
  it('Author field appears directly after License and before Documentation', () => {
    const licenseIdx = src.indexOf('<Field label="License">');
    const authorIdx = src.indexOf('<Field label="Author">');
    const docIdx = src.indexOf('<Field label="Documentation">');
    expect(licenseIdx).toBeGreaterThan(-1);
    expect(authorIdx).toBeGreaterThan(licenseIdx);
    expect(docIdx).toBeGreaterThan(authorIdx);
    expect(src.slice(licenseIdx, docIdx)).toContain('Naser Fathi');
  });

  it('LinkedIn link opens the profile in a new tab with noopener noreferrer', () => {
    expect(src).toContain('href="https://www.linkedin.com/in/naser-fathi/"');
    expect(src).toContain('target="_blank"');
    expect(src).toContain('rel="noopener noreferrer"');
    expect(src).toMatch(/>\s*LinkedIn\s*<\/a>/);
  });

  it('existing About fields remain unchanged', () => {
    expect(src).toContain('<Field label="Application">');
    expect(src).toContain('<Field label="Version">');
    expect(src).toContain('MIT — Copyright © 2026 ProjectHub contributors');
    expect(src).toContain('<Field label="Documentation">');
    expect(src).toContain('<Field label="Tech">');
  });
});
