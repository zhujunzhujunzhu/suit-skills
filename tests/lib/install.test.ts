import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkConflict, installSkill, installSkillWithConflict } from '../../src/lib/install.js';
import * as fsUtils from '../../src/utils/fs.js';

describe('checkConflict', () => {
  let base: string;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'skills-cli-install-'));
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  it('目标不存在同名 → conflict: false', () => {
    const root = join(base, 'target');
    mkdirSync(root, { recursive: true });
    expect(checkConflict(root, 'code-review')).toEqual({ conflict: false });
  });

  it('目标已存在同名 → conflict: true 且 path 指向该目录', () => {
    const root = join(base, 'target');
    const existing = join(root, 'code-review');
    mkdirSync(existing, { recursive: true });
    const r = checkConflict(root, 'code-review');
    expect(r.conflict).toBe(true);
    expect(r.path).toBe(existing);
  });
});

describe('installSkill', () => {
  let base: string;
  let cache: string;
  let target: string;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'skills-cli-install-'));
    cache = join(base, 'cache');
    target = join(base, 'target');
    mkdirSync(join(cache, 'code-review'), { recursive: true });
    writeFileSync(
      join(cache, 'code-review', 'meta.json'),
      JSON.stringify({
        name: 'code-review',
        version: '1.0.0',
        description: '审查',
      }),
    );
    writeFileSync(join(cache, 'code-review', 'SKILL.md'), '# CR');
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  it('正常安装 → 目标目录存在且 meta.json 正确', () => {
    const dest = installSkill(cache, target, 'code-review');
    expect(existsSync(dest)).toBe(true);
    expect(existsSync(join(dest, 'SKILL.md'))).toBe(true);
    const meta = JSON.parse(
      readFileSync(join(dest, 'meta.json'), 'utf8'),
    ) as { name: string; version: string };
    expect(meta.name).toBe('code-review');
    expect(meta.version).toBe('1.0.0');
  });

  it('缓存中找不到 skill → 抛出错误', () => {
    expect(() => installSkill(cache, target, 'nope')).toThrow('Skill not found');
  });

  it('目标目录写权限不足 → 抛出错误', () => {
    const spy = vi
      .spyOn(fsUtils, 'copyDir')
      .mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });
    try {
      expect(() => installSkill(cache, target, 'code-review')).toThrow(
        'EACCES',
      );
    } finally {
      spy.mockRestore();
    }
  });
});

describe('installSkillWithConflict', () => {
  let base: string;
  let cache: string;
  let target: string;

  function seedCache() {
    mkdirSync(join(cache, 'code-review'), { recursive: true });
    writeFileSync(
      join(cache, 'code-review', 'meta.json'),
      JSON.stringify({
        name: 'code-review',
        version: '2.0.0',
        description: 'new',
      }),
    );
    writeFileSync(join(cache, 'code-review', 'SKILL.md'), '# NEW');
  }

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'skills-cli-install-'));
    cache = join(base, 'cache');
    target = join(base, 'target');
    seedCache();
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  it('无冲突 → 直接安装', () => {
    const r = installSkillWithConflict(
      cache,
      target,
      'code-review',
      'overwrite',
    );
    expect(r.skipped).toBeUndefined();
    expect(r.path).toBeDefined();
    expect(existsSync(join(target, 'code-review', 'meta.json'))).toBe(true);
  });

  it('冲突 + overwrite → 覆盖安装，新内容生效', () => {
    mkdirSync(join(target, 'code-review'), { recursive: true });
    writeFileSync(
      join(target, 'code-review', 'meta.json'),
      JSON.stringify({ name: 'code-review', version: '0.0.1', description: 'old' }),
    );
    writeFileSync(join(target, 'code-review', 'SKILL.md'), '# OLD');

    const r = installSkillWithConflict(
      cache,
      target,
      'code-review',
      'overwrite',
    );
    expect(r.path).toBe(join(target, 'code-review'));
    const meta = JSON.parse(
      readFileSync(join(target, 'code-review', 'meta.json'), 'utf8'),
    ) as { version: string; description: string };
    expect(meta.version).toBe('2.0.0');
    expect(meta.description).toBe('new');
    expect(readFileSync(join(target, 'code-review', 'SKILL.md'), 'utf8')).toBe(
      '# NEW',
    );
  });

  it('冲突 + skip → 不安装', () => {
    mkdirSync(join(target, 'code-review'), { recursive: true });
    writeFileSync(
      join(target, 'code-review', 'meta.json'),
      JSON.stringify({ name: 'code-review', version: '0.0.1' }),
    );

    const r = installSkillWithConflict(cache, target, 'code-review', 'skip');
    expect(r.skipped).toBe(true);
    expect(r.message).toBeDefined();
    const meta = JSON.parse(
      readFileSync(join(target, 'code-review', 'meta.json'), 'utf8'),
    ) as { version: string };
    expect(meta.version).toBe('0.0.1');
  });

  it('冲突 + rename → 安装为 code-review-1', () => {
    mkdirSync(join(target, 'code-review'), { recursive: true });
    writeFileSync(
      join(target, 'code-review', 'meta.json'),
      JSON.stringify({ name: 'code-review', version: '0.0.1' }),
    );

    const r = installSkillWithConflict(cache, target, 'code-review', 'rename');
    expect(r.path).toBe(join(target, 'code-review-1'));
    expect(existsSync(join(target, 'code-review-1', 'SKILL.md'))).toBe(true);
    const meta = JSON.parse(
      readFileSync(join(target, 'code-review-1', 'meta.json'), 'utf8'),
    ) as { name: string; version: string };
    expect(meta.name).toBe('code-review-1');
    expect(meta.version).toBe('2.0.0');
  });
});
