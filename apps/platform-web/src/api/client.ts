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
export interface SourcesResponse { sources: SourceItem[]; }
export interface PackageValidationItem { code: string; message: string; severity: 'info' | 'warning' | 'error'; }
export interface PackageUploadRecord { id: string; fileName: string; owner: string; status: PackageUploadStatus; metadata: SkillItem; validation: PackageValidationItem[]; publishedCommit?: string; publishError?: string; createdAt: string; updatedAt: string; }
export interface AuthUser { id: string; email: string; name: string; avatarUrl?: string; role: 'user' | 'admin'; }
export interface AuthConfig { enabled: boolean; mode?: 'oauth' | 'local' | 'external-token' | 'none'; scopes: string[]; apiAvailable: boolean; }
export interface PlatformUser extends AuthUser { disabled: boolean; createdAt: string; updatedAt: string; passwordUpdatedAt?: string; hasPassword: boolean; }
export interface PlatformUserListResponse { items: PlatformUser[]; total: number; }
export interface CreatePlatformUserInput { email: string; name?: string; password: string; role: AuthUser['role']; disabled?: boolean; }
export interface UpdatePlatformUserInput { name?: string; role?: AuthUser['role']; disabled?: boolean; }
export interface RegistrationInviteResponse { token: string; role: AuthUser['role']; expiresAt: string; inviteUrl: string; }
export interface RegisterWithInviteInput { token: string; email: string; name?: string; password: string; }

export type NotificationType = 'skill_reviewed' | 'skill_status_changed' | 'skill_comment' | 'system';
export interface NotificationRecord { id: string; userId: string; type: NotificationType; title: string; message: string; relatedSkillId?: string; relatedSkillName?: string; relatedReviewId?: string; isRead: boolean; actionUrl?: string; createdAt: string; updatedAt: string; }
export interface NotificationListResponse { data: NotificationRecord[]; total: number; page: number; pageSize: number; unreadCount: number; }

export interface FavoriteRecord { id: string; userId: string; skillId: string; createdAt: string; }
export interface FavoriteListResponse { items: FavoriteRecord[]; total: number; }

export interface SearchHistoryRecord { id: string; userId: string; query: string; createdAt: string; }
export interface SearchHistoryListResponse { items: SearchHistoryRecord[]; total: number; }

const apiBaseUrl = (import.meta.env.VITE_PLATFORM_API_BASE_URL ?? '').replace(/\/$/, '');
function normalizeSkillSource(source: string): string {
  return source;
}

function endpoint(path: string): string { return `${apiBaseUrl}${path}`; }
function appEndpoint(path: string): string {
  const base = typeof window === 'undefined' ? '' : window.location.origin;
  const appBase = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
  return `${base}${appBase}${path}`;
}
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
  const name = text(raw.name, 'unknown-source');
  const domesticMirror = isRecord(raw.domesticMirror) && typeof raw.domesticMirror.url === 'string' ? { url: raw.domesticMirror.url, enabled: raw.domesticMirror.enabled !== false } : undefined;
  const url = text(raw.url);
  return { name, label: text(raw.label, name), description: text(raw.description, 'Custom platform skill source.'), url, branch: text(raw.branch, 'main'), skillsDirectory: text(raw.skillsDirectory, 'skills/'), publishEnabled: raw.publishEnabled === true, domesticMirror, effectiveUrl: text(raw.effectiveUrl) || (domesticMirror?.enabled ? domesticMirror.url : url), enabled: raw.enabled !== false, default: raw.default === true, builtin: raw.builtin === true, createdAt: text(raw.createdAt), updatedAt: text(raw.updatedAt) };
}

function normalizeSources(value: unknown): SourceItem[] {
  return Array.isArray(value) ? value.map(normalizeSource) : [];
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

export async function loginWithPassword(username: string, password: string): Promise<AuthUser> { const payload = await request<{ user?: unknown }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }); const user = isRecord(payload.user) ? payload.user : {}; return { id: text(user.id), email: text(user.email), name: text(user.name) || text(user.email), avatarUrl: text(user.avatarUrl), role: user.role === 'admin' ? 'admin' : 'user' }; }
export async function loginWithExternalToken(token: string): Promise<AuthUser> { const payload = await request<{ user?: unknown }>('/api/auth/external-token', { method: 'POST', body: JSON.stringify({ token }) }); const user = isRecord(payload.user) ? payload.user : {}; return { id: text(user.id), email: text(user.email), name: text(user.name) || text(user.email), avatarUrl: text(user.avatarUrl), role: user.role === 'admin' ? 'admin' : 'user' }; }
export async function getAuthConfig(): Promise<AuthConfig> { try { const raw = await request<Record<string, unknown>>('/api/auth/config'); return { enabled: raw.enabled === true, mode: raw.mode === 'oauth' ? 'oauth' : raw.mode === 'local' ? 'local' : raw.mode === 'external-token' ? 'external-token' : raw.mode === 'none' ? 'none' : undefined, scopes: tags(raw.scopes), apiAvailable: true }; } catch { return { enabled: false, scopes: [], apiAvailable: false }; } }
export async function getCurrentUser(): Promise<AuthUser | null> { try { const payload = await request<{ user?: unknown }>('/api/auth/me'); if (!isRecord(payload.user)) return null; const user = payload.user; const id = text(user.id); return id ? { id, email: text(user.email), name: text(user.name) || text(user.email) || id, avatarUrl: text(user.avatarUrl), role: user.role === 'admin' ? 'admin' : 'user' } : null; } catch { return null; } }
export async function logoutOAuth(): Promise<void> { try { await request('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) }); } catch {} }
export async function registerWithInvite(input: RegisterWithInviteInput): Promise<AuthUser> { const payload = await request<{ user?: unknown }>('/api/auth/register', { method: 'POST', body: JSON.stringify(input) }); const user = isRecord(payload.user) ? payload.user : {}; return { id: text(user.id), email: text(user.email), name: text(user.name) || text(user.email), avatarUrl: text(user.avatarUrl), role: user.role === 'admin' ? 'admin' : 'user' }; }
export async function listPlatformUsers(): Promise<PlatformUserListResponse> { const payload = await request<unknown>('/api/admin/users'); const raw = isRecord(payload) ? payload : {}; const items = Array.isArray(raw.items) ? raw.items.map(normalizePlatformUser) : []; return { items, total: Number(raw.total) || items.length }; }
export async function createPlatformUser(input: CreatePlatformUserInput): Promise<{ user: PlatformUser; currentUser?: AuthUser }> { const payload = await request<Record<string, unknown>>('/api/admin/users', { method: 'POST', body: JSON.stringify(input) }); return { user: normalizePlatformUser(payload.user), currentUser: isRecord(payload.currentUser) ? normalizePlatformUser(payload.currentUser) : undefined }; }
export async function createRegistrationInvite(role: AuthUser['role'] = 'user'): Promise<RegistrationInviteResponse> { const payload = await request<Record<string, unknown>>('/api/admin/invitations', { method: 'POST', body: JSON.stringify({ role }) }); const token = text(payload.token); const invitePath = `/register?invite=${encodeURIComponent(token)}`; return { token, role: payload.role === 'admin' ? 'admin' : 'user', expiresAt: text(payload.expiresAt), inviteUrl: appEndpoint(invitePath) }; }
export async function updatePlatformUser(id: string, input: UpdatePlatformUserInput): Promise<{ user: PlatformUser; currentUser?: AuthUser }> { const payload = await request<Record<string, unknown>>(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }); return { user: normalizePlatformUser(payload.user), currentUser: isRecord(payload.currentUser) ? normalizePlatformUser(payload.currentUser) : undefined }; }
export async function deletePlatformUser(id: string): Promise<void> { await request(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
export async function resetPlatformUserPassword(id: string, password: string): Promise<PlatformUser> { const payload = await request<Record<string, unknown>>(`/api/admin/users/${encodeURIComponent(id)}/password`, { method: 'POST', body: JSON.stringify({ password }) }); return normalizePlatformUser(payload.user); }

export async function listSkills(): Promise<SkillItem[]> { const payload = await request<unknown>('/api/skills'); const items = isRecord(payload) && Array.isArray(payload.items) ? payload.items : []; return items.map(normalizeSkill); }
export function getSkillPackageUrl(skillId: string): string { return publicEndpoint(`/api/skills/${encodeURIComponent(skillId)}/package`); }
export function buildInstallPackageCommand(skillId: string, options: { scope: 'global' | 'local'; targets: string[] }): string {
  const args = ['npx', 'suit-skills@latest', 'install-package', getSkillPackageUrl(skillId), options.scope === 'local' ? '--local' : '--global'];
  const targets = options.targets.map((target) => target.trim()).filter(Boolean);
  if (targets.length) args.push('--env', targets.join(','));
  return args.join(' ');
}
export async function listMySkills(owner = 'current-user'): Promise<SkillItem[]> { const payload = await request<unknown>(`/api/my-skills?owner=${encodeURIComponent(owner)}`); const items = isRecord(payload) && Array.isArray(payload.items) ? payload.items : []; return items.map(normalizeSkill); }
export async function deleteSkill(skillId: string): Promise<boolean> { await request(`/api/skills/${encodeURIComponent(skillId)}`, { method: 'DELETE' }); return true; }
export async function uploadSkill(input: SkillInput): Promise<SkillItem> { return normalizeSkill(await request('/api/skills/upload', { method: 'POST', body: JSON.stringify(input) })); }

export async function parseSkillPackage(file: File, owner: string): Promise<PackageUploadRecord> { const form = new FormData(); form.set('owner', owner); form.set('package', file); return normalizeUpload(await request('/api/uploads/parse', { method: 'POST', body: form })); }
export async function updateSkillPackageMetadata(id: string, input: SkillInput): Promise<PackageUploadRecord> { return normalizeUpload(await request(`/api/uploads/${encodeURIComponent(id)}/metadata`, { method: 'PATCH', body: JSON.stringify(input) })); }
export async function submitSkillPackageForReview(id: string): Promise<PackageUploadRecord> { return normalizeUpload(await request(`/api/uploads/${encodeURIComponent(id)}/submit`, { method: 'POST', body: JSON.stringify({}) })); }
export async function publishSkillPackage(id: string): Promise<PackageUploadRecord> { return normalizeUpload(await request(`/api/uploads/${encodeURIComponent(id)}/publish`, { method: 'POST', body: JSON.stringify({}) })); }
export async function listSkillPackageUploads(filters: { owner?: string; status?: PackageUploadStatus } = {}): Promise<PackageUploadRecord[]> { const params = new URLSearchParams(); if (filters.owner) params.set('owner', filters.owner); if (filters.status) params.set('status', filters.status); const payload = await request<unknown>(`/api/uploads${params.size ? `?${params}` : ''}`); const items = isRecord(payload) && Array.isArray(payload.items) ? payload.items : []; return items.map(normalizeUpload); }
export async function deleteSkillPackageUpload(id: string): Promise<boolean> { await request(`/api/uploads/${encodeURIComponent(id)}`, { method: 'DELETE' }); return true; }
export async function approveSkillPackageUpload(id: string): Promise<PackageUploadRecord> { return normalizeUpload(await request(`/api/uploads/${encodeURIComponent(id)}/approve`, { method: 'POST', body: JSON.stringify({}) })); }

export async function listSources(): Promise<SourcesResponse> { const payload = await request<unknown>('/api/sources'); const sources = normalizeSources(isRecord(payload) ? payload.sources : undefined); return { sources }; }
export async function restoreBuiltinSources(): Promise<SourcesResponse & { added: string[] }> { const response = await request<Record<string, unknown>>('/api/sources/restore-builtins', { method: 'POST', body: JSON.stringify({}) }); const sources = normalizeSources(response.sources); return { sources, added: Array.isArray(response.added) ? response.added.filter((item): item is string => typeof item === 'string') : [] }; }
export async function addSource(input: { name: string; label?: string; description?: string; url?: string; branch?: string; skillsDirectory?: string; publishEnabled?: boolean }): Promise<SourcesResponse & { source: SourceItem }> { const response = await request<Record<string, unknown>>('/api/sources', { method: 'POST', body: JSON.stringify(input) }); const sources = normalizeSources(response.sources); return { sources, source: normalizeSource(response.source) }; }
export async function updateSource(name: string, input: Partial<Pick<SourceItem, 'enabled' | 'label' | 'description' | 'url' | 'branch' | 'skillsDirectory' | 'publishEnabled' | 'domesticMirror'>>): Promise<SourcesResponse & { source: SourceItem }> { const response = await request<Record<string, unknown>>(`/api/sources/${encodeURIComponent(name)}`, { method: 'PATCH', body: JSON.stringify(input) }); const sources = normalizeSources(response.sources); return { sources, source: normalizeSource(response.source) }; }
export async function removeSource(name: string): Promise<SourcesResponse & { removed: string }> { const response = await request<Record<string, unknown>>(`/api/sources/${encodeURIComponent(name)}`, { method: 'DELETE' }); const sources = normalizeSources(response.sources); return { sources, removed: text(response.removed, name) }; }

function feedbackToApi(input: FeedbackInput): Record<string, unknown> { return { skillId: input.skillId || 'platform-web', skillName: input.skillName, rating: input.rating, comment: input.message, reviewer: input.anonymous ? undefined : { email: input.contact }, metadata: { tags: input.tags, anonymous: input.anonymous, contact: input.anonymous ? '' : input.contact, skillId: input.skillId || 'platform-web', skillName: input.skillName } }; }
export async function submitFeedback(input: FeedbackInput): Promise<FeedbackItem> { return normalizeFeedback(await request('/api/evaluations', { method: 'POST', body: JSON.stringify(feedbackToApi(input)) })); }
export async function listFeedback(filters: { skillId?: string; status?: FeedbackStatus | 'all'; limit?: number; offset?: number } = {}): Promise<FeedbackItem[]> { const params = new URLSearchParams(); if (filters.skillId) params.set('skillId', filters.skillId); if (filters.status && filters.status !== 'all') params.set('status', filters.status); if (filters.limit) params.set('limit', String(filters.limit)); if (filters.offset) params.set('offset', String(filters.offset)); const payload = await request<unknown>(`/api/evaluations${params.size ? `?${params}` : ''}`); const items = isRecord(payload) && Array.isArray(payload.items) ? payload.items : []; return items.map(normalizeFeedback); }
export async function getFeedback(id: string): Promise<FeedbackItem> { const item = (await listFeedback({ status: 'all' })).find((entry) => entry.id === id); if (!item) throw new Error('Feedback not found'); return item; }
export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<FeedbackItem> { return normalizeFeedback(await request(`/api/evaluations/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })); }

function languageForPath(path: string): string { if (path.endsWith('.json')) return 'json'; if (path.endsWith('.md') || path.endsWith('.mdx')) return 'markdown'; if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript'; if (path.endsWith('.js') || path.endsWith('.jsx')) return 'javascript'; if (path.endsWith('.yml') || path.endsWith('.yaml')) return 'yaml'; return 'text'; }
export async function listSkillFiles(skillId: string, selectedPath?: string): Promise<SkillFilesResponse> { return request(`/api/skills/${encodeURIComponent(skillId)}/files${selectedPath ? `?path=${encodeURIComponent(selectedPath)}` : ''}`); }
export async function getSkillFile(skillId: string, path: string): Promise<SkillFileDetail> { return request(`/api/skills/${encodeURIComponent(skillId)}/files/${encodeURIComponent(path)}`); }
export async function updateSkillFile(skillId: string, path: string, content: string): Promise<SkillFileDetail> { return request(`/api/skills/${encodeURIComponent(skillId)}/files/${encodeURIComponent(path)}`, { method: 'PUT', body: JSON.stringify({ content }) }); }

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
