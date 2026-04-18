import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  existsSync,
  symlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDefaultConfig } from '../../src/lib/config.js';
import { resolveTargetPath, getInstalledSkills } from '../../src/lib/agents.js';

describe('resolveTargetPath', () => {
  const config = getDefaultConfig();

  it('项目级（默认）→ ./.skills/', () => {
    expect(resolveTargetPath(config, {})).toBe('./.skills/');
  });

  it('全局 -g → ~/.suit-skills/skills/', () => {
    expect(resolveTargetPath(config, { global: true })).toBe(
      '~/.suit-skills/skills/',
    );
  });

  it('--agent claude → ./.claude/skills/', () => {
    expect(resolveTargetPath(config, { agent: 'claude' })).toBe(
      './.claude/skills/',
    );
  });

  it('--agent claude -g → ~/.claude/skills/', () => {
    expect(
      resolveTargetPath(config, { agent: 'claude', global: true }),
    ).toBe('~/.claude/skills/');
  });

  it('--agent unknown → Unknown agent: unknown', () => {
    expect(() =>
      resolveTargetPath(config, { agent: 'unknown' }),
    ).toThrow('Unknown agent: unknown');
  });
});

describe('getInstalledSkills', () => {
  let tempBase: string;

  beforeEach(() => {
    tempBase = mkdtempSync(join(tmpdir(), 'skills-cli-agents-'));
  });

  afterEach(() => {
    rmSync(tempBase, { recursive: true, force: true });
  });

  it('目录下有 2 个 skill 文件夹 → 返回名称数组', () => {
    const root = join(tempBase, 'skills-root');
    mkdirSync(join(root, 'code-review'), { recursive: true });
    mkdirSync(join(root, 'commit-helper'), { recursive: true });

    expect(getInstalledSkills(root)).toEqual([
      'code-review',
      'commit-helper',
    ]);
  });

  it('includes symlinked skill directories', () => {
    const root = join(tempBase, 'skills-root');
    const realSkill = join(tempBase, 'store', 'linked-skill');
    const linkedSkill = join(root, 'linked-skill');
    mkdirSync(realSkill, { recursive: true });
    mkdirSync(root, { recursive: true });

    symlinkSync(realSkill, linkedSkill, 'junction');

    expect(getInstalledSkills(root)).toEqual(['linked-skill']);
  });

  it('目录不存在 → 空数组', () => {
    expect(getInstalledSkills(join(tempBase, 'nope'))).toEqual([]);
  });

  it('目录存在但为空 → 空数组', () => {
    const root = join(tempBase, 'empty');
    mkdirSync(root, { recursive: true });
    expect(existsSync(root)).toBe(true);
    expect(getInstalledSkills(root)).toEqual([]);
  });
});
