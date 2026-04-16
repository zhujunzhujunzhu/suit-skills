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
}

/** 智能体目录映射 */
export interface AgentMapping {
  globalDir: string;
  projectDir: string;
}

/** 全局配置 */
export interface Config {
  sources: Source[];
  defaultSource: string;
  agents: Record<string, AgentMapping>;
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
