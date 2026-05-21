import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { copyDir, parseVersion, gt, eq } from './fs.js';

describe('copyDir', () => {
  let tempBase: string;

  beforeEach(() => {
    tempBase = mkdtempSync(join(tmpdir(), 'skills-cli-test-'));
  });

  afterEach(() => {
    rmSync(tempBase, { recursive: true, force: true });
  });

  it('复制文件后内容保持一致', () => {
    const src = join(tempBase, 'src');
    const dest = join(tempBase, 'dest');
    mkdirSync(src);

    writeFileSync(join(src, 'meta.json'), '{"name":"test"}');
    writeFileSync(join(src, 'prompt.md'), '# Hello');

    copyDir(src, dest);

    expect(existsSync(join(dest, 'meta.json'))).toBe(true);
    expect(existsSync(join(dest, 'prompt.md'))).toBe(true);
    expect(readFileSync(join(dest, 'meta.json'), 'utf-8')).toBe(
      '{"name":"test"}',
    );
  });

  it('递归复制子目录', () => {
    const src = join(tempBase, 'src');
    const dest = join(tempBase, 'dest');
    mkdirSync(src, { recursive: true });
    mkdirSync(join(src, 'templates'), { recursive: true });

    writeFileSync(join(src, 'templates', 'a.md'), 'template content');

    copyDir(src, dest);

    expect(existsSync(join(dest, 'templates', 'a.md'))).toBe(true);
    expect(
      readFileSync(join(dest, 'templates', 'a.md'), 'utf-8'),
    ).toBe('template content');
  });

  it('当源目录不存在时抛出异常', () => {
    const src = join(tempBase, 'nonexistent');
    const dest = join(tempBase, 'dest');
    expect(() => copyDir(src, dest)).toThrow(
      'Source directory does not exist',
    );
  });
});

describe('parseVersion', () => {
  it('解析标准 semver 版本号', () => {
    expect(parseVersion('1.2.0')).toEqual({
      major: 1,
      minor: 2,
      patch: 0,
    });
  });

  it('比较大于关系', () => {
    expect(gt('1.2.0', '1.1.9')).toBe(true);
    expect(gt('2.0.0', '1.9.9')).toBe(true);
  });

  it('比较相等关系', () => {
    expect(eq('1.0.0', '1.0.0')).toBe(true);
  });

  it('比较时忽略预发布标签', () => {
    expect(parseVersion('1.0.0-beta')).toEqual({
      major: 1,
      minor: 0,
      patch: 0,
    });
  });
});
