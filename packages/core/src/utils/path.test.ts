import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { urlToCacheDirName, ensureDir } from './path.js';

describe('urlToCacheDirName', () => {
  it('转换 HTTPS Gitee URL', () => {
    expect(
      urlToCacheDirName(
        'https://gitee.com/user/suit-skills-lib.git',
      ),
    ).toBe('gitee-com-user-suit-skills-lib');
  });

  it('转换 HTTPS GitHub URL', () => {
    expect(
      urlToCacheDirName('https://github.com/org/skills.git'),
    ).toBe('github-com-org-skills');
  });

  it('转换 SSH Git URL', () => {
    expect(
      urlToCacheDirName('git@github.com:org/repo.git'),
    ).toBe('github-com-org-repo');
  });

  it('将路径中的下划线替换为短横线（默认 Gitee 源 URL）', () => {
    expect(
      urlToCacheDirName(
        'https://gitee.com/digital-construction-center_1/suit-skills-lib.git',
      ),
    ).toBe('gitee-com-digital-construction-center-1-suit-skills-lib');
  });
});

describe('ensureDir', () => {
  let tempBase: string;

  beforeEach(() => {
    tempBase = mkdtempSync(join(tmpdir(), 'skills-cli-test-'));
  });

  afterEach(() => {
    rmSync(tempBase, { recursive: true, force: true });
  });

  it('当目录不存在时创建目录', () => {
    const target = join(tempBase, 'new-dir');
    expect(existsSync(target)).toBe(false);
    ensureDir(target);
    expect(existsSync(target)).toBe(true);
  });

  it('当目录已存在时不抛出异常', () => {
    const target = join(tempBase, 'existing-dir');
    ensureDir(target);
    expect(() => ensureDir(target)).not.toThrow();
    expect(existsSync(target)).toBe(true);
  });
});
