import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir as nodeHomedir } from 'node:os';
import { join, dirname } from 'node:path';
import type { AgentMapping, Config } from '../types/index.js';
import { ensureDir } from '../utils/path.js';
import { warn } from '../utils/output.js';

const DEFAULT_SOURCE_URL =
  'https://gitee.com/digital-construction-center_1/suit-skills-lib.git';

export interface ConfigLocationOptions {
  /** 覆盖用户主目录（测试用），在未设置 `SUIT_SKILLS_HOME` 时生效 */
  homedir?: string;
}

/** 返回 suit-skills 配置根目录（内含 `config.json`） */
export function getConfigDir(options?: ConfigLocationOptions): string {
  const envRoot = process.env.SUIT_SKILLS_HOME?.trim();
  if (envRoot) {
    return envRoot;
  }
  const home = options?.homedir ?? nodeHomedir();
  return join(home, '.suit-skills');
}

export function getConfigPath(options?: ConfigLocationOptions): string {
  return join(getConfigDir(options), 'config.json');
}

export function getDefaultConfig(): Config {
  return {
    sources: [
      {
        name: 'default',
        url: DEFAULT_SOURCE_URL,
        enabled: true,
      },
    ],
    defaultSource: 'default',
    agents: {
      claude: {
        globalDir: '~/.claude/skills',
        projectDir: './.claude/skills',
      },
      cursor: {
        globalDir: '~/.cursor/skills',
        projectDir: './.cursor/skills',
      },
      /** 与 npx skills / Cursor 等文档中的 `.agents/skills` 约定一致 */
      agents: {
        globalDir: '~/.agents/skills',
        projectDir: './.agents/skills',
      },
      copilot: {
        globalDir: '~/.copilot/skills',
        projectDir: './.copilot/skills',
      },
      codex: {
        globalDir: '~/.codex/skills',
        projectDir: './.codex/skills',
      },
    },
    /** 默认不装 `./.skills/`，仅按项目下已存在的 Agent 目录自动合并；需要时用 `env set` 或 `--env skills` */
    installTargets: [],
  };
}

function cloneDefaultConfig(): Config {
  return structuredClone(getDefaultConfig());
}

/**
 * 旧版默认曾在配置文件中写入 `installTargets: ["skills"]`。
 * 现默认不再安装 `./.skills/`；对已升级 CLI 仍保留该字段的用户做一次迁移并写回磁盘。
 */
function shouldMigrateLegacyInstallTargetsOnlySkills(cfg: Config): boolean {
  return (
    cfg.installTargetsAuto !== false &&
    Array.isArray(cfg.installTargets) &&
    cfg.installTargets.length === 1 &&
    cfg.installTargets[0] === 'skills'
  );
}

/** 旧版 config可能只有 claude/cursor；补齐默认 agents（含 codex、copilot、agents 等） */
function mergeMissingAgentsFromDefaults(cfg: Config): boolean {
  const def = getDefaultConfig();
  if (
    !cfg.agents ||
    typeof cfg.agents !== 'object' ||
    Array.isArray(cfg.agents)
  ) {
    cfg.agents = structuredClone(def.agents);
    return true;
  }
  let added = false;
  for (const key of Object.keys(def.agents) as (keyof typeof def.agents)[]) {
    if (!(key in cfg.agents)) {
      cfg.agents[key] = structuredClone(def.agents[key]!);
      added = true;
    }
  }
  return added;
}

export function loadConfig(options?: ConfigLocationOptions): Config {
  const filePath = getConfigPath(options);
  if (!existsSync(filePath)) {
    return cloneDefaultConfig();
  }

  try {
    const raw = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Config;
    let dirty = mergeMissingAgentsFromDefaults(parsed);
    if (shouldMigrateLegacyInstallTargetsOnlySkills(parsed)) {
      parsed.installTargets = [];
      dirty = true;
    }
    if (dirty) {
      saveConfig(parsed, options);
    }
    return parsed;
  } catch {
    warn(
      `[suit-skills] Invalid config at ${filePath}; falling back to defaults.`,
    );
    return cloneDefaultConfig();
  }
}

export function saveConfig(config: Config, options?: ConfigLocationOptions): void {
  const filePath = getConfigPath(options);
  ensureDir(dirname(filePath));
  writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

export function getConfigValue(config: Config, path: string): unknown {
  const parts = path.split('.').filter((p) => p.length > 0);
  let cur: unknown = config;
  for (const part of parts) {
    if (cur === null || typeof cur !== 'object') {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function defaultDirsForAgent(agent: string): AgentMapping {
  return {
    globalDir: `~/.${agent}/skills`,
    projectDir: `./.${agent}/skills`,
  };
}

function ensureAgentShape(
  cfg: Config,
  agent: string,
): AgentMapping {
  if (!cfg.agents[agent]) {
    cfg.agents[agent] = defaultDirsForAgent(agent);
  }
  const m = cfg.agents[agent];
  if (!m.projectDir) {
    m.projectDir = defaultDirsForAgent(agent).projectDir;
  }
  if (!m.globalDir) {
    m.globalDir = defaultDirsForAgent(agent).globalDir;
  }
  return m;
}

/**
 * 按点号路径写入配置并持久化。
 * 对 `agents.<name>.*` 在首次创建映射时补齐另一目录字段的默认值。
 */
export function setConfigValue(
  path: string,
  value: unknown,
  options?: ConfigLocationOptions,
): void {
  const cfg = loadConfig(options);
  const parts = path.split('.').filter((p) => p.length > 0);
  if (parts.length === 0) {
    return;
  }

  const agentMatch =
    parts[0] === 'agents' && parts.length >= 3 ? parts[1] : undefined;
  if (agentMatch) {
    ensureAgentShape(cfg, agentMatch);
  }

  let cur: Record<string, unknown> = cfg as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    let next = cur[key];
    if (next === null || typeof next !== 'object' || Array.isArray(next)) {
      next = {};
      cur[key] = next;
    }
    cur = next as Record<string, unknown>;
  }

  const last = parts[parts.length - 1]!;
  cur[last] = value;

  if (agentMatch) {
    ensureAgentShape(cfg, agentMatch);
  }

  saveConfig(cfg, options);
}
