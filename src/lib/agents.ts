import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config, SkillMeta } from '../types/index.js';
import { readSkillMarkdownMetadata } from './skills.js';

export interface ResolveTargetOptions {
  /** 全局安装（`-g`） */
  global?: boolean;
  /** 智能体名称，如 `claude`；未指定则为默认项目/全局 skills 目录 */
  agent?: string;
}

function withTrailingSlash(dir: string): string {
  return dir.endsWith('/') ? dir : `${dir}/`;
}

/**
 * 根据配置与安装模式解析 skill 安装目录（返回值带尾部 `/`，与 CLI 文档一致）。
 */
export function resolveTargetPath(
  config: Config,
  options?: ResolveTargetOptions,
): string {
  const isGlobal = options?.global ?? false;
  const agentKey = options?.agent;

  if (agentKey !== undefined && agentKey !== '') {
    const mapping = config.agents[agentKey];
    if (!mapping) {
      throw new Error(`Unknown agent: ${agentKey}`);
    }
    const raw = isGlobal ? mapping.globalDir : mapping.projectDir;
    return withTrailingSlash(raw);
  }

  if (isGlobal) {
    return withTrailingSlash('~/.suit-skills/skills');
  }
  return withTrailingSlash('./.skills');
}

/**
 * 扫描目录下一层子文件夹名，作为已安装的 skill 名称列表（字典序）。
 */
export function getInstalledSkills(targetDir: string): string[] {
  if (!existsSync(targetDir)) {
    return [];
  }
  return readdirSync(targetDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/**
 * 获取已安装 skill 的详细信息（从 SKILL.md 或 meta.json 读取）
 */
export function getInstalledSkillDetail(
  targetDir: string,
  skillName: string,
): (SkillMeta & { metadataSource?: string }) | null {
  const skillDir = join(targetDir, skillName);
  if (!existsSync(skillDir)) {
    return null;
  }
  try {
    const metadata = readSkillMarkdownMetadata(skillDir);
    return {
      ...metadata.meta,
      metadataSource: metadata.metadataSource,
    };
  } catch {
    return null;
  }
}
