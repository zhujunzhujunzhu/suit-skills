export type MetadataSource = 'skill-md' | 'meta-json-fallback' | 'unknown';

export interface Source {
  name: string;
  url: string;
  enabled: boolean;
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

export interface InstallResult {
  target: string;
  scope: 'project' | 'global';
  status: 'installed' | 'skipped';
  path?: string;
  message?: string;
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

export async function fetchSources(): Promise<SourcesResponse> {
  const tauri = await getTauriApi();
  if (tauri) {
    const result = await tauri.tauriGetSources();
    return {
      defaultSource: result.defaultSource,
      sources: result.sources.map((s) => ({
        name: s.name,
        url: s.url,
        enabled: s.enabled,
      })),
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
      sources: result.sources,
      source: newSource ?? { name: requestBody.name, url: requestBody.url, enabled: true },
    };
  }
  return request<SourcesResponse & { source: Source }>('/api/sources', {
    method: 'POST',
    body: JSON.stringify(requestBody),
  });
}

export async function updateSource(
  name: string,
  requestBody: { enabled: boolean },
): Promise<SourcesResponse & { source: Source }> {
  const tauri = await getTauriApi();
  if (tauri) {
    await tauri.tauriUpdateSource(name, requestBody.enabled);
    const result = await tauri.tauriGetSources();
    const updatedSource = result.sources.find((s) => s.name === name);
    return {
      defaultSource: result.defaultSource,
      sources: result.sources,
      source: updatedSource ?? { name, url: '', enabled: requestBody.enabled },
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

export async function removeSource(
  name: string,
): Promise<SourcesResponse & { removed: string }> {
  const tauri = await getTauriApi();
  if (tauri) {
    await tauri.tauriRemoveSource(name);
    const result = await tauri.tauriGetSources();
    return {
      defaultSource: result.defaultSource,
      sources: result.sources,
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
}): Promise<{ items: SkillSummary[] }> {
  const tauri = await getTauriApi();
  if (tauri) {
    const result = await tauri.tauriGetSkillsList({
      source: params.source,
      query: params.q,
      tag: params.tag,
    });
    // 获取已安装状态
    const installed = await tauri.tauriGetInstalledSkills();
    const installedMap = new Map<string, string[]>();
    for (const item of installed.items) {
      const targets = installedMap.get(item.name) ?? [];
      targets.push(item.target);
      installedMap.set(item.name, targets);
    }
    return {
      items: result.items.map((skill) => ({
        name: skill.name,
        version: skill.version,
        description: skill.description,
        author: skill.author,
        tags: skill.tags ?? [],
        sourceName: skill.sourceName,
        installed: installedMap.has(skill.name),
        installedTargets: installedMap.get(skill.name) ?? [],
        metadataSource: 'skill-md',
      })),
    };
  }
  return request<{ items: SkillSummary[] }>(withParams('/api/skills', params));
}

export async function fetchSkillDetail(
  name: string,
  source?: string,
): Promise<SkillDetail> {
  const tauri = await getTauriApi();
  if (tauri) {
    const result = await tauri.tauriGetSkillDetail(name, source);
    const installed = await tauri.tauriGetInstalledSkills();
    const targets = installed.items
      .filter((i) => i.name === name)
      .map((i) => i.target);
    return {
      name: result.name,
      version: result.version,
      description: result.description,
      author: result.author,
      tags: result.tags ?? [],
      sourceName: result.sourceName,
      installed: targets.length > 0,
      installedTargets: targets,
      metadataSource: 'skill-md',
      skillDir: '',
      markdown: result.markdown ?? '',
      frontmatter: {},
    };
  }
  return request<SkillDetail>(
    withParams(`/api/skills/${encodeURIComponent(name)}`, { source }),
  );
}

export async function fetchInstalled(params: {
  scope?: 'all' | 'project' | 'global';
  target?: string;
  q?: string;
}): Promise<{ items: InstalledSkill[] }> {
  const tauri = await getTauriApi();
  if (tauri) {
    const result = await tauri.tauriGetInstalledSkills({
      scope: params.scope === 'all' ? undefined : params.scope,
      target: params.target,
    });
    return {
      items: result.items.map((skill) => ({
        name: skill.name,
        version: skill.version,
        description: skill.description,
        tags: [],
        target: skill.target,
        scope: skill.scope as 'project' | 'global',
        path: skill.path,
        sourceName: skill.sourceName,
        metadataSource: 'skill-md',
      })),
    };
  }
  return request<{ items: InstalledSkill[] }>(
    withParams('/api/installed', params),
  );
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

export async function exportInstalledSkill(requestBody: {
  name: string;
  target: string;
  scope: 'project' | 'global';
}): Promise<void> {
  const tauri = await getTauriApi();
  if (tauri) {
    await tauri.tauriExportSkill({
      name: requestBody.name,
      target: requestBody.target,
      scope: requestBody.scope,
    });
    return;
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
}
