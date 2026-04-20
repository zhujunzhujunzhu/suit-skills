import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir as nodeHomedir } from 'node:os';
import { join, dirname } from 'node:path';
import type { AgentMapping, AppSettings, Config, Source, TranslationConfig } from '../types/index.js';
import { ensureDir } from '../utils/path.js';
import { warn } from '../utils/output.js';

const DEFAULT_SOURCE_URL =
  'https://gitee.com/digital-construction-center_1/suit-skills-lib.git';
export const DEFAULT_SOURCE_REFRESH_INTERVAL_MINUTES = 5;

export type BuiltinSourceCategory =
  | 'official'
  | 'engineering'
  | 'collection'
  | 'cn'
  | 'specialized';

export interface BuiltinSourceInfo {
  name: string;
  url: string;
  label: string;
  category: BuiltinSourceCategory;
  description: string;
  domesticMirrorUrl?: string;
}

export const DEFAULT_SOURCE_INFO: BuiltinSourceInfo = {
  name: 'default',
  url: DEFAULT_SOURCE_URL,
  label: 'Suit Skills 默认源',
  category: 'cn',
  description: '数知建维护的默认技能库，新安装默认启用。',
};

export const BUILTIN_SOURCE_CATALOG: BuiltinSourceInfo[] = [
  {
    name: 'anthropics-skills',
    url: 'https://github.com/anthropics/skills.git',
    label: 'Anthropic 官方技能库',
    category: 'official',
    description: 'Claude 官方技能合集，适合作为基础技能来源。',
    domesticMirrorUrl: 'https://gitee.com/zhujun12/skills.git',
  },
  {
    name: 'superpowers',
    url: 'https://github.com/obra/superpowers.git',
    label: 'Superpowers 工程技能库',
    category: 'engineering',
    description: '面向复杂开发、TDD、调试和重构的工程技能库。',
    domesticMirrorUrl: 'https://gitee.com/zhujun12/superpowers.git',
  },
  {
    name: 'vercel-agent-skills',
    url: 'https://github.com/vercel-labs/agent-skills.git',
    label: 'Vercel Agent 技能库',
    category: 'official',
    description: '聚焦 Web、全栈、Next.js 和部署场景的技能库。',
    domesticMirrorUrl: 'https://gitee.com/zhujun12/agent-skills.git',
  },
  {
    name: 'huggingface-skills',
    url: 'https://github.com/huggingface/skills.git',
    label: 'Hugging Face 技能库',
    category: 'official',
    description: '面向 Hugging Face 与开源模型生态的技能库。',
    domesticMirrorUrl: 'https://gitee.com/zhujun12/huggingface-skills.git',
  },
  {
    name: 'antigravity-awesome-skills',
    url: 'https://github.com/sickn33/antigravity-awesome-skills.git',
    label: 'Antigravity 技能合集',
    category: 'collection',
    description: '跨平台 AI 技能资源合集。',
    domesticMirrorUrl: 'https://gitee.com/zhujun12/antigravity-awesome-skills.git',
  },
  {
    name: 'awesome-claude-skills',
    url: 'https://github.com/ComposioHQ/awesome-claude-skills.git',
    label: 'Claude 技能资源索引',
    category: 'collection',
    description: 'Claude 技能资源的精选索引，适合发现更多来源。',
    domesticMirrorUrl: 'https://gitee.com/zhujun12/awesome-claude-skills.git',
  },
];

const ALL_BUILTIN_SOURCE_INFOS = [
  DEFAULT_SOURCE_INFO,
  ...BUILTIN_SOURCE_CATALOG,
];

function toConfiguredSource(
  info: BuiltinSourceInfo,
  enabled: boolean,
): Source {
  const source: Source = {
    name: info.name,
    url: info.url,
    enabled,
  };
  if (info.domesticMirrorUrl) {
    source.domesticMirror = {
      url: info.domesticMirrorUrl,
      enabled: true,
    };
  }
  return source;
}

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
      toConfiguredSource(DEFAULT_SOURCE_INFO, true),
      ...BUILTIN_SOURCE_CATALOG.map((info) => toConfiguredSource(info, false)),
    ],
    defaultSource: 'default',
    agents: {
      /** 中央存储：全局安装的实际目录 */
      agents: {
        globalDir: '~/.agents/skills',
        projectDir: './.agents/skills',
      },
      /** 各平台目录：全局时通过软链接指向 ~/.agents/skills */
      claude: {
        globalDir: '~/.claude/skills',
        projectDir: './.claude/skills',
      },
      cursor: {
        globalDir: '~/.cursor/skills',
        projectDir: './.cursor/skills',
      },
      copilot: {
        globalDir: '~/.copilot/skills',
        projectDir: './.copilot/skills',
      },
      codex: {
        globalDir: '~/.codex/skills',
        projectDir: './.codex/skills',
      },
      gemini: {
        globalDir: '~/.gemini/skills',
        projectDir: './.gemini/skills',
      },
      opencode: {
        globalDir: '~/.opencode/skills',
        projectDir: './.opencode/skills',
      },
      openclaw: {
        globalDir: '~/.openclaw/skills',
        projectDir: './.openclaw/skills',
      },
    },
    /** 默认安装目标：全局安装到 agents（中央存储） */
    installTargets: ['agents'],
    settings: {
      sourceRefreshIntervalMinutes: DEFAULT_SOURCE_REFRESH_INTERVAL_MINUTES,
      minimizeToTray: false,
    },
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

function normalizeSourceUrl(url: string): string {
  return url.trim().replace(/\/+$/, '').replace(/\.git$/i, '');
}

function matchesUrl(url: string | undefined, target: string): boolean {
  return typeof url === 'string' && normalizeSourceUrl(url) === target;
}

function builtinUrlKeys(info: BuiltinSourceInfo): string[] {
  return [info.url, info.domesticMirrorUrl]
    .filter((url): url is string => typeof url === 'string')
    .map(normalizeSourceUrl);
}

function legacyMirrorNames(info: BuiltinSourceInfo): string[] {
  return [`${info.name} cn`, `${info.name}-cn`, `${info.name}_cn`];
}

function findBuiltinInfoByLegacyName(name: string): BuiltinSourceInfo | null {
  const normalized = name.trim().toLowerCase();
  return (
    ALL_BUILTIN_SOURCE_INFOS.find((info) =>
      legacyMirrorNames(info).some((legacy) => legacy.toLowerCase() === normalized),
    ) ?? null
  );
}

function findBuiltinInfoForSource(source: Source): BuiltinSourceInfo | null {
  const byName =
    ALL_BUILTIN_SOURCE_INFOS.find((info) => info.name === source.name) ??
    findBuiltinInfoByLegacyName(source.name);
  if (byName) {
    return byName;
  }

  return (
    ALL_BUILTIN_SOURCE_INFOS.find((info) => {
      const keys = builtinUrlKeys(info);
      return (
        keys.some((key) => matchesUrl(source.url, key)) ||
        keys.some((key) => matchesUrl(source.domesticMirror?.url, key))
      );
    }) ?? null
  );
}

function isLegacyMirrorSource(
  source: Source,
  info: BuiltinSourceInfo,
): boolean {
  return legacyMirrorNames(info).some(
    (legacy) => legacy.toLowerCase() === source.name.trim().toLowerCase(),
  );
}

function applyBuiltinInfoToSource(
  source: Source,
  info: BuiltinSourceInfo,
): boolean {
  let dirty = false;
  if (source.name !== info.name) {
    source.name = info.name;
    dirty = true;
  }
  if (source.url !== info.url) {
    source.url = info.url;
    dirty = true;
  }
  if (info.domesticMirrorUrl) {
    if (
      source.domesticMirror?.url !== info.domesticMirrorUrl ||
      typeof source.domesticMirror.enabled !== 'boolean'
    ) {
      const previousEnabled = source.domesticMirror?.enabled;
      source.domesticMirror = {
        url: info.domesticMirrorUrl,
        enabled: previousEnabled ?? true,
      };
      dirty = true;
    }
  } else if (source.domesticMirror !== undefined) {
    delete source.domesticMirror;
    dirty = true;
  }
  return dirty;
}

function mergeSourceState(target: Source, incoming: Source): void {
  target.enabled = target.enabled || incoming.enabled;
  if (target.domesticMirror && incoming.domesticMirror) {
    target.domesticMirror.enabled =
      target.domesticMirror.enabled || incoming.domesticMirror.enabled;
  }
}

function normalizeBuiltinSources(cfg: Config): boolean {
  let dirty = false;
  const normalizedSources: Source[] = [];
  const builtinByName = new Map<string, Source>();

  for (const source of cfg.sources) {
    const info = findBuiltinInfoForSource(source);
    if (!info) {
      normalizedSources.push(source);
      continue;
    }

    const existing = builtinByName.get(info.name);
    if (existing) {
      if (isLegacyMirrorSource(source, info) && existing.domesticMirror) {
        existing.domesticMirror.enabled = true;
      }
      mergeSourceState(existing, source);
      dirty = true;
      continue;
    }

    if (isLegacyMirrorSource(source, info)) {
      const replacement = toConfiguredSource(info, source.enabled);
      normalizedSources.push(replacement);
      builtinByName.set(info.name, replacement);
      dirty = true;
      continue;
    }

    if (applyBuiltinInfoToSource(source, info)) {
      dirty = true;
    }
    normalizedSources.push(source);
    builtinByName.set(info.name, source);
  }

  if (dirty) {
    cfg.sources = normalizedSources;
  }
  return dirty;
}

export function getEffectiveSourceUrl(source: Source): string {
  const mirror = source.domesticMirror;
  if (mirror?.enabled && mirror.url.trim()) {
    return mirror.url.trim();
  }
  return source.url.trim();
}

export function getBuiltinSourceInfo(source: Source): BuiltinSourceInfo | null {
  return findBuiltinInfoForSource(source);
}

export function restoreBuiltinSources(config: Config): string[] {
  if (!Array.isArray(config.sources)) {
    config.sources = [];
  }
  normalizeBuiltinSources(config);

  const names = new Set(config.sources.map((source) => source.name));
  const urls = new Set<string>();
  for (const source of config.sources) {
    urls.add(normalizeSourceUrl(source.url));
    if (source.domesticMirror?.url) {
      urls.add(normalizeSourceUrl(source.domesticMirror.url));
    }
  }
  const added: string[] = [];

  for (const info of BUILTIN_SOURCE_CATALOG) {
    const hasKnownUrl = builtinUrlKeys(info).some((url) => urls.has(url));
    if (names.has(info.name) || hasKnownUrl) {
      continue;
    }
    const source = toConfiguredSource(info, false);
    config.sources.push(source);
    names.add(info.name);
    for (const url of builtinUrlKeys(info)) {
      urls.add(url);
    }
    added.push(info.name);
  }

  return added;
}

function normalizeConfigSources(cfg: Config): boolean {
  const def = getDefaultConfig();
  if (
    !Array.isArray(cfg.sources) ||
    cfg.sources.some(
      (source) =>
        !source ||
        typeof source.name !== 'string' ||
        typeof source.url !== 'string',
    )
  ) {
    cfg.sources = structuredClone(def.sources);
    cfg.defaultSource = def.defaultSource;
    return true;
  }

  let added = false;
  if (typeof cfg.defaultSource !== 'string' || cfg.defaultSource.trim() === '') {
    cfg.defaultSource = def.defaultSource;
    added = true;
  }
  added = normalizeBuiltinSources(cfg) || added;
  return added;
}

export function normalizeAppSettings(settings: unknown): AppSettings {
  const raw =
    settings && typeof settings === 'object' && !Array.isArray(settings)
      ? (settings as Partial<AppSettings>)
      : {};
  const minutes = Number(raw.sourceRefreshIntervalMinutes);
  return {
    sourceRefreshIntervalMinutes:
      Number.isFinite(minutes) && minutes >= 0
        ? Math.min(24 * 60, Math.floor(minutes))
        : DEFAULT_SOURCE_REFRESH_INTERVAL_MINUTES,
    minimizeToTray: raw.minimizeToTray === true,
  };
}

function normalizeConfigSettings(cfg: Config): boolean {
  const normalized = normalizeAppSettings(cfg.settings);
  const dirty =
    !cfg.settings ||
    cfg.settings.sourceRefreshIntervalMinutes !==
      normalized.sourceRefreshIntervalMinutes ||
    cfg.settings.minimizeToTray !== normalized.minimizeToTray;
  cfg.settings = normalized;
  return dirty;
}

export function normalizeTranslationConfig(raw: unknown): TranslationConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { provider: 'none' };
  }
  const r = raw as Partial<TranslationConfig>;
  const provider = r.provider === 'openai' || r.provider === 'cli' ? r.provider : 'none';
  const base: TranslationConfig = { provider };
  if (provider === 'openai') {
    if (typeof r.apiBaseUrl === 'string' && r.apiBaseUrl.trim()) {
      base.apiBaseUrl = r.apiBaseUrl.trim();
    }
    if (typeof r.apiKey === 'string' && r.apiKey.trim()) {
      base.apiKey = r.apiKey.trim();
    }
    if (typeof r.model === 'string' && r.model.trim()) {
      base.model = r.model.trim();
    }
  }
  if (provider === 'cli') {
    if (typeof r.cliCommand === 'string' && r.cliCommand.trim()) {
      base.cliCommand = r.cliCommand.trim();
    }
    if (Array.isArray(r.cliArgs)) {
      base.cliArgs = r.cliArgs.filter((a): a is string => typeof a === 'string');
    }
  }
  return base;
}

export function getTranslationConfig(config: Config): TranslationConfig {
  return normalizeTranslationConfig(config.translation);
}

export function getSourceRefreshMaxAgeMs(config: Config): number {
  const minutes = normalizeAppSettings(config.settings)
    .sourceRefreshIntervalMinutes;
  return minutes > 0 ? minutes * 60_000 : 0;
}

export function loadConfig(options?: ConfigLocationOptions): Config {
  const filePath = getConfigPath(options);
  if (!existsSync(filePath)) {
    return cloneDefaultConfig();
  }

  try {
    const raw = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Config;
    let dirty = normalizeConfigSources(parsed);
    dirty = mergeMissingAgentsFromDefaults(parsed) || dirty;
    dirty = normalizeConfigSettings(parsed) || dirty;
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
