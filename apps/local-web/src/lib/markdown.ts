import { toString } from 'mdast-util-to-string';
import type { ListItem, Root } from 'mdast';
import remarkBreaks from 'remark-breaks';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import type { Position } from 'unist';
import { visit } from 'unist-util-visit';

export interface MarkdownTranslateTask {
  key: string;
  text: string;
}

const markdownTaskParser = unified()
  .use(remarkParse)
  .use(remarkBreaks)
  .use(remarkGfm)
  .use(remarkFrontmatter);

function isSimpleListItem(node: ListItem): boolean {
  return node.children.every((child) => child.type === 'paragraph');
}

function normalizeTaskText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function getMarkdownNodeKey(position?: Position | null): string | null {
  const start = position?.start?.offset;
  const end = position?.end?.offset;
  if (typeof start !== 'number' || typeof end !== 'number') return null;
  return `md:${start}:${end}`;
}

export function collectMarkdownTranslationTasks(
  markdown: string,
  shouldTranslate: (text: string) => boolean,
): MarkdownTranslateTask[] {
  if (!markdown.trim()) return [];

  try {
    const tree = markdownTaskParser.parse(markdown) as Root;
    const tasks: MarkdownTranslateTask[] = [];
    const seenKeys = new Set<string>();

    visit(tree, (node, _index, parent) => {
      let text = '';

      switch (node.type) {
        case 'heading':
        case 'tableCell':
          text = toString(node);
          break;
        case 'paragraph':
          if (parent?.type === 'listItem') return;
          text = toString(node);
          break;
        case 'listItem':
          if (!isSimpleListItem(node)) return;
          text = toString(node);
          break;
        default:
          return;
      }

      const normalized = normalizeTaskText(text);
      const key = getMarkdownNodeKey(node.position);
      if (!normalized || !key || seenKeys.has(key) || !shouldTranslate(normalized)) {
        return;
      }

      seenKeys.add(key);
      tasks.push({ key, text: normalized });
    });

    return tasks;
  } catch {
    return [];
  }
}

export function remarkStripFrontmatter() {
  return (tree: Root) => {
    tree.children = tree.children.filter(
      (node) => !['yaml', 'toml'].includes((node as { type: string }).type),
    );
  };
}

export const markdownRemarkPlugins = [
  remarkBreaks,
  remarkGfm,
  remarkFrontmatter,
  remarkStripFrontmatter,
] as const;
