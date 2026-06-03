// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  nextSelectableSource,
  readStoredSource,
  writeStoredSource,
} from '../../apps/local-web/src/lib/sourcePreference';

describe('local web source preference', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('persists the selected source filter', () => {
    expect(readStoredSource()).toBeNull();

    writeStoredSource('anthropics-skills');

    expect(readStoredSource()).toBe('anthropics-skills');
  });

  it('keeps all as an explicit selection', () => {
    const sources = [{ name: 'default', enabled: true }];

    expect(nextSelectableSource(sources, 'all', 'default')).toBe('all');
  });

  it('falls back when the stored source is no longer selectable', () => {
    const sources = [
      { name: 'default', enabled: true },
      { name: 'archived', enabled: false },
    ];

    expect(nextSelectableSource(sources, 'archived', 'default')).toBe('default');
  });
});

