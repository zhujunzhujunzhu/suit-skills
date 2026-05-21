import { join } from 'node:path';

/**
 * 将 `resolveTargetPath` 返回的展示路径（`~/...` 或 `./...`）转为绝对路径。
 */
export function toAbsoluteInstallRoot(
  displayPath: string,
  cwd: string,
  userHome: string,
): string {
  const trimmed = displayPath.replace(/[/\\]+$/, '');
  if (trimmed.startsWith('~/')) {
    return join(userHome, trimmed.slice(2));
  }
  if (trimmed.startsWith('./') || trimmed.startsWith('.\\')) {
    return join(cwd, trimmed.slice(2));
  }
  return trimmed;
}
