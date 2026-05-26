import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ReviewItem,
  averageRating,
  type Skill,
} from '../../apps/platform-web/src/components/shared';

function skill(overrides: Partial<Skill>): Skill {
  return {
    id: 'skill-alpha',
    name: 'alpha',
    description: 'Alpha helper',
    author: 'Team',
    source: 'Suit Skills 默认源',
    category: '测试',
    version: '1.0.0',
    installs: 0,
    rating: 0,
    reviews: 0,
    status: '已验证',
    tags: [],
    command: 'npx suit-skills@latest install alpha',
    updatedAt: '2026-05-22 00:00',
    updatedAtValue: Date.parse('2026-05-22T00:00:00Z'),
    ...overrides,
  };
}

describe('platform review display', () => {
  it('computes the market average from real evaluation counts', () => {
    expect(averageRating([
      skill({ rating: 5, reviews: 1 }),
      skill({ rating: 1, reviews: 9 }),
      skill({ rating: 0, reviews: 0 }),
    ])).toBe('1.4');
  });

  it('renders review content without moderation status controls', () => {
    const html = renderToStaticMarkup(
      <ReviewItem
        review={{
          id: 'review-1',
          skillId: 'skill-alpha',
          skillName: 'alpha',
          rating: 5,
          tags: ['稳定性'],
          anonymous: true,
          contact: '',
          message: '用来做审查很好',
          status: 'archived',
          createdAt: '2026-05-22T00:00:00Z',
          updatedAt: '2026-05-22T00:00:00Z',
        }}
      />,
    );

    expect(html).toContain('用来做审查很好');
    expect(html).not.toContain('<select');
    expect(html).not.toContain('已归档');
  });
});
