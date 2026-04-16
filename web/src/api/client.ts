export interface Source {
  name: string;
  url: string;
  enabled: boolean;
}

export interface SkillSummary {
  name: string;
  version: string;
  description?: string;
  author?: string;
  tags?: string[];
  sourceName: string;
  installed: boolean;
  installedTargets: string[];
}

export interface SkillDetail {
  meta: {
    name: string;
    version: string;
    description?: string;
    author?: string;
    tags?: string[];
    [key: string]: unknown;
  };
  sourceName: string;
  skillDir: string;
  markdown: string;
  installedTargets: string[];
}

export interface InstalledSkill {
  target: string;
  name: string;
  path: string;
}

export interface SourcesResponse {
  defaultSource: string;
  sources: Source[];
}

async function request<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`无法连接 Suit Skills Web API：${message}`);
  }

  const text = await response.text();
  if (!text.trim()) {
    throw new Error(
      response.ok
        ? 'Suit Skills Web API 返回了空响应'
        : `Suit Skills Web API 无响应：HTTP ${response.status}`,
    );
  }

  let payload: T | { error?: { message?: string } };
  try {
    payload = JSON.parse(text) as T | {
      error?: { message?: string };
    };
  } catch {
    throw new Error(
      `Suit Skills Web API 返回的不是 JSON：${text.slice(0, 120)}`,
    );
  }

  const errorPayload = payload as {
    error?: { message?: string };
  };
  if (!response.ok) {
    const message =
      errorPayload.error?.message
        ? errorPayload.error.message
        : `Request failed: ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

function withParams(path: string, params: Record<string, string | undefined>) {
  const url = new URL(path, window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

export function fetchSources(): Promise<SourcesResponse> {
  return request<SourcesResponse>('/api/sources');
}

export function fetchSkills(params: {
  source?: string;
  q?: string;
  tag?: string;
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
  scope?: string;
  agent?: string;
}): Promise<{ items: InstalledSkill[] }> {
  return request<{ items: InstalledSkill[] }>(
    withParams('/api/installed', params),
  );
}
