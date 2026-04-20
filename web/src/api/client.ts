export type MetadataSource = 'skill-md' | 'meta-json-fallback' | 'unknown';
export type SourceCategory =
  | 'official'
  | 'engineering'
  | 'collection'
  | 'cn'
  | 'specialized'
  | 'custom';

export interface Source {
  name: string;
  url: string;
  enabled: boolean;
  domesticMirror?: {
    url: string;
    enabled: boolean;
  };
  builtin: boolean;
  label: string;
  category: SourceCategory;
  description: string;
  effectiveUrl: string;
}

export interface SkillSummary {
  name: string;
  version?: string;
  description?: string;
  author?: string;
  tags: string[];
  sourceName: string;
  installed: boolean;
  installedTargets: string[];
  metadataSource: MetadataSource;
}

export interface SkillDetail extends SkillSummary {
  skillDir: string;
  markdown: string;
  frontmatter: Record<string, unknown>;
}

export interface InstalledSkill {
  name: string;
  version?: string;
  description?: string;
  tags: string[];
  target: string;
  scope: 'project' | 'global';
  path: string;
  sourceName?: string;
  metadataSource: MetadataSource;
}

export interface SourcesResponse {
  defaultSource: string;
  sources: Source[];
}

export interface SourceWarning {
  sourceName: string;
  url: string;
  message: string;
  usingCache: boolean;
}

export interface AppSettings {
  sourceRefreshIntervalMinutes: number;
  minimizeToTray: boolean;
}

export interface InstallResult {
  target: string;
  scope: 'project' | 'global';
  status: 'installed' | 'skipped';
  path?: string;
  message?: string;
}

export interface InstallTargetOption {
  id: string;
  label: string;
  globalDir?: string;
  projectDir?: string;
  globalPath?: string;
  projectPath?: string;
  globalExists?: boolean;
  projectExists?: boolean;
  builtin?: boolean;
  hidden?: boolean;
  editable?: boolean;
  removable?: boolean;
}

export interface SkillLibraryTarget {
  id: string;
  label: string;
  globalDir: string;
  projectDir: string;
  globalPath: string;
  projectPath: string;
  globalExists: boolean;
  projectExists: boolean;
}

export interface ExportResult {
  status: 'exported' | 'cancelled';
  fileName?: string;
  path?: string;
}

// 动态检测运行环境并导入 Tauri API
const getTauriApi = async () => {
  if (typeof window !== 'undefined' && '__TAURI__' in window) {
    return import('./tauri');
  }
  return null;
};

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    if (response.ok) return undefined as T;
    throw new Error(`HTTP ${response.status}`);
  }

  let payload: T | { error?: { message?: string } };
  try {
    payload = JSON.parse(text) as T | { error?: { message?: string } };
  } catch {
    throw new Error(`API returned non-JSON response: ${text.slice(0, 120)}`);
  }

  if (!response.ok) {
    const message =
      (payload as { error?: { message?: string } }).error?.message ??
      `Request failed: ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      headers:
        options.body instanceof FormData
          ? options.headers
          : {
              'content-type': 'application/json',
              ...options.headers,
            },
      ...options,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot reach Suit Skills Web API: ${message}`);
  }
  return parseJson<T>(response);
}

function withParams(
  path: string,
  params: Record<string, boolean | string | undefined>,
) {
  const url = new URL(path, window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return `${url.pathname}${url.search}`;
}

function normalizeSource(
  source: Pick<Source, 'name' | 'url' | 'enabled'> & {
    domesticMirror?: Source['domesticMirror'];
    builtin?: boolean;
    label?: string;
    category?: SourceCategory | string;
    description?: string;
    effectiveUrl?: string;
  },
): Source {
  const effectiveUrl =
    source.effectiveUrl ??
    (source.domesticMirror?.enabled ? source.domesticMirror.url : source.url);
  return {
    name: source.name,
    url: source.url,
    enabled: source.enabled,
    domesticMirror: source.domesticMirror,
    builtin: source.builtin ?? false,
    label: source.label ?? source.name,
    category: (source.category as SourceCategory | undefined) ?? 'custom',
    description: source.description ?? 'User-defined skill source.',
    effectiveUrl,
  };
}

function textField(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return undefined;
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(textField)
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeSkillSummary(
  skill: Partial<SkillSummary> & { name?: unknown; version?: unknown },
): SkillSummary {
  return {
    name: textField(skill.name) ?? '',
    version: textField(skill.version),
    description: textField(skill.description),
    author: textField(skill.author),
    tags: normalizeTags(skill.tags),
    sourceName: textField(skill.sourceName) ?? '',
    installed: skill.installed === true,
    installedTargets: normalizeTags(skill.installedTargets),
    metadataSource:
      skill.metadataSource === 'meta-json-fallback' ||
      skill.metadataSource === 'unknown'
        ? skill.metadataSource
        : 'skill-md',
  };
}

function normalizeInstalledSkill(
  skill: Partial<InstalledSkill> & { name?: unknown },
): InstalledSkill {
  return {
    name: textField(skill.name) ?? '',
    version: textField(skill.version),
    description: textField(skill.description),
    tags: normalizeTags(skill.tags),
    target: textField(skill.target) ?? '',
    scope: skill.scope === 'global' ? 'global' : 'project',
    path: textField(skill.path) ?? '',
    sourceName: textField(skill.sourceName),
    metadataSource:
      skill.metadataSource === 'meta-json-fallback' ||
      skill.metadataSource === 'unknown'
        ? skill.metadataSource
        : 'skill-md',
  };
}

function normalizeSettings(value: unknown): AppSettings {
  const raw =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Partial<AppSettings>)
      : {};
  const minutes = Number(raw.sourceRefreshIntervalMinutes);
  return {
    sourceRefreshIntervalMinutes:
      Number.isFinite(minutes) && minutes >= 0
        ? Math.min(24 * 60, Math.floor(minutes))
        : 5,
    minimizeToTray: raw.minimizeToTray === true,
  };
}

export async function fetchSettings(): Promise<AppSettings> {
  const tauri = await getTauriApi();
  if (tauri) {
    return normalizeSettings(await tauri.tauriGetConfigValue('settings'));
  }
  return normalizeSettings(await request<AppSettings>('/api/settings'));
}

export async function updateSettings(
  settings: Partial<AppSettings>,
): Promise<AppSettings> {
  const tauri = await getTauriApi();
  if (tauri) {
    const current = normalizeSettings(await tauri.tauriGetConfigValue('settings'));
    const next = normalizeSettings({ ...current, ...settings });
    await tauri.tauriSetConfigValue('settings', next);
    return next;
  }
  return normalizeSettings(
    await request<AppSettings>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    }),
  );
}

export async function fetchInstallTargets(): Promise<{
  library?: SkillLibraryTarget;
  targets: InstallTargetOption[];
}> {
  const tauri = await getTauriApi();
  if (tauri) {
    return tauri.tauriGetInstallTargets();
  }
  return request<{ library?: SkillLibraryTarget; targets: InstallTargetOption[] }>(
    '/api/install-targets',
  );
}

export async function addInstallTarget(requestBody: {
  id: string;
  globalDir: string;
  projectDir: string;
}): Promise<{ library?: SkillLibraryTarget; targets: InstallTargetOption[] }> {
  const tauri = await getTauriApi();
  if (tauri) {
    await tauri.tauriAddInstallTarget({
      id: requestBody.id,
      globalDir: requestBody.globalDir,
      projectDir: requestBody.projectDir,
    });
    return tauri.tauriGetInstallTargets();
  }
  return request<{ library?: SkillLibraryTarget; targets: InstallTargetOption[] }>(
    '/api/install-targets',
    {
      method: 'POST',
      body: JSON.stringify(requestBody),
    },
  );
}

export async function updateInstallTarget(
  id: string,
  requestBody: {
    globalDir: string;
    projectDir: string;
  },
): Promise<{ library?: SkillLibraryTarget; targets: InstallTargetOption[] }> {
  const tauri = await getTauriApi();
  if (tauri) {
    await tauri.tauriRunCommand([
      'targets',
      'edit',
      id,
      '--global-dir',
      requestBody.globalDir,
      '--project-dir',
      requestBody.projectDir,
    ]);
    return tauri.tauriGetInstallTargets();
  }
  return request<{ library?: SkillLibraryTarget; targets: InstallTargetOption[] }>(
    `/api/install-targets/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(requestBody),
    },
  );
}

export async function removeInstallTarget(
  id: string,
): Promise<{ library?: SkillLibraryTarget; targets: InstallTargetOption[] }> {
  const tauri = await getTauriApi();
  if (tauri) {
    await tauri.tauriRunCommand(['targets', 'remove', id]);
    return tauri.tauriGetInstallTargets();
  }
  return request<{ library?: SkillLibraryTarget; targets: InstallTargetOption[] }>(
    `/api/install-targets/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}

export async function fetchSources(): Promise<SourcesResponse> {
  const tauri = await getTauriApi();
  if (tauri) {
    const result = await tauri.tauriGetSources();
    return {
      defaultSource: result.defaultSource,
      sources: result.sources.map(normalizeSource),
    };
  }
  return request<SourcesResponse>('/api/sources');
}

export async function addSource(requestBody: {
  name: string;
  url: string;
}): Promise<SourcesResponse & { source: Source }> {
  const tauri = await getTauriApi();
  if (tauri) {
    await tauri.tauriAddSource(requestBody.name, requestBody.url);
    const result = await tauri.tauriGetSources();
    const newSource = result.sources.find((s) => s.name === requestBody.name);
    return {
      defaultSource: result.defaultSource,
      sources: result.sources.map(normalizeSource),
      source: normalizeSource(
        newSource ?? { name: requestBody.name, url: requestBody.url, enabled: true },
      ),
    };
  }
  return request<SourcesResponse & { source: Source }>('/api/sources', {
    method: 'POST',
    body: JSON.stringify(requestBody),
  });
}

export async function updateSource(
  name: string,
  requestBody: { enabled?: boolean; domesticMirror?: { enabled?: boolean } },
): Promise<SourcesResponse & { source: Source }> {
  const tauri = await getTauriApi();
  if (tauri) {
    if (requestBody.enabled !== undefined) {
      await tauri.tauriUpdateSource(name, requestBody.enabled);
    }
    if (requestBody.domesticMirror?.enabled !== undefined) {
      await tauri.tauriRunCommand([
        'source',
        'mirror',
        name,
        requestBody.domesticMirror.enabled ? 'on' : 'off',
      ]);
    }
    const result = await tauri.tauriGetSources();
    const updatedSource = result.sources.find((s) => s.name === name);
    return {
      defaultSource: result.defaultSource,
      sources: result.sources.map(normalizeSource),
      source: normalizeSource(updatedSource ?? { name, url: '', enabled: requestBody.enabled ?? true }),
    };
  }
  return request<SourcesResponse & { source: Source }>(
    `/api/sources/${encodeURIComponent(name)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(requestBody),
    },
  );
}

export async function restoreBuiltinSources(): Promise<
  SourcesResponse & { added: string[] }
> {
  const tauri = await getTauriApi();
  if (tauri) {
    const stdout = await tauri.tauriRunCommand([
      'source',
      'restore-builtins',
      '--json',
    ]);
    return JSON.parse(stdout) as SourcesResponse & { added: string[] };
  }
  return request<SourcesResponse & { added: string[] }>(
    '/api/sources/restore-builtins',
    { method: 'POST' },
  );
}

export async function removeSource(
  name: string,
): Promise<SourcesResponse & { removed: string }> {
  const tauri = await getTauriApi();
  if (tauri) {
    await tauri.tauriRemoveSource(name);
    const result = await tauri.tauriGetSources();
    return {
      defaultSource: result.defaultSource,
      sources: result.sources.map(normalizeSource),
      removed: name,
    };
  }
  return request<SourcesResponse & { removed: string }>(
    `/api/sources/${encodeURIComponent(name)}`,
    { method: 'DELETE' },
  );
}

export async function fetchSkills(params: {
  source?: string;
  q?: string;
  tag?: string;
  refresh?: boolean;
}): Promise<{ items: SkillSummary[]; warnings: SourceWarning[] }> {
  const tauri = await getTauriApi();
  if (tauri) {
    const result = await tauri.tauriGetSkillsList({
      source: params.source,
      query: params.q,
      tag: params.tag,
      refresh: params.refresh,
    });
    // 与已安装页默认「全部范围」一致，否则全局安装的技能在库里会一直显示未安装
    const installed = await tauri.tauriGetInstalledSkills({ scope: 'all' });
    const installedMap = new Map<string, string[]>();
    for (const item of installed.items) {
      const targets = installedMap.get(item.name) ?? [];
      targets.push(item.target);
      installedMap.set(item.name, targets);
    }
    return {
      items: result.items.map((skill) => ({
        ...normalizeSkillSummary(skill),
        installed: installedMap.has(skill.name),
        installedTargets: installedMap.get(skill.name) ?? [],
      })),
      warnings: [],
    };
  }
  const result = await request<{ items: SkillSummary[]; warnings: SourceWarning[] }>(
    withParams('/api/skills', params),
  );
  return {
    ...result,
    items: result.items.map(normalizeSkillSummary),
  };
}

export async function fetchSkillDetail(
  name: string,
  source?: string,
): Promise<SkillDetail> {
  const tauri = await getTauriApi();
  if (tauri) {
    const result = await tauri.tauriGetSkillDetail(name, source);
    const installed = await tauri.tauriGetInstalledSkills({ scope: 'all' });
    const targets = installed.items
      .filter((i) => i.name === name)
      .map((i) => i.target);
    const summary = normalizeSkillSummary({
      ...result,
      installed: targets.length > 0,
      installedTargets: targets,
    });
    return {
      ...summary,
      skillDir: '',
      markdown: result.markdown ?? '',
      frontmatter: {},
    };
  }
  const result = await request<SkillDetail>(
    withParams(`/api/skills/${encodeURIComponent(name)}`, { source }),
  );
  return {
    ...normalizeSkillSummary(result),
    skillDir: textField(result.skillDir) ?? '',
    markdown: textField(result.markdown) ?? '',
    frontmatter:
      result.frontmatter &&
      typeof result.frontmatter === 'object' &&
      !Array.isArray(result.frontmatter)
        ? result.frontmatter
        : {},
  };
}

export async function fetchInstalled(params: {
  scope?: 'all' | 'project' | 'global';
  target?: string;
  q?: string;
}): Promise<{ items: InstalledSkill[] }> {
  const tauri = await getTauriApi();
  if (tauri) {
    const result = await tauri.tauriGetInstalledSkills({
      scope: params.scope,
      target: params.target,
    });
    return {
      items: result.items.map(normalizeInstalledSkill),
    };
  }
  const result = await request<{ items: InstalledSkill[] }>(
    withParams('/api/installed', params),
  );
  return {
    items: result.items.map(normalizeInstalledSkill),
  };
}

export async function installSkill(requestBody: {
  identifier: string;
  source?: string;
  targets: string[];
  global?: boolean;
  strategy?: 'overwrite' | 'skip' | 'rename';
}): Promise<{ results: InstallResult[] }> {
  const tauri = await getTauriApi();
  if (tauri) {
    await tauri.tauriInstallSkill({
      identifier: requestBody.identifier,
      source: requestBody.source,
      targets: requestBody.targets,
      global: requestBody.global ?? true,
    });
    // 返回模拟结果
    return {
      results: requestBody.targets.map((target) => ({
        target,
        scope: requestBody.global ? 'global' : 'project',
        status: 'installed',
      })),
    };
  }
  return request<{ results: InstallResult[] }>('/api/install', {
    method: 'POST',
    body: JSON.stringify(requestBody),
  });
}

export async function removeInstalledSkill(
  name: string,
  requestBody: { target: string; scope: 'project' | 'global' },
): Promise<{
  status: 'removed';
  name: string;
  target: string;
  scope: 'project' | 'global';
  path: string;
}> {
  const tauri = await getTauriApi();
  if (tauri) {
    await tauri.tauriRemoveSkill({
      name,
      target: requestBody.target,
      scope: requestBody.scope,
    });
    return {
      status: 'removed',
      name,
      target: requestBody.target,
      scope: requestBody.scope,
      path: '',
    };
  }
  return request(`/api/installed/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    body: JSON.stringify(requestBody),
  });
}

export async function copyInstalledSkillPackage(requestBody: {
  name: string;
  target: string;
  scope: 'project' | 'global';
}): Promise<{ status: 'copied'; fileName: string; path: string }> {
  const tauri = await getTauriApi();
  if (tauri) {
    const stdout = await tauri.tauriRunCommand([
      'copy-package',
      requestBody.name,
      '--target',
      requestBody.target,
      '--scope',
      requestBody.scope,
      '--json',
    ]);
    return JSON.parse(stdout) as {
      status: 'copied';
      fileName: string;
      path: string;
    };
  }
  return request<{ status: 'copied'; fileName: string; path: string }>(
    '/api/installed/copy-package',
    {
      method: 'POST',
      body: JSON.stringify(requestBody),
    },
  );
}

export async function linkInstalledSkillTargets(requestBody: {
  name: string;
  target: string;
  scope: 'project' | 'global';
  targets: string[];
}): Promise<{
  results: {
    target: string;
    scope: 'project' | 'global';
    status: 'linked' | 'skipped';
    path: string;
    message?: string;
  }[];
}> {
  const tauri = await getTauriApi();
  if (tauri) {
    const stdout = await tauri.tauriRunCommand([
      'link-targets',
      requestBody.name,
      '--target',
      requestBody.target,
      '--scope',
      requestBody.scope,
      '--targets',
      requestBody.targets.join(','),
      '--json',
    ]);
    return JSON.parse(stdout) as {
      results: {
        target: string;
        scope: 'project' | 'global';
        status: 'linked' | 'skipped';
        path: string;
        message?: string;
      }[];
    };
  }
  return request('/api/installed/link-targets', {
    method: 'POST',
    body: JSON.stringify(requestBody),
  });
}

export async function exportInstalledSkill(requestBody: {
  name: string;
  target: string;
  scope: 'project' | 'global';
}): Promise<ExportResult> {
  const tauri = await getTauriApi();
  if (tauri) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const outputPath = await save({
      title: `Export ${requestBody.name}`,
      defaultPath: `${requestBody.name}.zip`,
      filters: [{ name: 'Zip archive', extensions: ['zip'] }],
    });
    if (!outputPath) {
      return { status: 'cancelled' };
    }
    const stdout = await tauri.tauriRunCommand([
      'export',
      requestBody.name,
      '--target',
      requestBody.target,
      '--scope',
      requestBody.scope,
      '--out',
      outputPath,
      '--json',
    ]);
    return JSON.parse(stdout) as ExportResult;
  }
  const response = await fetch('/api/installed/export', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(requestBody),
  });
  if (!response.ok) {
    await parseJson<never>(response);
    return;
  }
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') ?? '';
  const fileName =
    disposition.match(/filename="([^"]+)"/)?.[1] ?? `${requestBody.name}.zip`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return { status: 'exported', fileName };
}

// ---------------------------------------------------------------------------
// Skill 文件浏览器
// ---------------------------------------------------------------------------

export interface SkillFileNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children?: SkillFileNode[];
}

export interface SkillFileContent {
  path: string;
  content?: string;
  contentBase64?: string;
  encoding: 'text' | 'base64' | 'binary';
  previewable: boolean;
  ext: string;
  size: number;
}

export async function fetchSkillFiles(
  skillName: string,
  source?: string,
): Promise<{ files: SkillFileNode[] }> {
  return request(withParams(`/api/skills/${encodeURIComponent(skillName)}/files`, { source }));
}

export async function fetchSkillFileContent(
  skillName: string,
  filePath: string,
  source?: string,
): Promise<SkillFileContent> {
  const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
  return request(
    withParams(`/api/skills/${encodeURIComponent(skillName)}/files/${encodedPath}`, { source }),
  );
}

// ---------------------------------------------------------------------------
// 翻译
// ---------------------------------------------------------------------------

export type TranslationProvider = 'openai' | 'cli' | 'none';

export interface TranslationConfig {
  provider: TranslationProvider;
  apiBaseUrl?: string;
  apiKey?: string;
  model?: string;
  cliCommand?: string;
  cliArgs?: string[];
}

export interface TranslateResult {
  translated: string;
  provider: string;
}

export async function fetchTranslationConfig(): Promise<TranslationConfig> {
  return request('/api/translation-config');
}

export async function updateTranslationConfig(
  config: Partial<TranslationConfig>,
): Promise<TranslationConfig> {
  return request('/api/translation-config', {
    method: 'PATCH',
    body: JSON.stringify(config),
  });
}

export async function translateText(
  text: string,
  targetLang = '简体中文',
): Promise<TranslateResult> {
  return request('/api/translate', {
    method: 'POST',
    body: JSON.stringify({ text, targetLang }),
  });
}
