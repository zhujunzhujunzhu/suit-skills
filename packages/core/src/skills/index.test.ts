import { describe, expect, it } from 'vitest';
import { searchSkills } from './index.js';
import type { SkillMeta } from '../types/index.js';

describe('core skills', () => {
  it('searches by name, description, and tags', () => {
    const metas: SkillMeta[] = [
      {
        name: 'code-review',
        version: '1.0.0',
        description: 'Review code quality',
        tags: ['quality'],
      },
      {
        name: 'translator',
        version: '1.0.0',
        description: 'Translate documents',
        tags: ['i18n'],
      },
    ];

    expect(searchSkills(metas, 'review').map((meta) => meta.name)).toEqual([
      'code-review',
    ]);
    expect(searchSkills(metas, 'i18n').map((meta) => meta.name)).toEqual([
      'translator',
    ]);
  });
});

