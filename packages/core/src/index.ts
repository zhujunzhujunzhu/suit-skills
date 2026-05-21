export type CoreModule =
  | 'sources'
  | 'skills'
  | 'install'
  | 'cache'
  | 'validate'
  | 'package'
  | 'targets'
  | 'config'
  | 'baseline';

export interface CorePackageInfo {
  name: '@suit-skills/core';
  purpose: 'shared-skills-domain';
  modules: CoreModule[];
}

export const corePackageInfo: CorePackageInfo = {
  name: '@suit-skills/core',
  purpose: 'shared-skills-domain',
  modules: [
    'sources',
    'skills',
    'install',
    'cache',
    'validate',
    'package',
    'targets',
    'config',
    'baseline',
  ],
};

export type {
  AgentMapping,
  AiEditConfig,
  AppSettings,
  Config,
  InstallTarget,
  MetadataSource,
  Source,
  SkillMarkdownMetadata,
  SkillMeta,
  ThemeMode,
  TranslationConfig,
} from './types/index.js';

export {
  findSkillInCache,
  getSkillSourceDir,
  includesInsensitive,
  parseMetaJson,
  parseSkillFrontmatter,
  readSkillMarkdown,
  readSkillMarkdownMetadata,
  scanSkillsFromCache,
  searchSkills,
  updateSkillMarkdownName,
} from './skills/index.js';

export {
  getInstalledSkillDetail,
  getInstalledSkills,
  resolveTargetPath,
} from './targets/agents.js';

export type { ResolveTargetOptions } from './targets/agents.js';

export {
  BUILTIN_INSTALL_TARGET_IDS,
  SKILLS_TARGET_TOKEN,
  UI_HIDDEN_INSTALL_TARGET_IDS,
  detectGlobalEnvironmentHints,
  detectProjectEnvironmentHints,
  getEffectiveInstallTargets,
  labelForUiInstallTarget,
  listUiInstallTargets,
  normalizeInstallTargets,
  parseInstallTargetsCsv,
  resolveDisplayPathForToken,
} from './targets/install-targets.js';

export {
  BUILTIN_SOURCE_CATALOG,
  DEFAULT_SOURCE_INFO,
  DEFAULT_SOURCE_REFRESH_INTERVAL_MINUTES,
  DEFAULT_THEME_COLOR,
  getAiEditConfig,
  getBuiltinSourceInfo,
  getConfigDir,
  getConfigPath,
  getConfigValue,
  getDefaultConfig,
  getEffectiveSourceUrl,
  getSourceRefreshMaxAgeMs,
  getTranslationConfig,
  loadConfig,
  normalizeAiEditConfig,
  normalizeAppSettings,
  normalizeTranslationConfig,
  restoreBuiltinSources,
  saveConfig,
  setConfigValue,
} from './config/index.js';

export type {
  BuiltinSourceCategory,
  BuiltinSourceInfo,
  ConfigLocationOptions,
} from './config/index.js';

export {
  REFRESH_CACHE_LOCAL_WARNING,
  getBaselinesDir,
  getCacheDir,
  getSourceCacheDir,
  refreshCache,
} from './cache/index.js';

export type {
  CloneOrPullRepoFn,
  RefreshCacheOptions,
  RefreshCacheResult,
} from './cache/index.js';

export {
  DEFAULT_GIT_TIMEOUT_MS,
  cloneOrPullRepo,
  cloneRepo,
  isGitAvailable,
  pullRepo,
} from './sources/git.js';

export type {
  CloneOrPullRepoResult,
  GitModuleOptions,
  GitSpawnSync,
  PullRepoResult,
} from './sources/git.js';

export {
  captureInstalledSkillBaseline,
  getInstalledSkillBaselineKey,
  getInstalledSkillRealPath,
  hasInstalledSkillBaseline,
  readInstalledSkillBaselineMeta,
  restoreInstalledSkillFileFromBaseline,
  restoreInstalledSkillFromBaseline,
} from './baseline/index.js';

export type { InstalledSkillBaselineMeta } from './baseline/index.js';

export {
  checkConflict,
  installSkill,
  installSkillWithConflict,
} from './install/index.js';

export type {
  ConflictCheckResult,
  ConflictResolution,
  InstallWithConflictResult,
} from './install/index.js';

export {
  copyDir,
  createSymlink,
  eq,
  gt,
  parseVersion,
} from './utils/fs.js';

export type { SemVer } from './utils/fs.js';

export {
  parseSkillIdentifier,
  validateSkillName,
} from './utils/validate.js';

export {
  ensureDir,
  urlToCacheDirName,
} from './utils/path.js';

export { moduleDir } from './utils/module.js';
