import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect } from 'vitest';
import { getDefaultConfig } from '../../src/lib/config.js';
import {
  normalizeInstallTargets,
  parseInstallTargetsCsv,
  getEffectiveInstallTargets,
  detectProjectEnvironmentHints,
} from '../../src/lib/install-targets.js';

describe('install-targets', () => {
  it('未配置或空 installTargets 时归一化为空数组', () => {
    const cfg = getDefaultConfig();
    delete cfg.installTargets;
    expect(normalizeInstallTargets(cfg)).toEqual([]);
    expect(normalizeInstallTargets({ ...cfg, installTargets: [] })).toEqual([]);
  });

  it('parseInstallTargetsCsv 去重并校验', () => {
    const cfg = getDefaultConfig();
    expect(parseInstallTargetsCsv('claude,cursor', cfg)).toEqual([
      'claude',
      'cursor',
    ]);
    expect(parseInstallTargetsCsv('skills,claude', cfg)).toEqual([
      'skills',
      'claude',
    ]);
    expect(() => parseInstallTargetsCsv('nope', cfg)).toThrow('Unknown');
  });

  it('getEffectiveInstallTargets：agent 优先', () => {
    const cfg = getDefaultConfig();
    cfg.installTargets = ['skills', 'claude'];
    expect(
      getEffectiveInstallTargets(
        cfg,
        { agent: 'cursor', envCsv: 'claude' },
        '/tmp/x',
      ),
    ).toEqual(['cursor']);
  });

  it('getEffectiveInstallTargets：env 次之', () => {
    const cfg = getDefaultConfig();
    cfg.installTargets = ['skills'];
    expect(
      getEffectiveInstallTargets(cfg, { envCsv: 'claude' }, '/tmp/x'),
    ).toEqual(['claude']);
  });

  it('项目下存在 .cursor 时仅并入 cursor（默认不写 skills）', () => {
    const root = mkdtempSync(join(tmpdir(), 'skills-cli-it-'));
    try {
      mkdirSync(join(root, '.cursor'), { recursive: true });
      const cfg = getDefaultConfig();
      expect(getEffectiveInstallTargets(cfg, {}, root)).toEqual(['cursor']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('installTargetsAuto: false 时不并入检测目录', () => {
    const root = mkdtempSync(join(tmpdir(), 'skills-cli-it2-'));
    try {
      mkdirSync(join(root, '.cursor'), { recursive: true });
      const cfg = getDefaultConfig();
      cfg.installTargetsAuto = false;
      expect(getEffectiveInstallTargets(cfg, {}, root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('detectProjectEnvironmentHints：按 agents.projectDir 首段判断', () => {
    const root = mkdtempSync(join(tmpdir(), 'skills-cli-it3-'));
    try {
      mkdirSync(join(root, '.claude'), { recursive: true });
      const cfg = getDefaultConfig();
      expect(detectProjectEnvironmentHints(root, cfg)).toEqual(['claude']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('detectProjectEnvironmentHints：.agents 目录对应 install 目标 agents', () => {
    const root = mkdtempSync(join(tmpdir(), 'skills-cli-it4-'));
    try {
      mkdirSync(join(root, '.agents'), { recursive: true });
      const cfg = getDefaultConfig();
      expect(detectProjectEnvironmentHints(root, cfg)).toContain('agents');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('parseInstallTargetsCsv 接受 agents 与 copilot', () => {
    const cfg = getDefaultConfig();
    expect(parseInstallTargetsCsv('skills,agents,copilot', cfg)).toEqual([
      'skills',
      'agents',
      'copilot',
    ]);
  });
});
