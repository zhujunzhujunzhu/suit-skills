import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import { describe, expect, it } from 'vitest';
import '../../apps/local-web/src/i18n';
import {
  TranslateMarkdownView,
  normalizeSkillRelativePath,
} from '../../apps/local-web/src/views/SkillDetailView';
import { markdownRemarkPlugins } from '../../apps/local-web/src/lib/markdown';

describe('markdown rendering pipeline', () => {
  it('strips frontmatter and renders gfm tables', () => {
    const html = renderToStaticMarkup(
      <ReactMarkdown remarkPlugins={[...markdownRemarkPlugins]}>
        {`---
name: sample-skill
description: should stay hidden
---

# Skill Forge

| Name | Value |
| ---- | ----- |
| Alpha | Beta |
`}
      </ReactMarkdown>,
    );

    expect(html).toContain('<h1>Skill Forge</h1>');
    expect(html).toContain('<table>');
    expect(html).not.toContain('description: should stay hidden');
  });

  it('renders inline markdown fragments without wrapping them in paragraphs', () => {
    const html = renderToStaticMarkup(
      <ReactMarkdown
        components={{
          p: ({ children }) => <>{children}</>,
        }}
        remarkPlugins={[...markdownRemarkPlugins]}
      >
        {'Translated **bold** with `code` and [link](https://example.com).'}
      </ReactMarkdown>,
    );

    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<a href="https://example.com">link</a>');
    expect(html).not.toContain('<p>');
  });

  it('renders code block chrome, task checkboxes, and safe external links in the detail view', () => {
    const html = renderToStaticMarkup(
      <TranslateMarkdownView
        cacheKey="test"
        markdown={`- [x] done item

\`\`\`ts
const answer = 42;
\`\`\`

[OpenAI](https://openai.com)`}
        translationConfig={{ provider: 'none' }}
      />,
    );

    expect(html).toContain('markdown-code-shell');
    expect(html).toContain('markdown-code-language');
    expect(html).toContain('markdown-task-checkbox');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer noopener"');
  });

  it('resolves internal relative paths and disables them when no navigator is available', () => {
    expect(normalizeSkillRelativePath('docs/SKILL.md', '../imgs/shot.png')).toBe('imgs/shot.png');

    const html = renderToStaticMarkup(
      <TranslateMarkdownView
        cacheKey="relative-link"
        currentPath="docs/SKILL.md"
        markdown="[Open details](../references/guide.md)"
        translationConfig={{ provider: 'none' }}
      />,
    );

    expect(html).toContain('markdown-link-disabled');
    expect(html).toContain('title="references/guide.md"');
  });
});
