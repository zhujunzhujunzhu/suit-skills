/** Skill 元数据 */
export interface SkillMeta {
  name: string;
  version: string;
  description?: string;
  author?: string;
  tags?: string[];
  [key: string]: unknown;
}

/** 远程源 */
export interface Source {
  name: string;
  url: string;
  enabled: boolean;
  domesticMirror?: {
    url: string;
    enabled: boolean;
  };
}

/** 智能体目录映射 */
export interface AgentMapping {
  globalDir: string;
  projectDir: string;
}

export interface AppSettings {
  sourceRefreshIntervalMinutes: number;
  minimizeToTray: boolean;
}

/** Web UI 中展示和管理的 AI coding agent 配置 */
export interface WebInstallTarget {
  id: string;
  label: string;
  globalDir: string;
  projectDir: string;
  globalPath: string;
  projectPath: string;
  globalExists: boolean;
  projectExists: boolean;
  builtin: boolean;
  hidden: boolean;
  editable: boolean;
  removable: boolean;
}

/** 中央技能库位置，实际安装目录；其它 agent 通过链接启用 */
export interface WebSkillLibraryTarget {
  id: string;
  label: string;
  globalDir: string;
  projectDir: string;
  globalPath: string;
  projectPath: string;
  globalExists: boolean;
  projectExists: boolean;
}

/** 全局配置 */
export interface Config {
  sources: Source[];
  defaultSource: string;
  agents: Record<string, AgentMapping>;
  settings?: AppSettings;
  /**
   * 项目级显式安装目标（`skills` = `./.skills/`，其余为 `agents` 中的键）。
   * 未配置或为空时不包含任何项，由目录检测（`installTargetsAuto`）或 `--agent` / `--env` 决定。
   */
  installTargets?: string[];
  /**
   * 为 `false` 时仅使用 `installTargets`，不根据项目目录自动追加检测到的智能体。
   * 未设置或 `true`：在未传 `--agent` / `--env` 时，会把「当前项目下已存在的智能体配置目录」并入目标（弱检测）。
   */
  installTargetsAuto?: boolean;
}

/** 安装目标 */
export interface InstallTarget {
  type: 'global' | 'project' | 'agent';
  path: string;
}

export type MetadataSource = 'skill-md' | 'meta-json-fallback' | 'unknown';

export interface SkillMarkdownMetadata {
  meta: SkillMeta;
  frontmatter: Record<string, unknown>;
  markdown: string;
  metadataSource: MetadataSource;
}

export interface WebSkillSummary extends SkillMeta {
  sourceName: string;
  installed: boolean;
  installedTargets: string[];
  metadataSource: MetadataSource;
}

export interface WebSkillDetail extends SkillMeta {
  sourceName: string;
  skillDir: string;
  markdown: string;
  frontmatter: Record<string, unknown>;
  installedTargets: string[];
  metadataSource: MetadataSource;
}

export interface WebInstalledSkill extends SkillMeta {
  target: string;
  scope: 'project' | 'global';
  path: string;
  sourceName?: string;
  metadataSource: MetadataSource;
}
