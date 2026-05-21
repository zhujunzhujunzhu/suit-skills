import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '../types/index.js';
import { resolveTargetPath } from './agents.js';

export const SKILLS_TARGET_TOKEN = 'skills';

/**
 * 当前项目目录下若已存在某智能体的约定根目录（如 `./.cursor`），则认为该仓库在使用对应工具（弱检测）。
 * 仅遍历 `config.agents` 中已配置的项，与 `projectDir` 首段路径对齐。
 */
export function detectProjectEnvironmentHints(
  cwd: string,
  config: Config,
): string[] {
  const out: string[] = [];
  for (const [key, mapping] of Object.entries(config.agents)) {
    const rel = mapping.projectDir.replace(/^\.\//, '').trim();
    if (!rel) continue;
    const root = rel.split('/')[0]!;
    if (!root) continue;
    if (existsSync(join(cwd, root))) {
      out.push(key);
    }
  }
  return out;
}

function mergeTargetListsUnique(base: string[], extra: string[]): string[] {
  const seen = new Set(base);
  const out = [...base];
  for (const e of extra) {
    if (!seen.has(e)) {
      seen.add(e);
      out.push(e);
    }
  }
  return out;
}

/** 用户主目录下若存在对应目录，则认为可能已具备该环境（弱检测，仅供参考）。 */
export function detectGlobalEnvironmentHints(userHome: string): string[] {
  const pairs: { dir: string; key: string }[] = [
    { dir: '.claude', key: 'claude' },
    { dir: '.cursor', key: 'cursor' },
    { dir: '.agents', key: 'agents' },
    { dir: '.copilot', key: 'copilot' },
    { dir: '.codex', key: 'codex' },
    { dir: '.gemini', key: 'gemini' },
    { dir: '.opencode', key: 'opencode' },
    { dir: '.openclaw', key: 'openclaw' },
  ];
  const out: string[] = [];
  for (const { dir, key } of pairs) {
    if (existsSync(join(userHome, dir))) {
      out.push(key);
    }
  }
  return out;
}

/** 从配置得到有效的安装目标列表；非法项跳过；未配置时为空数组（不再默认含 `skills`）。 */
export function normalizeInstallTargets(config: Config): string[] {
  const raw = config.installTargets;
  if (!raw?.length) {
    return [];
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of raw) {
    const k = t.trim();
    if (!k) continue;
    if (k === SKILLS_TARGET_TOKEN) {
      if (!seen.has(SKILLS_TARGET_TOKEN)) {
        seen.add(SKILLS_TARGET_TOKEN);
        out.push(SKILLS_TARGET_TOKEN);
      }
      continue;
    }
    if (config.agents[k]) {
      if (!seen.has(k)) {
        seen.add(k);
        out.push(k);
      }
    }
  }
  return out;
}

export function parseInstallTargetsCsv(csv: string, config: Config): string[] {
  const parts = csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    if (p === SKILLS_TARGET_TOKEN) {
      if (!seen.has(SKILLS_TARGET_TOKEN)) {
        seen.add(SKILLS_TARGET_TOKEN);
        out.push(SKILLS_TARGET_TOKEN);
      }
      continue;
    }
    if (!config.agents[p]) {
      throw new Error(`Unknown install target: ${p}`);
    }
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  if (out.length === 0) {
    throw new Error('At least one install target required');
  }
  return out;
}

/**
 * `--agent` 优先；其次 `--env` CSV；否则使用配置中的 `installTargets`，
 * 并在 `installTargetsAuto !== false` 时并入 `cwd` 下检测到的项目级智能体目录。
 */
export function getEffectiveInstallTargets(
  config: Config,
  options: { agent?: string; envCsv?: string },
  cwd: string,
): string[] {
  if (options.agent !== undefined && options.agent !== '') {
    return [options.agent];
  }
  if (options.envCsv !== undefined && options.envCsv.trim() !== '') {
    return parseInstallTargetsCsv(options.envCsv, config);
  }
  const base = normalizeInstallTargets(config);
  if (config.installTargetsAuto === false) {
    return base;
  }
  const hints = detectProjectEnvironmentHints(cwd, config);
  return mergeTargetListsUnique(base, hints);
}

export function resolveDisplayPathForToken(
  config: Config,
  token: string,
  isGlobal: boolean,
): string {
  if (token === SKILLS_TARGET_TOKEN) {
    return resolveTargetPath(config, { global: isGlobal });
  }
  return resolveTargetPath(config, { global: isGlobal, agent: token });
}

/** 不在安装勾选 UI 中展示（中央仓或暂不支持勾选的产品） */
export const UI_HIDDEN_INSTALL_TARGET_IDS = new Set([
  'agents',
  'copilot',
]);

export const BUILTIN_INSTALL_TARGET_IDS = new Set([
  'agents',
  'claude',
  'cursor',
  'copilot',
  'codex',
  'gemini',
  'opencode',
  'openclaw',
]);

export function labelForUiInstallTarget(id: string): string {
  const map: Record<string, string> = {
    claude: 'Claude Code',
    cursor: 'Cursor',
    codex: 'OpenAI Codex',
    gemini: 'Gemini CLI',
    opencode: 'OpenCode',
    openclaw: 'OpenClaw',
  };
  return map[id] ?? id;
}

export function listUiInstallTargets(config: Config): { id: string; label: string }[] {
  return Object.keys(config.agents)
    .filter((id) => !UI_HIDDEN_INSTALL_TARGET_IDS.has(id))
    .sort((a, b) => a.localeCompare(b))
    .map((id) => ({ id, label: labelForUiInstallTarget(id) }));
}
