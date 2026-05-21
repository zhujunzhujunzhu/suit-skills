import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Config } from '../types/index.js';
import { getInstalledSkills, resolveTargetPath } from './agents.js';

function fixtureConfig(): Config {
  return {
    sources: [],
    defaultSource: 'default',
    agents: {
      agents: {
        globalDir: '~/.agents/skills',
        projectDir: './.agents/skills',
      },
      claude: {
        globalDir: '~/.claude/skills',
        projectDir: './.claude/skills',
      },
      cursor: {
        globalDir: '~/.cursor/skills',
        projectDir: './.cursor/skills',
      },
    },
    installTargets: ['agents'],
    installTargetsAuto: true,
  };
}

describe('core resolveTargetPath', () => {
  const config = fixtureConfig();

  it('resolves the default project skill directory', () => {
    expect(resolveTargetPath(config, {})).toBe('./.skills/');
  });

  it('resolves the default global skill directory', () => {
    expect(resolveTargetPath(config, { global: true })).toBe(
      '~/.suit-skills/skills/',
    );
  });

  it('resolves a configured project agent directory', () => {
    expect(resolveTargetPath(config, { agent: 'claude' })).toBe(
      './.claude/skills/',
    );
  });

  it('resolves a configured global agent directory', () => {
    expect(resolveTargetPath(config, { agent: 'claude', global: true })).toBe(
      '~/.claude/skills/',
    );
  });

  it('rejects unknown agents', () => {
    expect(() => resolveTargetPath(config, { agent: 'unknown' })).toThrow(
      'Unknown agent: unknown',
    );
  });
});

describe('core getInstalledSkills', () => {
  let tempBase: string;

  beforeEach(() => {
    tempBase = mkdtempSync(join(tmpdir(), 'suit-core-agents-'));
  });

  afterEach(() => {
    rmSync(tempBase, { recursive: true, force: true });
  });

  it('lists installed skill directories alphabetically', () => {
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

  it('returns an empty list when the target directory does not exist', () => {
    expect(getInstalledSkills(join(tempBase, 'nope'))).toEqual([]);
  });

  it('returns an empty list for an empty target directory', () => {
    const root = join(tempBase, 'empty');
    mkdirSync(root, { recursive: true });
    expect(existsSync(root)).toBe(true);
    expect(getInstalledSkills(root)).toEqual([]);
  });
});

