import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Config } from '../types/index.js';
import {
  detectProjectEnvironmentHints,
  getEffectiveInstallTargets,
  normalizeInstallTargets,
  parseInstallTargetsCsv,
} from './install-targets.js';

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
      copilot: {
        globalDir: '~/.copilot/skills',
        projectDir: './.copilot/skills',
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

describe('core install targets', () => {
  it('normalizes configured targets', () => {
    expect(normalizeInstallTargets(fixtureConfig())).toEqual(['agents']);
    expect(
      normalizeInstallTargets({
        ...fixtureConfig(),
        installTargets: ['skills', 'claude', 'missing', 'claude'],
      }),
    ).toEqual(['skills', 'claude']);
  });

  it('normalizes missing or empty configured targets to an empty list', () => {
    const config = fixtureConfig();
    delete config.installTargets;

    expect(normalizeInstallTargets(config)).toEqual([]);
    expect(
      normalizeInstallTargets({ ...fixtureConfig(), installTargets: [] }),
    ).toEqual([]);
  });

  it('parses csv and rejects unknown targets', () => {
    const config = fixtureConfig();

    expect(parseInstallTargetsCsv('skills,agents,copilot', config)).toEqual([
      'skills',
      'agents',
      'copilot',
    ]);
    expect(() => parseInstallTargetsCsv('nope', config)).toThrow(
      'Unknown install target',
    );
  });

  it('deduplicates parsed csv targets', () => {
    const config = fixtureConfig();

    expect(parseInstallTargetsCsv('claude,cursor,claude', config)).toEqual([
      'claude',
      'cursor',
    ]);
  });

  it('gives agent option precedence over env csv and config', () => {
    const config = {
      ...fixtureConfig(),
      installTargets: ['skills', 'claude'],
    };

    expect(
      getEffectiveInstallTargets(
        config,
        { agent: 'cursor', envCsv: 'claude' },
        '/tmp/x',
      ),
    ).toEqual(['cursor']);
  });

  it('uses env csv before configured targets', () => {
    const config = {
      ...fixtureConfig(),
      installTargets: ['skills'],
    };

    expect(
      getEffectiveInstallTargets(config, { envCsv: 'claude' }, '/tmp/x'),
    ).toEqual(['claude']);
  });

  it('merges project hints when auto detection is enabled', () => {
    const root = mkdtempSync(join(tmpdir(), 'suit-core-targets-'));
    try {
      mkdirSync(join(root, '.cursor'), { recursive: true });

      expect(getEffectiveInstallTargets(fixtureConfig(), {}, root)).toEqual([
        'agents',
        'cursor',
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not merge project hints when auto detection is disabled', () => {
    const root = mkdtempSync(join(tmpdir(), 'suit-core-targets-no-auto-'));
    try {
      mkdirSync(join(root, '.cursor'), { recursive: true });
      const config = {
        ...fixtureConfig(),
        installTargetsAuto: false,
      };

      expect(getEffectiveInstallTargets(config, {}, root)).toEqual(['agents']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('detects project environment hints from configured project directories', () => {
    const root = mkdtempSync(join(tmpdir(), 'suit-core-target-hints-'));
    try {
      mkdirSync(join(root, '.claude'), { recursive: true });

      expect(detectProjectEnvironmentHints(root, fixtureConfig())).toEqual([
        'claude',
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('detects the agents project directory as the agents target', () => {
    const root = mkdtempSync(join(tmpdir(), 'suit-core-target-agents-'));
    try {
      mkdirSync(join(root, '.agents'), { recursive: true });

      expect(detectProjectEnvironmentHints(root, fixtureConfig())).toContain(
        'agents',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
