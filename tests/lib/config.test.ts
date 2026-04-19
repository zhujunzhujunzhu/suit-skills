import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Config } from '../../src/types/index.js';
import {
  BUILTIN_SOURCE_CATALOG,
  getDefaultConfig,
  loadConfig,
  saveConfig,
  getConfigValue,
  getEffectiveSourceUrl,
  restoreBuiltinSources,
  setConfigValue,
  getConfigPath,
} from '../../src/lib/config.js';

describe('getDefaultConfig', () => {
  it('sources 首项 name 为 default', () => {
    const cfg = getDefaultConfig();
    expect(cfg.sources[0]?.name).toBe('default');
  });

  it('默认源 URL 与文档一致', () => {
    const cfg = getDefaultConfig();
    expect(cfg.sources[0]?.url).toBe(
      'https://gitee.com/digital-construction-center_1/suit-skills-lib.git',
    );
  });

  it('agents 包含常见约定目录（claude / cursor / agents / copilot / codex / gemini / opencode / openclaw）', () => {
    const cfg = getDefaultConfig();
    expect(cfg.agents.claude?.projectDir).toBe('./.claude/skills');
    expect(cfg.agents.cursor?.projectDir).toBe('./.cursor/skills');
    expect(cfg.agents.agents?.projectDir).toBe('./.agents/skills');
    expect(cfg.agents.copilot?.projectDir).toBe('./.copilot/skills');
    expect(cfg.agents.codex?.projectDir).toBe('./.codex/skills');
    expect(cfg.agents.gemini?.projectDir).toBe('./.gemini/skills');
    expect(cfg.agents.opencode?.projectDir).toBe('./.opencode/skills');
    expect(cfg.agents.openclaw?.projectDir).toBe('./.openclaw/skills');
  });

  it('recommended sources are present but disabled by default', () => {
    const cfg = getDefaultConfig();
    expect(cfg.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'anthropics-skills',
          url: 'https://github.com/anthropics/skills.git',
          enabled: false,
        }),
        expect.objectContaining({
          name: 'superpowers',
          url: 'https://github.com/obra/superpowers.git',
          enabled: false,
        }),
        expect.objectContaining({
          name: 'awesome-claude-skills',
          url: 'https://github.com/ComposioHQ/awesome-claude-skills.git',
          enabled: false,
        }),
      ]),
    );
    expect(
      cfg.sources.filter((source) => source.enabled).map((source) => source.name),
    ).toEqual(['default']);
    for (const builtin of BUILTIN_SOURCE_CATALOG) {
      const source = cfg.sources.find((item) => item.name === builtin.name);
      expect(source).toMatchObject({
        name: builtin.name,
        url: builtin.url,
        enabled: false,
      });
      if (builtin.domesticMirrorUrl) {
        expect(source?.domesticMirror).toEqual({
          url: builtin.domesticMirrorUrl,
          enabled: true,
        });
        expect(getEffectiveSourceUrl(source!)).toBe(builtin.domesticMirrorUrl);
      }
    }
    expect(cfg.sources.some((source) => source.name.endsWith(' cn'))).toBe(false);
  });
});

describe('loadConfig', () => {
  let tempRoot: string;
  const prevHome = process.env.SUIT_SKILLS_HOME;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'skills-cli-config-'));
    process.env.SUIT_SKILLS_HOME = tempRoot;
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
    if (prevHome === undefined) {
      delete process.env.SUIT_SKILLS_HOME;
    } else {
      process.env.SUIT_SKILLS_HOME = prevHome;
    }
    vi.restoreAllMocks();
  });

  it('文件不存在时返回默认配置且不抛错', () => {
    const cfg = loadConfig();
    expect(cfg).toEqual(getDefaultConfig());
  });

  it('文件存在且合法时返回文件内容', () => {
    const custom: Config = {
      sources: [
        {
          name: 'custom',
          url: 'https://example.com/repo.git',
          enabled: false,
        },
      ],
      defaultSource: 'custom',
      agents: {
        claude: {
          globalDir: '~/.claude/skills',
          projectDir: './.claude/skills',
        },
        cursor: {
          globalDir: '~/.cursor/skills',
          projectDir: './.cursor/skills',
        },
      },
    };
    writeFileSync(getConfigPath(), JSON.stringify(custom), 'utf8');
    const cfg = loadConfig();
    expect(cfg.sources[0]).toEqual(custom.sources[0]);
    expect(cfg.defaultSource).toBe(custom.defaultSource);
    expect(cfg.sources.some((source) => source.name === 'anthropics-skills')).toBe(
      false,
    );
    expect(cfg.agents.codex?.projectDir).toBe('./.codex/skills');
  });

  it('遗留的仅 skills 的 installTargets 会迁移为空并写回文件', () => {
    const onDisk = {
      sources: getDefaultConfig().sources,
      defaultSource: 'default',
      agents: getDefaultConfig().agents,
      installTargets: ['skills'],
    };
    writeFileSync(getConfigPath(), JSON.stringify(onDisk), 'utf8');
    const cfg = loadConfig();
    expect(cfg.installTargets).toEqual([]);
    const round = JSON.parse(readFileSync(getConfigPath(), 'utf8')) as Config;
    expect(round.installTargets).toEqual([]);
  });

  it('config 缺少的 agents 键会从默认配置合并并写回', () => {
    const minimal = {
      sources: getDefaultConfig().sources,
      defaultSource: 'default',
      agents: {
        claude: getDefaultConfig().agents.claude,
        cursor: getDefaultConfig().agents.cursor,
      },
      installTargets: [],
    };
    writeFileSync(getConfigPath(), JSON.stringify(minimal), 'utf8');
    const cfg = loadConfig();
    expect(cfg.agents.codex).toEqual(getDefaultConfig().agents.codex);
    const disk = JSON.parse(readFileSync(getConfigPath(), 'utf8')) as Config;
    expect(disk.agents.codex).toEqual(getDefaultConfig().agents.codex);
  });

  it('does not auto-restore missing recommended sources to existing config', () => {
    const minimal = {
      sources: [
        {
          name: 'default',
          url: 'https://gitee.com/digital-construction-center_1/suit-skills-lib.git',
          enabled: true,
        },
      ],
      defaultSource: 'default',
      agents: getDefaultConfig().agents,
      installTargets: [],
    };
    writeFileSync(getConfigPath(), JSON.stringify(minimal), 'utf8');
    const cfg = loadConfig();
    expect(cfg.sources.map((source) => source.name)).toEqual(['default']);
    const disk = JSON.parse(readFileSync(getConfigPath(), 'utf8')) as Config;
    expect(disk.sources.map((source) => source.name)).toEqual(['default']);
  });

  it('迁移旧的 cn 重复源为同一个内置源的国内镜像', () => {
    const onDisk = {
      sources: [
        {
          name: 'default',
          url: 'https://gitee.com/digital-construction-center_1/suit-skills-lib.git',
          enabled: true,
        },
        {
          name: 'anthropics-skills',
          url: 'https://github.com/anthropics/skills.git',
          enabled: false,
        },
        {
          name: 'anthropics-skills cn',
          url: 'https://gitee.com/zhujun12/skills.git',
          enabled: true,
        },
      ],
      defaultSource: 'default',
      agents: getDefaultConfig().agents,
      installTargets: [],
    };
    writeFileSync(getConfigPath(), JSON.stringify(onDisk), 'utf8');
    const cfg = loadConfig();
    const anthropics = cfg.sources.filter(
      (source) => source.name === 'anthropics-skills',
    );
    expect(anthropics).toHaveLength(1);
    expect(anthropics[0]).toMatchObject({
      enabled: true,
      domesticMirror: {
        url: 'https://gitee.com/zhujun12/skills.git',
        enabled: true,
      },
    });
    expect(cfg.sources.some((source) => source.name.includes(' cn'))).toBe(false);
  });

  it('installTargetsAuto 为 false 且仅有 skills 时不迁移', () => {
    const onDisk = {
      sources: getDefaultConfig().sources,
      defaultSource: 'default',
      agents: getDefaultConfig().agents,
      installTargets: ['skills'],
      installTargetsAuto: false,
    };
    writeFileSync(getConfigPath(), JSON.stringify(onDisk), 'utf8');
    const cfg = loadConfig();
    expect(cfg.installTargets).toEqual(['skills']);
  });

  it('JSON 非法时返回默认配置并打印警告', () => {
    writeFileSync(getConfigPath(), '{ not json', 'utf8');
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cfg = loadConfig();
    expect(cfg).toEqual(getDefaultConfig());
    expect(logSpy).toHaveBeenCalled();
    const first = String(logSpy.mock.calls[0]?.[0] ?? '');
    expect(first).toMatch(/Invalid config|falling back/);
  });
});

describe('restoreBuiltinSources', () => {
  it('adds only missing built-ins as disabled without changing custom sources', () => {
    const superpowers = BUILTIN_SOURCE_CATALOG.find(
      (source) => source.name === 'superpowers',
    )!;
    const anthropics = BUILTIN_SOURCE_CATALOG.find(
      (source) => source.name === 'anthropics-skills',
    )!;
    const cfg: Config = {
      sources: [
        {
          name: 'default',
          url: 'https://gitee.com/digital-construction-center_1/suit-skills-lib.git',
          enabled: true,
        },
        {
          name: superpowers.name,
          url: 'https://example.com/not-superpowers.git',
          enabled: true,
        },
        {
          name: 'anthropics-copy',
          url: anthropics.url.replace(/\.git$/, ''),
          enabled: true,
        },
        {
          name: 'team',
          url: 'https://github.com/acme/team-skills.git',
          enabled: true,
        },
      ],
      defaultSource: 'team',
      agents: getDefaultConfig().agents,
      installTargets: [],
    };

    const added = restoreBuiltinSources(cfg);

    expect(added).not.toContain('superpowers');
    expect(added).not.toContain('anthropics-skills');
    expect(added).toContain('vercel-agent-skills');
    expect(cfg.defaultSource).toBe('team');
    expect(cfg.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'team',
          url: 'https://github.com/acme/team-skills.git',
          enabled: true,
        }),
        expect.objectContaining({
          name: 'vercel-agent-skills',
          enabled: false,
          domesticMirror: {
            url: 'https://gitee.com/zhujun12/agent-skills.git',
            enabled: true,
          },
        }),
      ]),
    );
    expect(
      cfg.sources.filter((source) => source.name === 'superpowers'),
    ).toHaveLength(1);
  });
});

describe('saveConfig', () => {
  let tempRoot: string;
  const prevHome = process.env.SUIT_SKILLS_HOME;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'skills-cli-save-'));
    process.env.SUIT_SKILLS_HOME = tempRoot;
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
    if (prevHome === undefined) {
      delete process.env.SUIT_SKILLS_HOME;
    } else {
      process.env.SUIT_SKILLS_HOME = prevHome;
    }
  });

  it('写入后重新读取内容一致', () => {
    const cfg = getDefaultConfig();
    cfg.defaultSource = 'persist-check';
    saveConfig(cfg);
    const raw = readFileSync(getConfigPath(), 'utf8');
    expect(JSON.parse(raw)).toMatchObject({ defaultSource: 'persist-check' });
    expect(loadConfig().defaultSource).toBe('persist-check');
  });

  it('目录不存在时自动创建后写入', () => {
    const outer = mkdtempSync(join(tmpdir(), 'skills-cli-save2-'));
    const deepRoot = join(outer, 'nested', 'suit-skills');
    process.env.SUIT_SKILLS_HOME = deepRoot;
    saveConfig(getDefaultConfig());
    expect(loadConfig().defaultSource).toBe('default');
    rmSync(outer, { recursive: true, force: true });
    process.env.SUIT_SKILLS_HOME = tempRoot;
  });
});

describe('getConfigValue', () => {
  it('defaultSource 为 default', () => {
    const cfg = getDefaultConfig();
    expect(getConfigValue(cfg, 'defaultSource')).toBe('default');
  });

  it('agents.claude.globalDir 为 ~/.claude/skills', () => {
    const cfg = getDefaultConfig();
    expect(getConfigValue(cfg, 'agents.claude.globalDir')).toBe(
      '~/.claude/skills',
    );
  });

  it('不存在的路径返回 undefined', () => {
    const cfg = getDefaultConfig();
    expect(getConfigValue(cfg, 'nonexistent.key')).toBeUndefined();
  });
});

describe('setConfigValue', () => {
  let tempRoot: string;
  const prevHome = process.env.SUIT_SKILLS_HOME;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'skills-cli-set-'));
    process.env.SUIT_SKILLS_HOME = tempRoot;
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
    if (prevHome === undefined) {
      delete process.env.SUIT_SKILLS_HOME;
    } else {
      process.env.SUIT_SKILLS_HOME = prevHome;
    }
  });

  it('设置 defaultSource 后重新读取可验证', () => {
    setConfigValue('defaultSource', 'my-source');
    expect(loadConfig().defaultSource).toBe('my-source');
  });

  it('设置 agents.copilot.globalDir 可新增映射', () => {
    setConfigValue('agents.copilot.globalDir', '~/.github-copilot/skills');
    const cfg = loadConfig();
    expect(cfg.agents.copilot?.globalDir).toBe('~/.github-copilot/skills');
    expect(cfg.agents.copilot?.projectDir).toBe('./.copilot/skills');
  });
});
