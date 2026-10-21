import { describe, expect, it } from 'vitest';
import { thumbUrl } from './image';

describe('thumbUrl', () => {
  it('returns null without a source', () => expect(thumbUrl(null, 400)).toBeNull());
  it('routes Odysee thumbnails through the optimizer in 80px steps', () => {
    expect(thumbUrl('https://thumbs.odycdn.com/a.webp', 401)).toBe('https://thumbnails.odycdn.com/optimize/s:480:0/quality:80/plain/https://thumbs.odycdn.com/a.webp');
    expect(thumbUrl('https://thumbnails.lbry.com/abc', 400)).toContain('/s:400:0/');
  });
  it('leaves other hosts untouched', () => expect(thumbUrl('https://spee.ch/a.png', 400)).toBe('https://spee.ch/a.png'));
});
