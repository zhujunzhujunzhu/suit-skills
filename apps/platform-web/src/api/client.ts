export type FeedbackStatus = 'submitted' | 'reviewing' | 'approved' | 'rejected' | 'archived';
export type PackageUploadStatus = 'parsed' | 'waiting_review' | 'rejected' | 'publishing' | 'published' | 'publish_failed';

export interface FeedbackInput { skillId?: string; skillName?: string; rating: number; tags: string[]; anonymous: boolean; contact: string; message: string; }
export interface FeedbackItem extends FeedbackInput { id: string; status: FeedbackStatus; createdAt: string; updatedAt: string; }
export interface SkillInput { name: string; description: string; author?: string; source?: string; category?: string; version?: string; tags?: string[]; owner?: string; gitUrl?: string; packageFileName?: string; }
export interface SkillItem { id: string; name: string; description: string; author: string; source: string; category: string; version: string; installs: number; rating: number; reviews: number; status: 'verified' | 'review' | 'new'; tags: string[]; command: string; updatedAt: string; owner?: string; uploadStatus?: 'draft' | 'validating' | 'validated' | 'waiting_publish' | 'published'; gitUrl?: string; packageFileName?: string; }
export interface SkillFileEntry { name: string; path: string; type: 'file' | 'directory'; size?: number; updatedAt?: string; children?: SkillFileEntry[]; }
export interface SkillFileDetail { path: string; name: string; content: string; language: string; size: number; updatedAt: string; editable: boolean; }
export interface SkillFilesResponse { root: SkillFileEntry; selectedFile?: SkillFileDetail; }
export interface SourceItem { name: string; label: string; description: string; url?: string; branch?: string; skillsDirectory?: string; publishEnabled?: boolean; domesticMirror?: { url: string; enabled: boolean }; effectiveUrl?: string; enabled: boolean; default: boolean; builtin?: boolean; createdAt?: string; updatedAt?: string; }
export interface SourcesResponse { sources: SourceItem[]; defaultSources: string[]; }
export interface PackageValidationItem { code: string; message: string; severity: 'info' | 'warning' | 'error'; }
export interface PackageUploadRecord { id: string; fileName: string; owner: string; status: PackageUploadStatus; metadata: SkillItem; validation: PackageValidationItem[]; publishedCommit?: string; publishError?: string; createdAt: string; updatedAt: string; }
export interface AuthUser { id: string; email: string; name: string; avatarUrl?: string; role: 'user' | 'admin'; }
export interface AuthConfig { enabled: boolean; mode?: 'oauth' | 'local'; scopes: string[]; apiAvailable: boolean; }
export interface PlatformUser extends AuthUser { disabled: boolean; createdAt: string; updatedAt: string; passwordUpdatedAt?: string; hasPassword: boolean; }
export interface PlatformUserListResponse { items: PlatformUser[]; total: number; }
export interface CreatePlatformUserInput { email: string; name?: string; password: string; role: AuthUser['role']; disabled?: boolean; }
export interface UpdatePlatformUserInput { name?: string; role?: AuthUser['role']; disabled?: boolean; }

export type NotificationType = 'skill_reviewed' | 'skill_status_changed' | 'skill_comment' | 'system';
export interface NotificationRecord { id: string; userId: string; type: NotificationType; title: string; message: string; relatedSkillId?: string; relatedSkillName?: string; relatedReviewId?: string; isRead: boolean; actionUrl?: string; createdAt: string; updatedAt: string; }
export interface NotificationListResponse { data: NotificationRecord[]; total: number; page: number; pageSize: number; unreadCount: number; }

export interface FavoriteRecord { id: string; userId: string; skillId: string; createdAt: string; }
export interface FavoriteListResponse { items: FavoriteRecord[]; total: number; }

export interface SearchHistoryRecord { id: string; userId: string; query: string; createdAt: string; }
export interface SearchHistoryListResponse { items: SearchHistoryRecord[]; total: number; }

const FEEDBACK_STORAGE_KEY = 'suit-skills-platform-feedback';
const SKILLS_STORAGE_KEY = 'suit-skills-platform-skills';
const SOURCES_STORAGE_KEY = 'suit-skills-platform-sources';
const SKILL_FILES_STORAGE_KEY = 'suit-skills-platform-skill-files';
const UPLOADS_STORAGE_KEY = 'suit-skills-platform-uploads';
const apiBaseUrl = (import.meta.env.VITE_PLATFORM_API_BASE_URL ?? '').replace(/\/$/, '');

const fallbackSkills: SkillItem[] = [
  { id: 'skill-frontend-design', name: 'frontend-design', description: 'Create high-quality Web pages, components, and console interfaces.', author: 'Design Ops', source: 'default', category: 'frontend', version: '2.2.0', installs: 12840, rating: 4.9, reviews: 186, status: 'verified', tags: ['React', 'UI', 'Dashboard'], command: 'npx suit-skills@latest install frontend-design', updatedAt: '2026-04-26T01:30:00.000Z', owner: 'platform', uploadStatus: 'published' },
  { id: 'skill-java-bugfix', name: 'java-bugfix-workflow', description: 'Diagnose and repair Java, Spring, MyBatis, startup, API, and SQL issues.', author: 'Backend Guild', source: 'default', category: 'backend', version: '1.1.4', installs: 7210, rating: 4.7, reviews: 94, status: 'verified', tags: ['Java', 'Spring', 'Bugfix'], command: 'npx suit-skills@latest install java-bugfix-workflow', updatedAt: '2026-04-25T10:12:00.000Z', owner: 'platform', uploadStatus: 'published' },
];

const fallbackSources: SourceItem[] = [
  { name: 'default', label: 'Suit Skills 默认源', description: '默认技能库，新安装默认启用。', url: 'https://gitee.com/digital-construction-center_1/suit-skills-lib.git', branch: 'main', skillsDirectory: 'skills/', publishEnabled: false, enabled: true, default: true, builtin: true, effectiveUrl: 'https://gitee.com/digital-construction-center_1/suit-skills-lib.git' },
  { name: 'anthropics-skills', label: 'Anthropic 官方技能库', description: 'Claude 官方技能合集，适合作为基础技能来源。', url: 'https://github.com/anthropics/skills.git', branch: 'main', skillsDirectory: 'skills/', publishEnabled: false, domesticMirror: { url: 'https://gitee.com/zhujun12/skills.git', enabled: true }, effectiveUrl: 'https://gitee.com/zhujun12/skills.git', enabled: false, default: false, builtin: true },
  { name: 'superpowers', label: 'Superpowers 工程技能库', description: '面向复杂开发、TDD、调试和重构的工程技能库。', url: 'https://github.com/obra/superpowers.git', branch: 'main', skillsDirectory: 'skills/', publishEnabled: false, domesticMirror: { url: 'https://gitee.com/zhujun12/superpowers.git', enabled: true }, effectiveUrl: 'https://gitee.com/zhujun12/superpowers.git', enabled: false, default: false, builtin: true },
  { name: 'vercel-agent-skills', label: 'Vercel Agent 技能库', description: '聚焦 Web、全栈、Next.js 和部署场景的技能库。', url: 'https://github.com/vercel-labs/agent-skills.git', branch: 'main', skillsDirectory: 'skills/', publishEnabled: false, domesticMirror: { url: 'https://gitee.com/zhujun12/agent-skills.git', enabled: true }, effectiveUrl: 'https://gitee.com/zhujun12/agent-skills.git', enabled: false, default: false, builtin: true },
  { name: 'huggingface-skills', label: 'Hugging Face 技能库', description: '面向 Hugging Face 与开源模型生态的技能库。', url: 'https://github.com/huggingface/skills.git', branch: 'main', skillsDirectory: 'skills/', publishEnabled: false, domesticMirror: { url: 'https://gitee.com/zhujun12/huggingface-skills.git', enabled: true }, effectiveUrl: 'https://gitee.com/zhujun12/huggingface-skills.git', enabled: false, default: false, builtin: true },
  { name: 'antigravity-awesome-skills', label: 'Antigravity 技能合集', description: '跨平台 AI 技能资源合集。', url: 'https://github.com/sickn33/antigravity-awesome-skills.git', branch: 'main', skillsDirectory: 'skills/', publishEnabled: false, domesticMirror: { url: 'https://gitee.com/zhujun12/antigravity-awesome-skills.git', enabled: true }, effectiveUrl: 'https://gitee.com/zhujun12/antigravity-awesome-skills.git', enabled: false, default: false, builtin: true },
  { name: 'awesome-claude-skills', label: 'Claude 技能资源索引', description: 'Claude 技能资源的精选索引，适合发现更多来源。', url: 'https://github.com/ComposioHQ/awesome-claude-skills.git', branch: 'main', skillsDirectory: 'skills/', publishEnabled: false, domesticMirror: { url: 'https://gitee.com/zhujun12/awesome-claude-skills.git', enabled: true }, effectiveUrl: 'https://gitee.com/zhujun12/awesome-claude-skills.git', enabled: false, default: false, builtin: true },
];

const legacyPlatformSourceNames = new Set(['official', 'backend-private', 'delivery-private', 'quality', 'platform', 'uploaded']);

function normalizeSkillSource(source: string): string {
  return legacyPlatformSourceNames.has(source) ? 'default' : source;
}

function endpoint(path: string): string { return `${apiBaseUrl}${path}`; }
function publicEndpoint(path: string): string {
  if (/^https?:\/\//i.test(apiBaseUrl)) return endpoint(path);
  const base = typeof window === 'undefined' ? '' : window.location.origin;
  return `${base}${endpoint(path)}`;
}
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown, fallback = ''): string { return typeof value === 'string' ? value : fallback; }
function tags(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean) : []; }

async function parseResponse(response: Response): Promise<unknown> {
  const body = await response.text();
  const payload = body.trim() ? JSON.parse(body) : undefined;
  if (!response.ok) {
    const message = isRecord(payload) && isRecord(payload.error) ? text(payload.error.message, `HTTP ${response.status}`) : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(endpoint(path), {
    credentials: 'include',
    headers: init?.body instanceof FormData ? init.headers : { 'content-type': 'application/json', ...init?.headers },
    ...init,
  });
  return parseResponse(response) as Promise<T>;
}

function normalizeSkill(value: unknown): SkillItem {
  const raw = isRecord(value) ? value : {};
  const name = text(raw.name, 'unknown-skill');
  const status = raw.status;
  const uploadStatus = raw.uploadStatus;
  return { id: text(raw.id) || `skill-${name}`, name, description: text(raw.description), author: text(raw.author, 'Unknown'), source: normalizeSkillSource(text(raw.source, 'default')), category: text(raw.category, 'custom'), version: text(raw.version, '0.1.0'), installs: Number(raw.installs) || 0, rating: Number(raw.rating) || 0, reviews: Number(raw.reviews) || 0, status: status === 'verified' || status === 'review' || status === 'new' ? status : 'review', tags: tags(raw.tags), command: text(raw.command) || `npx suit-skills@latest install ${name}`, updatedAt: text(raw.updatedAt) || new Date().toISOString(), owner: text(raw.owner), uploadStatus: uploadStatus === 'draft' || uploadStatus === 'validating' || uploadStatus === 'validated' || uploadStatus === 'waiting_publish' || uploadStatus === 'published' ? uploadStatus : undefined, gitUrl: text(raw.gitUrl), packageFileName: text(raw.packageFileName) };
}

function normalizeSource(value: unknown): SourceItem {
  const raw = isRecord(value) ? value : {};
  const name = text(raw.name, 'default');
  const domesticMirror = isRecord(raw.domesticMirror) && typeof raw.domesticMirror.url === 'string' ? { url: raw.domesticMirror.url, enabled: raw.domesticMirror.enabled !== false } : undefined;
  const url = text(raw.url);
  return { name, label: text(raw.label, name), description: text(raw.description, 'Custom platform skill source.'), url, branch: text(raw.branch, 'main'), skillsDirectory: text(raw.skillsDirectory, 'skills/'), publishEnabled: raw.publishEnabled === true, domesticMirror, effectiveUrl: text(raw.effectiveUrl) || (domesticMirror?.enabled ? domesticMirror.url : url), enabled: raw.enabled !== false, default: raw.default === true, builtin: raw.builtin === true, createdAt: text(raw.createdAt), updatedAt: text(raw.updatedAt) };
}

function normalizeSources(value: unknown): SourceItem[] {
  const sources = Array.isArray(value)
    ? value.map(normalizeSource).filter((source) => !legacyPlatformSourceNames.has(source.name))
    : [];
  const hasBuiltin = sources.some((source) =>
    fallbackSources.some((builtin) => builtin.name === source.name),
  );
  const merged = hasBuiltin ? sources : [...fallbackSources, ...sources];
  return merged.map((source) => ({
    ...source,
    builtin:
      source.builtin ||
      fallbackSources.some((builtin) => builtin.name === source.name),
  }));
}

function normalizeUpload(value: unknown): PackageUploadRecord {
  const raw = isRecord(value) ? value : {};
  const status = raw.status;
  return { id: text(raw.id), fileName: text(raw.fileName), owner: text(raw.owner), status: status === 'parsed' || status === 'waiting_review' || status === 'rejected' || status === 'publishing' || status === 'published' || status === 'publish_failed' ? status : 'parsed', metadata: normalizeSkill(raw.metadata), validation: Array.isArray(raw.validation) ? raw.validation.map((item) => { const rawItem = isRecord(item) ? item : {}; const severity = rawItem.severity; return { code: text(rawItem.code), message: text(rawItem.message), severity: severity === 'warning' || severity === 'error' || severity === 'info' ? severity : 'info' }; }) : [], publishedCommit: text(raw.publishedCommit), publishError: text(raw.publishError), createdAt: text(raw.createdAt), updatedAt: text(raw.updatedAt) };
}

function normalizeFeedback(value: unknown): FeedbackItem {
  const raw = isRecord(value) ? value : {};
  const metadata = isRecord(raw.metadata) ? raw.metadata : {};
  const reviewer = isRecord(raw.reviewer) ? raw.reviewer : {};
  const status = raw.status;
  const createdAt = text(raw.createdAt) || new Date().toISOString();
  return { id: text(raw.id) || crypto.randomUUID(), skillId: text(raw.skillId) || text(metadata.skillId) || 'platform-web', skillName: text(raw.skillName) || text(metadata.skillName), rating: Number(raw.rating) || 5, tags: tags(metadata.tags ?? raw.tags), anonymous: metadata.anonymous === true || raw.anonymous === true, contact: text(metadata.contact) || text(reviewer.email) || text(raw.contact), message: text(raw.comment) || text(metadata.message) || text(raw.message), status: status === 'submitted' || status === 'reviewing' || status === 'approved' || status === 'rejected' || status === 'archived' ? status : 'submitted', createdAt, updatedAt: text(raw.updatedAt) || createdAt };
}

function normalizePlatformUser(value: unknown): PlatformUser {
  const raw = isRecord(value) ? value : {};
  const id = text(raw.id);
  const email = text(raw.email);
  return { id, email, name: text(raw.name) || email || id, avatarUrl: text(raw.avatarUrl), role: raw.role === 'admin' ? 'admin' : 'user', disabled: raw.disabled === true, createdAt: text(raw.createdAt), updatedAt: text(raw.updatedAt), passwordUpdatedAt: text(raw.passwordUpdatedAt), hasPassword: raw.hasPassword === true };
}

function readArray<T>(key: string, normalize: (value: unknown) => T, fallback: T[]): T[] { try { const raw = localStorage.getItem(key); if (!raw) return fallback; const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed.map(normalize) : fallback; } catch { return fallback; } }
function writeJson(key: string, value: unknown): void { localStorage.setItem(key, JSON.stringify(value)); }
function readLocalSkills(): SkillItem[] { return readArray(SKILLS_STORAGE_KEY, normalizeSkill, fallbackSkills); }
function writeLocalSkills(items: SkillItem[]): void { writeJson(SKILLS_STORAGE_KEY, items); }
function readLocalSources(): SourceItem[] { return normalizeSources(readArray(SOURCES_STORAGE_KEY, normalizeSource, [])); }
function writeLocalSources(items: SourceItem[]): void { writeJson(SOURCES_STORAGE_KEY, items); }
function readLocalUploads(): PackageUploadRecord[] { return readArray(UPLOADS_STORAGE_KEY, normalizeUpload, []); }
function writeLocalUploads(items: PackageUploadRecord[]): void { writeJson(UPLOADS_STORAGE_KEY, items); }

export async function loginWithPassword(username: string, password: string): Promise<AuthUser> { const payload = await request<{ user?: unknown }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }); const user = isRecord(payload.user) ? payload.user : {}; return { id: text(user.id), email: text(user.email), name: text(user.name) || text(user.email), avatarUrl: text(user.avatarUrl), role: user.role === 'admin' ? 'admin' : 'user' }; }
export async function getAuthConfig(): Promise<AuthConfig> { try { const raw = await request<Record<string, unknown>>('/api/auth/config'); return { enabled: raw.enabled === true, mode: raw.mode === 'oauth' ? 'oauth' : raw.mode === 'local' ? 'local' : undefined, scopes: tags(raw.scopes), apiAvailable: true }; } catch { return { enabled: false, scopes: [], apiAvailable: false }; } }
export async function getCurrentUser(): Promise<AuthUser | null> { try { const payload = await request<{ user?: unknown }>('/api/auth/me'); if (!isRecord(payload.user)) return null; const user = payload.user; const id = text(user.id); return id ? { id, email: text(user.email), name: text(user.name) || text(user.email) || id, avatarUrl: text(user.avatarUrl), role: user.role === 'admin' ? 'admin' : 'user' } : null; } catch { return null; } }
export async function logoutOAuth(): Promise<void> { try { await request('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) }); } catch {} }
export async function listPlatformUsers(): Promise<PlatformUserListResponse> { const payload = await request<unknown>('/api/admin/users'); const raw = isRecord(payload) ? payload : {}; const items = Array.isArray(raw.items) ? raw.items.map(normalizePlatformUser) : []; return { items, total: Number(raw.total) || items.length }; }
export async function createPlatformUser(input: CreatePlatformUserInput): Promise<{ user: PlatformUser; currentUser?: AuthUser }> { const payload = await request<Record<string, unknown>>('/api/admin/users', { method: 'POST', body: JSON.stringify(input) }); return { user: normalizePlatformUser(payload.user), currentUser: isRecord(payload.currentUser) ? normalizePlatformUser(payload.currentUser) : undefined }; }
export async function updatePlatformUser(id: string, input: UpdatePlatformUserInput): Promise<{ user: PlatformUser; currentUser?: AuthUser }> { const payload = await request<Record<string, unknown>>(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }); return { user: normalizePlatformUser(payload.user), currentUser: isRecord(payload.currentUser) ? normalizePlatformUser(payload.currentUser) : undefined }; }
export async function deletePlatformUser(id: string): Promise<void> { await request(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
export async function resetPlatformUserPassword(id: string, password: string): Promise<PlatformUser> { const payload = await request<Record<string, unknown>>(`/api/admin/users/${encodeURIComponent(id)}/password`, { method: 'POST', body: JSON.stringify({ password }) }); return normalizePlatformUser(payload.user); }

export async function listSkills(): Promise<SkillItem[]> { try { const payload = await request<unknown>('/api/skills'); const items = isRecord(payload) && Array.isArray(payload.items) ? payload.items : []; return items.map(normalizeSkill); } catch { return readLocalSkills(); } }
export function getSkillPackageUrl(skillId: string): string { return publicEndpoint(`/api/skills/${encodeURIComponent(skillId)}/package`); }
export function buildInstallPackageCommand(skillId: string, options: { scope: 'global' | 'local'; targets: string[] }): string {
  const args = ['npx', 'suit-skills@latest', 'install-package', getSkillPackageUrl(skillId), options.scope === 'local' ? '--local' : '--global'];
  const targets = options.targets.map((target) => target.trim()).filter(Boolean);
  if (targets.length) args.push('--env', targets.join(','));
  return args.join(' ');
}
export async function listMySkills(owner = 'current-user'): Promise<SkillItem[]> { try { const payload = await request<unknown>(`/api/my-skills?owner=${encodeURIComponent(owner)}`); const items = isRecord(payload) && Array.isArray(payload.items) ? payload.items : []; return items.map(normalizeSkill); } catch { return readLocalSkills().filter((item) => item.owner === owner); } }
export async function deleteSkill(skillId: string): Promise<boolean> { try { await request(`/api/skills/${encodeURIComponent(skillId)}`, { method: 'DELETE' }); return true; } catch { const items = readLocalSkills(); const next = items.filter((item) => item.id !== skillId && item.name !== skillId); writeLocalSkills(next); const uploads = readLocalUploads(); writeLocalUploads(uploads.filter((item) => item.metadata.id !== skillId && item.metadata.name !== skillId)); return next.length !== items.length; } }
export async function uploadSkill(input: SkillInput): Promise<SkillItem> { try { return normalizeSkill(await request('/api/skills/upload', { method: 'POST', body: JSON.stringify(input) })); } catch { const skill = normalizeSkill({ ...input, id: `skill-${input.name}`, author: input.author || 'Current user', source: input.source || 'default', category: input.category || 'custom', version: input.version || '0.1.0', status: 'review', owner: 'current-user', uploadStatus: 'draft' }); writeLocalSkills([skill, ...readLocalSkills().filter((item) => item.id !== skill.id)]); return skill; } }

export async function parseSkillPackage(file: File, owner: string): Promise<PackageUploadRecord> { try { const form = new FormData(); form.set('owner', owner); form.set('package', file); return normalizeUpload(await request('/api/uploads/parse', { method: 'POST', body: form })); } catch { const now = new Date().toISOString(); const baseName = file.name.replace(/\.zip$/i, '') || 'uploaded-skill'; const upload = normalizeUpload({ id: `local-${Date.now().toString(36)}`, fileName: file.name, owner, status: 'parsed', metadata: { name: baseName, description: 'Parsed from SKILL.md', author: 'Current user', source: 'default', category: 'custom', version: '0.1.0', tags: [] }, validation: [{ code: 'LOCAL_PARSE', message: 'Local fallback parse completed.', severity: 'info' }], createdAt: now, updatedAt: now }); writeLocalUploads([upload, ...readLocalUploads()]); return upload; } }
export async function updateSkillPackageMetadata(id: string, input: SkillInput): Promise<PackageUploadRecord> { try { return normalizeUpload(await request(`/api/uploads/${encodeURIComponent(id)}/metadata`, { method: 'PATCH', body: JSON.stringify(input) })); } catch { const uploads = readLocalUploads(); const current = uploads.find((item) => item.id === id); if (!current) throw new Error('Upload record not found'); const updated = normalizeUpload({ ...current, metadata: { ...current.metadata, ...input }, updatedAt: new Date().toISOString() }); writeLocalUploads(uploads.map((item) => item.id === id ? updated : item)); return updated; } }
export async function submitSkillPackageForReview(id: string): Promise<PackageUploadRecord> { try { return normalizeUpload(await request(`/api/uploads/${encodeURIComponent(id)}/submit`, { method: 'POST', body: JSON.stringify({}) })); } catch { const uploads = readLocalUploads(); const current = uploads.find((item) => item.id === id); if (!current) throw new Error('Upload record not found'); const updated = normalizeUpload({ ...current, status: 'waiting_review', updatedAt: new Date().toISOString() }); writeLocalUploads(uploads.map((item) => item.id === id ? updated : item)); writeLocalSkills([updated.metadata, ...readLocalSkills().filter((item) => item.id !== updated.metadata.id)]); return updated; } }
export async function publishSkillPackage(id: string): Promise<PackageUploadRecord> { try { return normalizeUpload(await request(`/api/uploads/${encodeURIComponent(id)}/publish`, { method: 'POST', body: JSON.stringify({}) })); } catch (publishError) { try { return normalizeUpload(await request(`/api/uploads/${encodeURIComponent(id)}/approve`, { method: 'POST', body: JSON.stringify({}) })); } catch { const uploads = readLocalUploads(); const current = uploads.find((item) => item.id === id); if (!current) throw publishError instanceof Error ? publishError : new Error('Upload record not found'); const now = new Date().toISOString(); const metadata = normalizeSkill({ ...current.metadata, status: 'verified', uploadStatus: 'published', updatedAt: now }); const updated = normalizeUpload({ ...current, status: 'published', metadata, publishedCommit: 'local-publish', publishError: undefined, updatedAt: now }); writeLocalUploads(uploads.map((item) => item.id === id ? updated : item)); writeLocalSkills([metadata, ...readLocalSkills().filter((item) => item.id !== metadata.id)]); return updated; } } }
export async function listSkillPackageUploads(filters: { owner?: string; status?: PackageUploadStatus } = {}): Promise<PackageUploadRecord[]> { try { const params = new URLSearchParams(); if (filters.owner) params.set('owner', filters.owner); if (filters.status) params.set('status', filters.status); const payload = await request<unknown>(`/api/uploads${params.size ? `?${params}` : ''}`); const items = isRecord(payload) && Array.isArray(payload.items) ? payload.items : []; return items.map(normalizeUpload); } catch { return readLocalUploads().filter((item) => (!filters.owner || item.owner === filters.owner) && (!filters.status || item.status === filters.status)); } }
export async function deleteSkillPackageUpload(id: string): Promise<boolean> { try { await request(`/api/uploads/${encodeURIComponent(id)}`, { method: 'DELETE' }); return true; } catch { const uploads = readLocalUploads(); const next = uploads.filter((item) => item.id !== id); writeLocalUploads(next); return next.length !== uploads.length; } }
export async function approveSkillPackageUpload(id: string): Promise<PackageUploadRecord> { return normalizeUpload(await request(`/api/uploads/${encodeURIComponent(id)}/approve`, { method: 'POST', body: JSON.stringify({}) })); }

export async function listSources(): Promise<SourcesResponse> { try { const payload = await request<unknown>('/api/sources'); const sources = normalizeSources(isRecord(payload) ? payload.sources : undefined); return { sources, defaultSources: sources.filter((source) => source.default).map((source) => source.name) }; } catch { const sources = readLocalSources(); return { sources, defaultSources: sources.filter((source) => source.default).map((source) => source.name) }; } }
export async function restoreBuiltinSources(): Promise<SourcesResponse & { added: string[] }> { try { const response = await request<Record<string, unknown>>('/api/sources/restore-builtins', { method: 'POST', body: JSON.stringify({}) }); const sources = normalizeSources(response.sources); return { sources, defaultSources: sources.filter((item) => item.default).map((item) => item.name), added: Array.isArray(response.added) ? response.added.filter((item): item is string => typeof item === 'string') : [] }; } catch { const current = readLocalSources(); const names = new Set(current.map((source) => source.name)); const added = fallbackSources.filter((source) => !names.has(source.name)); const sources = [...current, ...added]; writeLocalSources(sources); return { sources, defaultSources: sources.filter((item) => item.default).map((item) => item.name), added: added.map((source) => source.name) }; } }
export async function addSource(input: { name: string; label?: string; description?: string; url?: string; branch?: string; skillsDirectory?: string; publishEnabled?: boolean }): Promise<SourcesResponse & { source: SourceItem }> { try { const response = await request<Record<string, unknown>>('/api/sources', { method: 'POST', body: JSON.stringify(input) }); const sources = normalizeSources(response.sources); return { sources, defaultSources: sources.filter((item) => item.default).map((item) => item.name), source: normalizeSource(response.source) }; } catch { const current = readLocalSources(); if (current.some((source) => source.name === input.name)) throw new Error('Source already exists'); const now = new Date().toISOString(); const source: SourceItem = { name: input.name, label: input.label || input.name, description: input.description || 'Custom platform skill source.', url: input.url || '', branch: input.branch || 'main', skillsDirectory: input.skillsDirectory || 'skills/', publishEnabled: input.publishEnabled === true, enabled: true, default: false, createdAt: now, updatedAt: now }; const sources = [...current, source]; writeLocalSources(sources); return { sources, defaultSources: sources.filter((item) => item.default).map((item) => item.name), source }; } }
export async function updateSource(name: string, input: Partial<Pick<SourceItem, 'enabled' | 'label' | 'description' | 'url' | 'branch' | 'skillsDirectory' | 'publishEnabled' | 'domesticMirror'>>): Promise<SourcesResponse & { source: SourceItem }> { try { const response = await request<Record<string, unknown>>(`/api/sources/${encodeURIComponent(name)}`, { method: 'PATCH', body: JSON.stringify(input) }); const sources = normalizeSources(response.sources); return { sources, defaultSources: sources.filter((item) => item.default).map((item) => item.name), source: normalizeSource(response.source) }; } catch { const current = readLocalSources(); const source = current.find((item) => item.name === name); if (!source) throw new Error('Source not found'); const domesticMirror = input.domesticMirror && source.domesticMirror ? { ...source.domesticMirror, enabled: input.domesticMirror.enabled } : source.domesticMirror; const updated = { ...source, ...input, domesticMirror, effectiveUrl: domesticMirror?.enabled ? domesticMirror.url : input.url ?? source.url, updatedAt: new Date().toISOString() }; const sources = current.map((item) => item.name === name ? updated : item); writeLocalSources(sources); return { sources, defaultSources: sources.filter((item) => item.default).map((item) => item.name), source: updated }; } }
export async function removeSource(name: string): Promise<SourcesResponse & { removed: string }> { try { const response = await request<Record<string, unknown>>(`/api/sources/${encodeURIComponent(name)}`, { method: 'DELETE' }); const sources = normalizeSources(response.sources); return { sources, defaultSources: sources.filter((item) => item.default).map((item) => item.name), removed: text(response.removed, name) }; } catch { const sources = readLocalSources().filter((item) => item.name !== name); writeLocalSources(sources); return { sources, defaultSources: sources.filter((item) => item.default).map((item) => item.name), removed: name }; } }

function feedbackToApi(input: FeedbackInput): Record<string, unknown> { return { skillId: input.skillId || 'platform-web', skillName: input.skillName, rating: input.rating, comment: input.message, reviewer: input.anonymous ? undefined : { email: input.contact }, metadata: { tags: input.tags, anonymous: input.anonymous, contact: input.anonymous ? '' : input.contact, skillId: input.skillId || 'platform-web', skillName: input.skillName } }; }
export async function submitFeedback(input: FeedbackInput): Promise<FeedbackItem> { try { return normalizeFeedback(await request('/api/evaluations', { method: 'POST', body: JSON.stringify(feedbackToApi(input)) })); } catch { const now = new Date().toISOString(); const feedback: FeedbackItem = { ...input, id: crypto.randomUUID(), status: 'submitted', createdAt: now, updatedAt: now }; writeJson(FEEDBACK_STORAGE_KEY, [feedback, ...readArray(FEEDBACK_STORAGE_KEY, normalizeFeedback, [])]); return feedback; } }
export async function listFeedback(filters: { skillId?: string; status?: FeedbackStatus | 'all' } = {}): Promise<FeedbackItem[]> { try { const params = new URLSearchParams(); if (filters.skillId) params.set('skillId', filters.skillId); if (filters.status && filters.status !== 'all') params.set('status', filters.status); const payload = await request<unknown>(`/api/evaluations${params.size ? `?${params}` : ''}`); const items = isRecord(payload) && Array.isArray(payload.items) ? payload.items : []; return items.map(normalizeFeedback); } catch { return readArray(FEEDBACK_STORAGE_KEY, normalizeFeedback, []).filter((item) => (!filters.skillId || item.skillId === filters.skillId) && (!filters.status || filters.status === 'all' || item.status === filters.status)); } }
export async function getFeedback(id: string): Promise<FeedbackItem> { const item = (await listFeedback({ status: 'all' })).find((entry) => entry.id === id); if (!item) throw new Error('Feedback not found'); return item; }
export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<FeedbackItem> { try { return normalizeFeedback(await request(`/api/evaluations/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })); } catch { const items = readArray(FEEDBACK_STORAGE_KEY, normalizeFeedback, []); const current = items.find((item) => item.id === id); if (!current) throw new Error('Feedback not found'); const updated = { ...current, status, updatedAt: new Date().toISOString() }; writeJson(FEEDBACK_STORAGE_KEY, items.map((item) => item.id === id ? updated : item)); return updated; } }

function languageForPath(path: string): string { if (path.endsWith('.json')) return 'json'; if (path.endsWith('.md') || path.endsWith('.mdx')) return 'markdown'; if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript'; if (path.endsWith('.js') || path.endsWith('.jsx')) return 'javascript'; if (path.endsWith('.yml') || path.endsWith('.yaml')) return 'yaml'; return 'text'; }
function defaultSkillFile(skillId: string): SkillFilesResponse { const skill = readLocalSkills().find((item) => item.id === skillId) ?? fallbackSkills[0]!; const content = `---\nname: ${skill.name}\ndescription: ${skill.description}\nversion: ${skill.version}\n---\n\n# ${skill.name}\n\n${skill.description}\n`; const selectedFile: SkillFileDetail = { path: 'SKILL.md', name: 'SKILL.md', content, language: 'markdown', size: content.length, updatedAt: skill.updatedAt, editable: true }; return { root: { name: skill.name, path: '', type: 'directory', children: [{ name: 'SKILL.md', path: 'SKILL.md', type: 'file', size: content.length, updatedAt: skill.updatedAt }] }, selectedFile }; }
export async function listSkillFiles(skillId: string, selectedPath?: string): Promise<SkillFilesResponse> { try { return request(`/api/skills/${encodeURIComponent(skillId)}/files${selectedPath ? `?path=${encodeURIComponent(selectedPath)}` : ''}`); } catch { return defaultSkillFile(skillId); } }
export async function getSkillFile(skillId: string, path: string): Promise<SkillFileDetail> { try { return request(`/api/skills/${encodeURIComponent(skillId)}/files/${encodeURIComponent(path)}`); } catch { const fallback = defaultSkillFile(skillId).selectedFile!; return { ...fallback, path, name: path.split('/').pop() || path, language: languageForPath(path) }; } }
export async function updateSkillFile(skillId: string, path: string, content: string): Promise<SkillFileDetail> { try { return request(`/api/skills/${encodeURIComponent(skillId)}/files/${encodeURIComponent(path)}`, { method: 'PUT', body: JSON.stringify({ content }) }); } catch { const raw = localStorage.getItem(SKILL_FILES_STORAGE_KEY); const parsed = raw ? JSON.parse(raw) : {}; const store = isRecord(parsed) ? parsed : {}; const skillFiles = isRecord(store[skillId]) ? store[skillId] : {}; store[skillId] = { ...skillFiles, [path]: content }; writeJson(SKILL_FILES_STORAGE_KEY, store); return { path, name: path.split('/').pop() || path, content, language: languageForPath(path), size: content.length, updatedAt: new Date().toISOString(), editable: true }; } }

export async function listNotifications(page = 1, pageSize = 20, type?: NotificationType, unreadOnly = false): Promise<NotificationListResponse> { try { const params = new URLSearchParams(); params.set('page', String(page)); params.set('pageSize', String(pageSize)); if (type) params.set('type', type); if (unreadOnly) params.set('unreadOnly', 'true'); return request(`/api/notifications?${params}`); } catch { return { data: [], total: 0, page, pageSize, unreadCount: 0 }; } }
export async function getNotification(id: string): Promise<NotificationRecord | null> { try { return request(`/api/notifications/${encodeURIComponent(id)}`); } catch { return null; } }
export async function markNotificationAsRead(id: string, isRead = true): Promise<NotificationRecord | null> { try { return request(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'PUT', body: JSON.stringify({ isRead }) }); } catch { return null; } }
export async function batchMarkNotificationsAsRead(ids: string[], isRead = true): Promise<number> { try { const response = await request<{ updated?: number }>('/api/notifications/batch/read', { method: 'PUT', body: JSON.stringify({ ids, isRead }) }); return response.updated ?? 0; } catch { return 0; } }
export async function deleteNotification(id: string): Promise<boolean> { try { await request(`/api/notifications/${encodeURIComponent(id)}`, { method: 'DELETE' }); return true; } catch { return false; } }
export async function getUnreadCount(): Promise<{ unreadCount: number; byType: Record<NotificationType, number> }> { try { return request('/api/notifications/unread-count'); } catch { return { unreadCount: 0, byType: { skill_reviewed: 0, skill_status_changed: 0, skill_comment: 0, system: 0 } }; } }

export async function listFavorites(page = 1, pageSize = 20): Promise<FavoriteListResponse> { try { const params = new URLSearchParams(); params.set('page', String(page)); params.set('pageSize', String(pageSize)); return request(`/api/favorites?${params}`); } catch { return { items: [], total: 0 }; } }
export async function addFavorite(skillId: string): Promise<FavoriteRecord | null> { try { return request(`/api/favorites/${encodeURIComponent(skillId)}`, { method: 'POST', body: JSON.stringify({}) }); } catch { return null; } }
export async function removeFavorite(skillId: string): Promise<boolean> { try { await request(`/api/favorites/${encodeURIComponent(skillId)}`, { method: 'DELETE' }); return true; } catch { return false; } }
export async function isFavorited(skillId: string): Promise<boolean> { try { const response = await request<{ favorited?: boolean }>(`/api/favorites/check/${encodeURIComponent(skillId)}`); return response.favorited ?? false; } catch { return false; } }

export async function listSearchHistory(limit = 10): Promise<SearchHistoryListResponse> { try { const params = new URLSearchParams(); params.set('limit', String(limit)); return request(`/api/search-history?${params}`); } catch { return { items: [], total: 0 }; } }
export async function addSearchHistory(query: string): Promise<SearchHistoryRecord | null> { try { return request('/api/search-history', { method: 'POST', body: JSON.stringify({ query }) }); } catch { return null; } }
export async function deleteSearchHistory(id: string): Promise<boolean> { try { await request(`/api/search-history/${encodeURIComponent(id)}`, { method: 'DELETE' }); return true; } catch { return false; } }
export async function clearSearchHistory(): Promise<number> { try { const response = await request<{ deleted?: number }>('/api/search-history', { method: 'DELETE' }); return response.deleted ?? 0; } catch { return 0; } }
