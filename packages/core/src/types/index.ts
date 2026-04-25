export interface SkillMeta {
  name: string;
  version: string;
  description?: string;
  author?: string;
  tags?: string[];
  [key: string]: unknown;
}

export interface Source {
  name: string;
  url: string;
  enabled: boolean;
  domesticMirror?: {
    url: string;
    enabled: boolean;
  };
}

export interface AgentMapping {
  globalDir: string;
  projectDir: string;
}

export interface InstallTarget {
  type: 'global' | 'project' | 'agent';
  path: string;
}

export type ThemeMode = 'default' | 'custom';

export interface AppSettings {
  sourceRefreshIntervalMinutes: number;
  minimizeToTray: boolean;
  themeMode: ThemeMode;
  themeColor: string;
}

export interface TranslationConfig {
  provider: 'openai' | 'cli' | 'none';
  apiBaseUrl?: string;
  apiKey?: string;
  model?: string;
  cliCommand?: string;
  cliArgs?: string[];
}

export interface AiEditConfig {
  provider: 'openai' | 'cli' | 'none';
  apiBaseUrl?: string;
  apiKey?: string;
  model?: string;
  cliCommand?: string;
  cliArgs?: string[];
}

export interface Config {
  sources: Source[];
  defaultSource: string;
  agents: Record<string, AgentMapping>;
  settings?: AppSettings;
  installTargets?: string[];
  installTargetsAuto?: boolean;
  translation?: TranslationConfig;
  aiEditing?: AiEditConfig;
}

export type MetadataSource = 'skill-md' | 'meta-json-fallback' | 'unknown';

export interface SkillMarkdownMetadata {
  meta: SkillMeta;
  frontmatter: Record<string, unknown>;
  markdown: string;
  metadataSource: MetadataSource;
}
