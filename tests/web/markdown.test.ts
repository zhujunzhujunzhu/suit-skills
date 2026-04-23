import { describe, expect, it } from 'vitest';
import { collectMarkdownTranslationTasks } from '../../web/src/lib/markdown';

describe('collectMarkdownTranslationTasks', () => {
  it('ignores frontmatter and captures common markdown blocks', () => {
    const markdown = `---
name: sample-skill
description: frontmatter should not render
---

# Skill Forge

- first item
- second item

| Name | Value |
| ---- | ----- |
| Alpha | Beta |
`;

    const tasks = collectMarkdownTranslationTasks(markdown, () => true);
    const texts = tasks.map((task) => task.text);

    expect(texts).toContain('Skill Forge');
    expect(texts).toContain('first item');
    expect(texts).toContain('second item');
    expect(texts).toContain('Name');
    expect(texts).toContain('Beta');
    expect(texts.join(' ')).not.toContain('frontmatter should not render');
  });

  it('skips complex parent list items but still collects simple nested items', () => {
    const markdown = `- parent item
  - nested child
`;

    const tasks = collectMarkdownTranslationTasks(markdown, () => true);

    expect(tasks.map((task) => task.text)).toEqual(['nested child']);
  });
});
