import type { Root } from 'mdast';
import remarkBreaks from 'remark-breaks';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';

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
