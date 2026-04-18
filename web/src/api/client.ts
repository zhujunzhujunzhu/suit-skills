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
  builtin: boolean;
  label: string;
  category: SourceCategory;
  description: string;
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

export function fetchSources(): Promise<SourcesResponse> {
  return request<SourcesResponse>('/api/sources');
}

export function addSource(requestBody: {
  name: string;
  url: string;
}): Promise<SourcesResponse & { source: Source }> {
  return request<SourcesResponse & { source: Source }>('/api/sources', {
    method: 'POST',
    body: JSON.stringify(requestBody),
  });
}

export function updateSource(
  name: string,
  requestBody: { enabled: boolean },
): Promise<SourcesResponse & { source: Source }> {
  return request<SourcesResponse & { source: Source }>(
    `/api/sources/${encodeURIComponent(name)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(requestBody),
    },
  );
}

export function restoreBuiltinSources(): Promise<
  SourcesResponse & { added: string[] }
> {
  return request<SourcesResponse & { added: string[] }>(
    '/api/sources/restore-builtins',
    { method: 'POST' },
  );
}

export function removeSource(
  name: string,
): Promise<SourcesResponse & { removed: string }> {
  return request<SourcesResponse & { removed: string }>(
    `/api/sources/${encodeURIComponent(name)}`,
    { method: 'DELETE' },
  );
}

export function fetchSkills(params: {
  source?: string;
  q?: string;
  tag?: string;
  refresh?: boolean;
}): Promise<{ items: SkillSummary[] }> {
  return request<{ items: SkillSummary[] }>(withParams('/api/skills', params));
}

export function fetchSkillDetail(
  name: string,
  source?: string,
): Promise<SkillDetail> {
  return request<SkillDetail>(
    withParams(`/api/skills/${encodeURIComponent(name)}`, { source }),
  );
}

export function fetchInstalled(params: {
  scope?: 'all' | 'project' | 'global';
  target?: string;
  q?: string;
}): Promise<{ items: InstalledSkill[] }> {
  return request<{ items: InstalledSkill[] }>(
    withParams('/api/installed', params),
  );
}

export function installSkill(requestBody: {
  identifier: string;
  source?: string;
  targets: string[];
  global?: boolean;
  strategy?: 'overwrite' | 'skip' | 'rename';
}): Promise<{ results: InstallResult[] }> {
  return request<{ results: InstallResult[] }>('/api/install', {
    method: 'POST',
    body: JSON.stringify(requestBody),
  });
}

export function removeInstalledSkill(
  name: string,
  requestBody: { target: string; scope: 'project' | 'global' },
): Promise<{
  status: 'removed';
  name: string;
  target: string;
  scope: 'project' | 'global';
  path: string;
}> {
  return request(`/api/installed/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    body: JSON.stringify(requestBody),
  });
}

export function copyInstalledSkillPackage(requestBody: {
  name: string;
  target: string;
  scope: 'project' | 'global';
}): Promise<{ status: 'copied'; fileName: string; path: string }> {
  return request<{ status: 'copied'; fileName: string; path: string }>(
    '/api/installed/copy-package',
    {
      method: 'POST',
      body: JSON.stringify(requestBody),
    },
  );
}

export function linkInstalledSkillTargets(requestBody: {
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
  return request('/api/installed/link-targets', {
    method: 'POST',
    body: JSON.stringify(requestBody),
  });
}

export async function exportInstalledSkill(requestBody: {
  name: string;
  target: string;
  scope: 'project' | 'global';
}): Promise<void> {
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
