import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../../..');
const run = (...args: string[]) => execFileSync('node', [path.join(root, 'tools/check-i18n.js'), ...args], { cwd: root, encoding: 'utf8' });

describe('translation catalogs', () => {
  it('have every string of the app, with the same placeholders and the right plural forms', () => {
    const output = run();
    ['cs', 'de', 'es', 'fr', 'it', 'nl', 'pl', 'pt'].forEach((language) => expect(output).toMatch(new RegExp(`${language}\\.ts: \\d+ strings, complete`)));
  });

  it('can list the strings that need translating', () => {
    const strings: { key: string; where: string }[] = JSON.parse(run('--list'));
    expect(strings.length).toBeGreaterThan(150);
    const keys = strings.map((entry) => entry.key);
    expect(keys).toEqual(expect.arrayContaining(['Settings', 'Stats for Nerds', '{count} year ago|{count} years ago', 'Failed to play video: {message}', 'Odysee Pink', 'System']));
    expect(keys).toEqual(expect.arrayContaining(['Font', 'The font used across the app']));
    expect(keys).not.toContain('Inter');
    expect(keys).not.toContain('Deutsch');
    expect(keys).not.toContain('1440p');
    expect(new Set(keys).size).toBe(keys.length);
  });
});
