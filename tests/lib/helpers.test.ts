import { describe, it, expect } from 'vitest';
import { tagMatches } from '../../src/cli/helpers.js';
import type { SkillMeta } from '../../src/types/index.js';

describe('tagMatches', () => {
  it('非字符串 tag 不抛错，且仍匹配合法 tag', () => {
       const meta = {
      name: 'x',
      version: '1',
      tags: [42, 'hello', { x: 1 }],
    } as SkillMeta;
    expect(() => tagMatches(meta, 'hello')).not.toThrow();
    expect(tagMatches(meta, 'hello')).toBe(true);
    expect(tagMatches(meta, 'zz')).toBe(false);
  });
});
