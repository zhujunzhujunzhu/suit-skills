import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readdirSync, readFileSync, statSync, type Dirent } from 'node:fs';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { basename, dirname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  readSkillMarkdownMetadata,
  refreshCache,
  searchSkills,
  getSourceCacheDir,
  type SkillMarkdownMetadata,
} from '@suit-skills/core';
import AdmZip from 'adm-zip';
import {
  ApiError,
  applyCors,
  errorBody,
  normalizeResourcePath,
  parseCorsOrigins,
  readJsonBody,
  readMultipartBody,
  requestUrl,
  sendJson,
  type UploadedFile,
} from './http.js';
import { DEFAULT_GIT_CONFIG, DEFAULT_SKILLS, DEFAULT_SOURCES } from './defaults.js';
import { createDocumentDatabase, JsonDocumentStore } from './database.js';
import type {
  EvaluationListResponse,
  EvaluationRecord,
  EvaluationReviewer,
  EvaluationStatus,
  EvaluationStoreData,
  GitConfig,
  AuthUser,
  OAuthConfig,
  FavoriteListResponse,
  FavoriteRecord,
  FavoriteStoreData,
  NotificationListResponse,
  NotificationRecord,
  NotificationStoreData,
  NotificationType,
  SearchHistoryListResponse,
  SearchHistoryRecord,
  SearchHistoryStoreData,
  PackageUploadListResponse,
  PackageUploadRecord,
  PackageUploadStatus,
  PackageUploadStoreData,
  PackageValidationItem,
  ParsedSkillPackage,
  PlatformApiConfig,
  ServerPackageInfo,
  SkillFileDetail,
  SkillFileEntry,
  SkillFileRecord,
  SkillFileStoreData,
  SkillFilesResponse,
  SkillListResponse,
  SkillRecord,
  SkillStatus,
  SkillStoreData,
  SourceRecord,
  SourceStoreData,
  SourcesResponse,
  UploadStatus,
} from './types.js';
export type {
  EvaluationListResponse,
  EvaluationRecord,
  EvaluationReviewer,
  EvaluationStatus,
  EvaluationStoreData,
  GitConfig,
  FavoriteListResponse,
  FavoriteRecord,
  FavoriteStoreData,
  NotificationListResponse,
  NotificationRecord,
  NotificationStoreData,
  NotificationType,
  SearchHistoryListResponse,
  SearchHistoryRecord,
  SearchHistoryStoreData,
  PackageUploadListResponse,
  PackageUploadRecord,
  PackageUploadStatus,
  PackageUploadStoreData,
  PackageValidationItem,
  ParsedSkillPackage,
  PlatformApiConfig,
  ServerPackageInfo,
  SkillFileDetail,
  SkillFileEntry,
  SkillFileRecord,
  SkillFileStoreData,
  SkillFilesResponse,
  SkillListResponse,
  SkillRecord,
  SkillStatus,
  SkillStoreData,
  SourceRecord,
  SourceStoreData,
  SourcesResponse,
  UploadStatus,
} from './types.js';

const execFileAsync = promisify(execFile);

export const serverPackageInfo: ServerPackageInfo = {
  name: '@suit-skills/server',
  purpose: 'private-platform-api',
};

const VALID_STATUSES = new Set<EvaluationStatus>([
  'submitted',
  'reviewing',
  'approved',
  'rejected',
  'archived',
]);
const DEFAULT_DATA_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'evaluations.json',
);

const DEFAULT_SKILLS_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'skills.json',
);

const DEFAULT_GIT_CONFIG_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'git-config.json',
);

const DEFAULT_SOURCES_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'sources.json',
);

const DEFAULT_UPLOADS_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'uploads.json',
);

const DEFAULT_NOTIFICATIONS_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'notifications.json',
);

const DEFAULT_UPLOAD_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'uploads',
);
const DEFAULT_DATABASE_URL = 'mysql://root:Zhujun%40123@localhost:3306/platform_web';
const AUTH_COOKIE_NAME = 'clawhub_session';
const OAUTH_STATE_COOKIE_NAME = 'clawhub_oauth_state';
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;

class EvaluationStore {
  constructor(
    private readonly document: JsonDocumentStore<EvaluationStoreData>,
  ) {}

  async list(params: {
    status?: EvaluationStatus;
    skillId?: string;
    limit: number;
    offset: number;
  }): Promise<EvaluationListResponse> {
    const data = await this.read();
    let items = data.evaluations;

    if (params.status) {
      items = items.filter((item) => item.status === params.status);
    }

    if (params.skillId) {
      items = items.filter((item) => item.skillId === params.skillId);
    }

    items = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const total = items.length;

    return {
      items: items.slice(params.offset, params.offset + params.limit),
      total,
      limit: params.limit,
      offset: params.offset,
    };
  }

  async get(id: string): Promise<EvaluationRecord | null> {
    const data = await this.read();
    return data.evaluations.find((item) => item.id === id) ?? null;
  }

  async create(input: unknown): Promise<EvaluationRecord> {
    const parsed = parseEvaluationInput(input);
    const now = new Date().toISOString();
    const record: EvaluationRecord = {
      id: randomUUID(),
      ...parsed,
      status: 'submitted',
      createdAt: now,
      updatedAt: now,
    };

    await this.updateData((data) => ({
      ...data,
      evaluations: [record, ...data.evaluations],
    }));

    return record;
  }

  async updateStatus(
    id: string,
    status: EvaluationStatus,
  ): Promise<EvaluationRecord | null> {
    let updated: EvaluationRecord | null = null;

    await this.updateData((data) => {
      const evaluations = data.evaluations.map((item) => {
        if (item.id !== id) return item;
        updated = {
          ...item,
          status,
          updatedAt: new Date().toISOString(),
        };
        return updated;
      });

      return { ...data, evaluations };
    });

    return updated;
  }

  private async read(): Promise<EvaluationStoreData> {
    try {
      const parsed = await this.document.read({ version: 1, evaluations: [] });
      if (!Array.isArray(parsed.evaluations)) {
        throw new ApiError(500, 'INVALID_DATA_FILE', 'Evaluation data is malformed');
      }
      return {
        version: 1,
        evaluations: parsed.evaluations.filter(isEvaluationRecord),
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof SyntaxError) {
        throw new ApiError(500, 'INVALID_DATA_FILE', 'Evaluation data is not valid JSON');
      }
      throw error;
    }
  }

  private async updateData(
    updater: (data: EvaluationStoreData) => EvaluationStoreData,
  ): Promise<void> {
    await this.document.write(updater(await this.read()));
  }
}

class NotificationStore {
  constructor(
    private readonly document: JsonDocumentStore<NotificationStoreData>,
  ) {}

  async list(params: {
    userId: string;
    page: number;
    pageSize: number;
    type?: NotificationType;
    unreadOnly?: boolean;
  }): Promise<NotificationListResponse> {
    const data = await this.read();
    let items = data.notifications.filter((item) => item.userId === params.userId);

    if (params.type) {
      items = items.filter((item) => item.type === params.type);
    }

    if (params.unreadOnly) {
      items = items.filter((item) => !item.isRead);
    }

    items = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const total = items.length;
    const offset = (params.page - 1) * params.pageSize;

    return {
      data: items.slice(offset, offset + params.pageSize),
      total,
      page: params.page,
      pageSize: params.pageSize,
      unreadCount: data.notifications.filter(
        (item) => item.userId === params.userId && !item.isRead,
      ).length,
    };
  }

  async get(id: string): Promise<NotificationRecord | null> {
    const data = await this.read();
    return data.notifications.find((item) => item.id === id) ?? null;
  }

  async create(input: unknown): Promise<NotificationRecord> {
    const parsed = parseNotificationInput(input);
    const now = new Date().toISOString();
    const record: NotificationRecord = {
      id: randomUUID(),
      ...parsed,
      isRead: false,
      createdAt: now,
      updatedAt: now,
    };

    await this.updateData((data) => ({
      ...data,
      notifications: [record, ...data.notifications],
    }));

    return record;
  }

  async updateRead(id: string, isRead: boolean): Promise<NotificationRecord | null> {
    let updated: NotificationRecord | null = null;

    await this.updateData((data) => {
      const notifications = data.notifications.map((item) => {
        if (item.id !== id) return item;
        updated = {
          ...item,
          isRead,
          updatedAt: new Date().toISOString(),
        };
        return updated;
      });
      return { ...data, notifications };
    });

    return updated;
  }

  async batchUpdateRead(ids: string[], isRead: boolean): Promise<number> {
    const idSet = new Set(ids);
    let count = 0;

    await this.updateData((data) => {
      const notifications = data.notifications.map((item) => {
        if (!idSet.has(item.id)) return item;
        count++;
        return {
          ...item,
          isRead,
          updatedAt: new Date().toISOString(),
        };
      });
      return { ...data, notifications };
    });

    return count;
  }

  async delete(id: string): Promise<boolean> {
    let deleted = false;

    await this.updateData((data) => {
      const notifications = data.notifications.filter((item) => {
        if (item.id === id) {
          deleted = true;
          return false;
        }
        return true;
      });
      return { ...data, notifications };
    });

    return deleted;
  }

  async getUnreadCount(userId: string): Promise<{ unreadCount: number; byType: Record<NotificationType, number> }> {
    const data = await this.read();
    const userNotifications = data.notifications.filter(
      (item) => item.userId === userId && !item.isRead,
    );

    const byType: Record<NotificationType, number> = {
      skill_reviewed: 0,
      skill_status_changed: 0,
      skill_comment: 0,
      system: 0,
    };

    userNotifications.forEach((item) => {
      byType[item.type]++;
    });

    return {
      unreadCount: userNotifications.length,
      byType,
    };
  }

  private async read(): Promise<NotificationStoreData> {
    try {
      const parsed = await this.document.read({ version: 1, notifications: [] });
      if (!Array.isArray(parsed.notifications)) {
        throw new ApiError(500, 'INVALID_DATA_FILE', 'Notification data is malformed');
      }
      return {
        version: 1,
        notifications: parsed.notifications.filter(isNotificationRecord),
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof SyntaxError) {
        throw new ApiError(500, 'INVALID_DATA_FILE', 'Notification data is not valid JSON');
      }
      throw error;
    }
  }

  private async updateData(
    updater: (data: NotificationStoreData) => NotificationStoreData,
  ): Promise<void> {
    await this.document.write(updater(await this.read()));
  }
}

class FavoriteStore {
  constructor(
    private readonly document: JsonDocumentStore<FavoriteStoreData>,
  ) {}

  async list(params: {
    userId: string;
    page: number;
    pageSize: number;
  }): Promise<FavoriteListResponse> {
    const data = await this.read();
    let items = data.favorites.filter((item) => item.userId === params.userId);
    items = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const total = items.length;
    const offset = (params.page - 1) * params.pageSize;

    return {
      items: items.slice(offset, offset + params.pageSize),
      total,
    };
  }

  async get(userId: string, skillId: string): Promise<FavoriteRecord | null> {
    const data = await this.read();
    return data.favorites.find((item) => item.userId === userId && item.skillId === skillId) ?? null;
  }

  async create(userId: string, skillId: string): Promise<FavoriteRecord> {
    const existing = await this.get(userId, skillId);
    if (existing) return existing;

    const now = new Date().toISOString();
    const record: FavoriteRecord = {
      id: randomUUID(),
      userId,
      skillId,
      createdAt: now,
    };

    await this.updateData((data) => ({
      ...data,
      favorites: [record, ...data.favorites],
    }));

    return record;
  }

  async delete(userId: string, skillId: string): Promise<boolean> {
    let deleted = false;

    await this.updateData((data) => {
      const favorites = data.favorites.filter((item) => {
        if (item.userId === userId && item.skillId === skillId) {
          deleted = true;
          return false;
        }
        return true;
      });
      return { ...data, favorites };
    });

    return deleted;
  }

  async isFavorited(userId: string, skillId: string): Promise<boolean> {
    const record = await this.get(userId, skillId);
    return record !== null;
  }

  private async read(): Promise<FavoriteStoreData> {
    try {
      const parsed = await this.document.read({ version: 1, favorites: [] });
      if (!Array.isArray(parsed.favorites)) {
        throw new ApiError(500, 'INVALID_DATA_FILE', 'Favorite data is malformed');
      }
      return {
        version: 1,
        favorites: parsed.favorites.filter(isFavoriteRecord),
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof SyntaxError) {
        throw new ApiError(500, 'INVALID_DATA_FILE', 'Favorite data is not valid JSON');
      }
      throw error;
    }
  }

  private async updateData(
    updater: (data: FavoriteStoreData) => FavoriteStoreData,
  ): Promise<void> {
    await this.document.write(updater(await this.read()));
  }
}

class SearchHistoryStore {
  constructor(
    private readonly document: JsonDocumentStore<SearchHistoryStoreData>,
  ) {}

  async list(params: {
    userId: string;
    limit: number;
  }): Promise<SearchHistoryListResponse> {
    const data = await this.read();
    let items = data.searchHistory.filter((item) => item.userId === params.userId);
    items = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const total = items.length;

    return {
      items: items.slice(0, params.limit),
      total,
    };
  }

  async create(userId: string, query: string): Promise<SearchHistoryRecord> {
    const now = new Date().toISOString();
    const record: SearchHistoryRecord = {
      id: randomUUID(),
      userId,
      query: query.trim(),
      createdAt: now,
    };

    await this.updateData((data) => ({
      ...data,
      searchHistory: [record, ...data.searchHistory],
    }));

    return record;
  }

  async delete(id: string): Promise<boolean> {
    let deleted = false;

    await this.updateData((data) => {
      const searchHistory = data.searchHistory.filter((item) => {
        if (item.id === id) {
          deleted = true;
          return false;
        }
        return true;
      });
      return { ...data, searchHistory };
    });

    return deleted;
  }

  async clear(userId: string): Promise<number> {
    let count = 0;

    await this.updateData((data) => {
      const searchHistory = data.searchHistory.filter((item) => {
        if (item.userId === userId) {
          count++;
          return false;
        }
        return true;
      });
      return { ...data, searchHistory };
    });

    return count;
  }

  private async read(): Promise<SearchHistoryStoreData> {
    try {
      const parsed = await this.document.read({ version: 1, searchHistory: [] });
      if (!Array.isArray(parsed.searchHistory)) {
        throw new ApiError(500, 'INVALID_DATA_FILE', 'Search history data is malformed');
      }
      return {
        version: 1,
        searchHistory: parsed.searchHistory.filter(isSearchHistoryRecord),
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof SyntaxError) {
        throw new ApiError(500, 'INVALID_DATA_FILE', 'Search history data is not valid JSON');
      }
      throw error;
    }
  }

  private async updateData(
    updater: (data: SearchHistoryStoreData) => SearchHistoryStoreData,
  ): Promise<void> {
    await this.document.write(updater(await this.read()));
  }
}

class SkillStore {
  private readonly legacyPlatformSkillSources = new Set([
    'official',
    'backend-private',
    'delivery-private',
    'quality',
    'platform',
    'uploaded',
  ]);

  constructor(
    private readonly document: JsonDocumentStore<SkillStoreData>,
  ) {}

  async list(params: {
    q?: string;
    category?: string;
    source?: string;
    owner?: string;
  }): Promise<SkillListResponse> {
    const data = await this.read();
    const needle = params.q?.trim().toLowerCase();
    let items = data.skills;

    if (needle) {
      items = items.filter((item) =>
        [
          item.name,
          item.description,
          item.author,
          item.source,
          item.category,
          item.version,
          ...item.tags,
        ]
          .join(' ')
          .toLowerCase()
          .includes(needle),
      );
    }

    if (params.category) {
      items = items.filter((item) => item.category === params.category);
    }

    if (params.source) {
      items = items.filter((item) => item.source === params.source);
    }

    if (params.owner) {
      items = items.filter((item) => item.owner === params.owner);
    }

    return { items, total: items.length };
  }

  async get(id: string): Promise<SkillRecord | null> {
    const data = await this.read();
    return data.skills.find((item) => item.id === id) ?? null;
  }

  async upload(input: unknown): Promise<SkillRecord> {
    const parsed = parseSkillInput(input);
    const now = new Date().toISOString();
    const record: SkillRecord = {
      id: `skill-${slugify(parsed.name) || randomUUID()}`,
      installs: 0,
      rating: 0,
      reviews: 0,
      status: 'review',
      command: `npx suit-skills@latest install ${parsed.name}`,
      updatedAt: now,
      uploadStatus: 'waiting_publish',
      ...parsed,
    };

    await this.updateData((data) => {
      const existingIndex = data.skills.findIndex((item) => item.id === record.id);
      const skills =
        existingIndex >= 0
          ? data.skills.map((item, index) => (index === existingIndex ? record : item))
          : [record, ...data.skills];
      return { ...data, skills };
    });

    return record;
  }

  async upsert(record: SkillRecord): Promise<SkillRecord> {
    await this.updateData((data) => {
      const existingIndex = data.skills.findIndex((item) => item.id === record.id);
      const skills =
        existingIndex >= 0
          ? data.skills.map((item, index) => (index === existingIndex ? record : item))
          : [record, ...data.skills];
      return { ...data, skills };
    });
    return record;
  }

  private async read(): Promise<SkillStoreData> {
    try {
      const parsed = await this.document.read({ version: 1, skills: DEFAULT_SKILLS });
      if (!Array.isArray(parsed.skills)) {
        throw new ApiError(500, 'INVALID_SKILLS_FILE', 'Skills data is malformed');
      }
      const skills = parsed.skills
        .filter(isSkillRecord)
        .map((skill) => this.decorateSkill(skill));
      return { version: 1, skills: skills.length ? skills : DEFAULT_SKILLS };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof SyntaxError) {
        throw new ApiError(500, 'INVALID_SKILLS_FILE', 'Skills data is not valid JSON');
      }
      throw error;
    }
  }

  private async updateData(updater: (data: SkillStoreData) => SkillStoreData): Promise<void> {
    await this.document.write(updater(await this.read()));
  }

  private decorateSkill(skill: SkillRecord): SkillRecord {
    return this.legacyPlatformSkillSources.has(skill.source)
      ? { ...skill, source: 'default' }
      : skill;
  }
}

class SkillFileStore {
  constructor(
    private readonly document: JsonDocumentStore<SkillFileStoreData>,
    private readonly skillStore: SkillStore,
  ) {}

  async list(skillId: string, selectedPath?: string): Promise<SkillFilesResponse | null> {
    const skill = await this.skillStore.get(skillId);
    if (!skill) return null;
    const files = await this.filesForSkill(skill);
    const selected = normalizeSkillFilePath(selectedPath || 'SKILL.md');
    const selectedRecord =
      files.find((file) => file.path === selected) ??
      files.find((file) => file.path === 'SKILL.md') ??
      files[0];

    return {
      root: buildFileTree(files),
      selectedFile: selectedRecord ? fileDetail(selectedRecord) : undefined,
    };
  }

  async getFile(skillId: string, path: string): Promise<SkillFileDetail | null> {
    const skill = await this.skillStore.get(skillId);
    if (!skill) return null;
    const safePath = normalizeSkillFilePath(path);
    const file = (await this.filesForSkill(skill)).find((item) => item.path === safePath);
    return file ? fileDetail(file) : null;
  }

  async writeFile(skillId: string, path: string, content: string): Promise<SkillFileDetail | null> {
    if (typeof content !== 'string') {
      throw new ApiError(400, 'INVALID_FIELD', 'content must be a string');
    }

    const skill = await this.skillStore.get(skillId);
    if (!skill) return null;
    const safePath = normalizeSkillFilePath(path);
    const now = new Date().toISOString();
    let updated: SkillFileRecord = { path: safePath, content, updatedAt: now };

    await this.updateData(async (data) => {
      const existing = data.skills[skillId] ?? defaultSkillFiles(skill);
      const found = existing.some((file) => file.path === safePath);
      const nextFiles = found
        ? existing.map((file) => (file.path === safePath ? updated : file))
        : [...existing, updated].sort((a, b) => a.path.localeCompare(b.path));

      return {
        ...data,
        skills: {
          ...data.skills,
          [skillId]: nextFiles,
        },
      };
    });

    return fileDetail(updated);
  }

  private async filesForSkill(skill: SkillRecord): Promise<SkillFileRecord[]> {
    const data = await this.read();
    return data.skills[skill.id] ?? defaultSkillFiles(skill);
  }

  private async read(): Promise<SkillFileStoreData> {
    try {
      const parsed = await this.document.read({ version: 1, skills: {} });
      if (!isPlainObject(parsed.skills)) {
        throw new ApiError(500, 'INVALID_SKILL_FILES', 'Skill files data is malformed');
      }

      return {
        version: 1,
        skills: Object.fromEntries(
          Object.entries(parsed.skills)
            .filter(([, files]) => Array.isArray(files))
            .map(([skillId, files]) => [
              skillId,
              (files as unknown[]).filter(
                (file): file is SkillFileRecord =>
                  isPlainObject(file) &&
                  typeof file.path === 'string' &&
                  typeof file.content === 'string' &&
                  typeof file.updatedAt === 'string',
              ),
            ]),
        ),
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof SyntaxError) {
        throw new ApiError(500, 'INVALID_SKILL_FILES', 'Skill files data is not valid JSON');
      }
      throw error;
    }
  }

  private async updateData(
    updater: (data: SkillFileStoreData) => Promise<SkillFileStoreData>,
  ): Promise<void> {
    await this.document.write(await updater(await this.read()));
  }
}

class GitConfigStore {
  constructor(
    private readonly document: JsonDocumentStore<GitConfig>,
  ) {}

  async get(): Promise<GitConfig> {
    try {
      const parsed = await this.document.read(DEFAULT_GIT_CONFIG);
      return parseGitConfig(parsed, DEFAULT_GIT_CONFIG);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new ApiError(500, 'INVALID_GIT_CONFIG', 'Git config data is not valid JSON');
      }
      throw error;
    }
  }

  async update(input: unknown): Promise<GitConfig> {
    const next = parseGitConfig(input, await this.get());
    await this.write(next);
    return next;
  }

  async test(): Promise<GitConfig> {
    const current = await this.get();
    const next: GitConfig = {
      ...current,
      lastTestAt: new Date().toISOString(),
      lastTestStatus: current.defaultGitUrl.trim() ? 'success' : 'failed',
    };
    await this.write(next);
    return next;
  }

  private async write(config: GitConfig): Promise<void> {
    await this.document.write(config);
  }
}

class SourceStore {
  private readonly legacyPlatformBuiltins = new Set([
    'official',
    'backend-private',
    'delivery-private',
    'quality',
    'platform',
    'uploaded',
  ]);

  constructor(
    private readonly document: JsonDocumentStore<SourceStoreData>,
  ) {}

  async list(): Promise<SourcesResponse> {
    const sources = await this.read();
    return {
      sources,
      defaultSources: sources
        .filter((source) => source.default)
        .map((source) => source.name),
    };
  }

  async create(input: unknown): Promise<SourcesResponse & { source: SourceRecord }> {
    const parsed = parseSourceInput(input);
    const existing = await this.read();
    if (existing.some((source) => source.name === parsed.name)) {
      throw new ApiError(409, 'SOURCE_EXISTS', 'Source already exists');
    }

    const now = new Date().toISOString();
    const source: SourceRecord = {
      ...parsed,
      enabled: true,
      default: false,
      createdAt: now,
      updatedAt: now,
    };

    await this.writeSources([...existing, source]);
    return { ...(await this.list()), source };
  }

  async getPublishTarget(): Promise<SourceRecord | null> {
    const sources = await this.read();
    return (
      sources.find(
        (source) =>
          source.enabled &&
          source.publishEnabled === true &&
          typeof source.url === 'string' &&
          source.url.trim() !== '',
      ) ?? null
    );
  }

  async restoreBuiltins(): Promise<SourcesResponse & { added: string[] }> {
    const existing = await this.read();
    const names = new Set(existing.map((source) => source.name));
    const added = DEFAULT_SOURCES.filter((source) => !source.default && !names.has(source.name));
    if (added.length > 0) {
      await this.writeSources([...existing, ...added]);
    }
    return { ...(await this.list()), added: added.map((source) => source.name) };
  }

  async update(
    name: string,
    input: unknown,
  ): Promise<SourcesResponse & { source: SourceRecord }> {
    const patch = parseSourcePatch(input);
    const existing = await this.read();
    const current = existing.find((source) => source.name === name);
    if (!current) {
      throw new ApiError(404, 'SOURCE_NOT_FOUND', 'Source not found');
    }

    const updated: SourceRecord = {
      ...current,
      label: patch.label ?? current.label,
      description: patch.description ?? current.description,
      url: patch.url ?? current.url,
      branch: patch.branch ?? current.branch,
      skillsDirectory: patch.skillsDirectory ?? current.skillsDirectory,
      publishEnabled: patch.publishEnabled ?? current.publishEnabled,
      domesticMirror:
        patch.domesticMirror?.enabled === undefined
          ? current.domesticMirror
          : current.domesticMirror
            ? { ...current.domesticMirror, enabled: patch.domesticMirror.enabled }
            : current.domesticMirror,
      enabled: patch.enabled ?? current.enabled,
      updatedAt: new Date().toISOString(),
    };

    if (!updated.enabled && this.enabledCount(existing, name) <= 0) {
      throw new ApiError(400, 'LAST_SOURCE_DISABLED', 'Cannot disable the last enabled source');
    }

    const sources = existing.map((source) =>
      source.name === name ? updated : source,
    );
    await this.writeSources(sources);
    return { ...(await this.list()), source: updated };
  }

  async remove(name: string): Promise<SourcesResponse & { removed: string }> {
    const existing = await this.read();
    const current = existing.find((source) => source.name === name);
    if (!current) {
      throw new ApiError(404, 'SOURCE_NOT_FOUND', 'Source not found');
    }
    if (current.default) {
      throw new ApiError(400, 'DEFAULT_SOURCE_READONLY', 'Cannot remove default source');
    }
    if (current.enabled && this.enabledCount(existing, name) <= 0) {
      throw new ApiError(400, 'LAST_SOURCE_REMOVED', 'Cannot remove the last enabled source');
    }

    await this.writeSources(existing.filter((source) => source.name !== name));
    return { ...(await this.list()), removed: name };
  }

  private enabledCount(sources: SourceRecord[], excludingName?: string): number {
    return sources.filter(
      (source) => source.enabled && source.name !== excludingName,
    ).length;
  }

  private async read(): Promise<SourceRecord[]> {
    let storedSources: SourceRecord[] = [];
    try {
      const parsed = await this.document.read({ version: 1, sources: [] });
      if (!Array.isArray(parsed.sources)) {
        throw new ApiError(500, 'INVALID_SOURCES_FILE', 'Sources data is malformed');
      }
      storedSources = parsed.sources
        .filter(isSourceRecord)
        .filter((source) => !this.legacyPlatformBuiltins.has(source.name));
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new ApiError(500, 'INVALID_SOURCES_FILE', 'Sources data is not valid JSON');
      } else if (error instanceof ApiError) {
        throw error;
      } else {
        throw error;
      }
    }

    if (storedSources.length === 0) {
      return DEFAULT_SOURCES.map((source) => ({ ...source }));
    }

    const storedNames = new Set(storedSources.map((source) => source.name));
    const hasAnyBuiltin = DEFAULT_SOURCES.some((source) => storedNames.has(source.name));
    const sources = hasAnyBuiltin
      ? storedSources
      : [...DEFAULT_SOURCES, ...storedSources];

    return sources.map((source) => this.decorateSource(source));
  }

  private decorateSource(source: SourceRecord): SourceRecord {
    const builtin = DEFAULT_SOURCES.find((item) => item.name === source.name);
    if (!builtin) {
      return {
        ...source,
        default: false,
        builtin: false,
        effectiveUrl: this.effectiveUrl(source),
      };
    }
    const decorated = {
      ...builtin,
      ...source,
      default: source.default === true,
      builtin: true,
    };
    return {
      ...decorated,
      effectiveUrl: this.effectiveUrl(decorated),
    };
  }

  private effectiveUrl(source: SourceRecord): string {
    const mirror = source.domesticMirror;
    if (mirror?.enabled && mirror.url.trim()) {
      return mirror.url.trim();
    }
    return source.url?.trim() ?? '';
  }

  private async writeSources(sources: SourceRecord[]): Promise<void> {
    const data: SourceStoreData = {
      version: 1,
      sources: sources.map((source) => this.decorateSource(source)),
    };
    await this.document.write(data);
  }
}

interface SourceSkillRow {
  source: SourceRecord;
  skillDir: string;
  metadata: SkillMarkdownMetadata;
}

class SourceBackedSkillCatalog {
  private readonly rowsCache = new Map<string, { expiresAt: number; rows: SourceSkillRow[] }>();
  private readonly maxAgeMs = 5 * 60_000;

  constructor(
    private readonly sourceStore: SourceStore,
  ) {}

  async list(params: {
    q?: string;
    category?: string;
    source?: string;
    owner?: string;
  }): Promise<SkillListResponse> {
    const rows = await this.rows(params.source);
    const filteredByQuery = params.q?.trim()
      ? this.filterRowsByQuery(rows, params.q)
      : rows;
    const items = filteredByQuery
      .map((row) => this.toSkillRecord(row))
      .filter((item) => (params.category ? item.category === params.category : true))
      .filter((item) => (params.owner ? item.owner === params.owner : true));
    return { items, total: items.length };
  }

  async get(idOrName: string): Promise<SkillRecord | null> {
    const row = (await this.rows()).find((item) => {
      const record = this.toSkillRecord(item);
      return record.id === idOrName || record.name === idOrName;
    });
    return row ? this.toSkillRecord(row) : null;
  }

  async listFiles(idOrName: string, selectedPath?: string): Promise<SkillFilesResponse | null> {
    const row = await this.findRow(idOrName);
    if (!row) return null;
    const files = this.filesForRow(row);
    const selected = normalizeSkillFilePath(selectedPath || 'SKILL.md');
    const selectedRecord =
      files.find((file) => file.path === selected) ??
      files.find((file) => file.path === 'SKILL.md') ??
      files[0];

    return {
      root: buildFileTree(files),
      selectedFile: selectedRecord ? fileDetail(selectedRecord) : undefined,
    };
  }

  async getFile(idOrName: string, path: string): Promise<SkillFileDetail | null> {
    const row = await this.findRow(idOrName);
    if (!row) return null;
    const safePath = normalizeSkillFilePath(path);
    const file = this.filesForRow(row).find((item) => item.path === safePath);
    return file ? fileDetail(file) : null;
  }

  private async findRow(idOrName: string): Promise<SourceSkillRow | null> {
    return (
      (await this.rows()).find((item) => {
        const record = this.toSkillRecord(item);
        return record.id === idOrName || record.name === idOrName;
      }) ?? null
    );
  }

  private async rows(sourceFilter?: string): Promise<SourceSkillRow[]> {
    const response = await this.sourceStore.list();
    const sources = response.sources.filter((source) => {
      if (!source.enabled) return false;
      if (sourceFilter && source.name !== sourceFilter) return false;
      return this.effectiveUrl(source) !== '';
    });
    const rows: SourceSkillRow[] = [];
    const seenNames = new Set<string>();
    for (const source of sources) {
      for (const row of this.rowsForSource(source)) {
        const name = row.metadata.meta.name;
        if (seenNames.has(name)) continue;
        seenNames.add(name);
        rows.push(row);
      }
    }
    return rows;
  }

  private rowsForSource(source: SourceRecord): SourceSkillRow[] {
    const url = this.effectiveUrl(source);
    const cacheKey = `${source.name}\0${url}`;
    const cached = this.rowsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.rows;
    }

    const rows = this.refreshRowsForSource(source);
    this.rowsCache.set(cacheKey, {
      expiresAt: Date.now() + this.maxAgeMs,
      rows,
    });
    return rows;
  }

  private refreshRowsForSource(source: SourceRecord): SourceSkillRow[] {
    try {
      const refresh = refreshCache(this.effectiveUrl(source), { maxAgeMs: this.maxAgeMs });
      return this.scanSourceRows(refresh.path, source);
    } catch {
      return this.cachedRowsForSource(source);
    }
  }

  private cachedRowsForSource(source: SourceRecord): SourceSkillRow[] {
    for (const cachePath of this.sourceCacheFallbackPaths(source)) {
      const rows = this.scanSourceRows(cachePath, source);
      if (rows.length > 0) return rows;
    }
    return [];
  }

  private sourceCacheFallbackPaths(source: SourceRecord): string[] {
    const urls = [
      this.effectiveUrl(source),
      source.url,
      source.domesticMirror?.url,
    ].filter((item): item is string => typeof item === 'string' && item.trim() !== '');
    const seen = new Set<string>();
    const paths: string[] = [];
    for (const url of urls) {
      const cachePath = getSourceCacheDir(url);
      const key = process.platform === 'win32' ? cachePath.toLowerCase() : cachePath;
      if (seen.has(key)) continue;
      seen.add(key);
      paths.push(cachePath);
    }
    return paths;
  }

  private scanSourceRows(cacheRoot: string, source: SourceRecord): SourceSkillRow[] {
    const rows: SourceSkillRow[] = [];
    const seenDirs = new Set<string>();
    const seenNames = new Set<string>();
    for (const parent of this.skillParents(cacheRoot, source)) {
      this.collectSkillRows(parent, source, rows, seenDirs, seenNames, 0);
    }
    return rows;
  }

  private collectSkillRows(
    dir: string,
    source: SourceRecord,
    rows: SourceSkillRow[],
    seenDirs: Set<string>,
    seenNames: Set<string>,
    depth: number,
  ): void {
    if (depth > 8 || !existsSync(dir)) return;
    let dirStat: ReturnType<typeof statSync>;
    try {
      dirStat = statSync(dir);
    } catch {
      return;
    }
    if (!dirStat.isDirectory()) return;

    const baseName = basename(dir);
    if (isIgnoredSourceDirectory(baseName)) return;

    const dirKey = process.platform === 'win32' ? resolve(dir).toLowerCase() : resolve(dir);
    if (seenDirs.has(dirKey)) return;

    if (hasSourceSkillEntry(dir)) {
      seenDirs.add(dirKey);
      this.addSkillRow(dir, source, rows, seenNames);
      return;
    }

    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || isIgnoredSourceDirectory(entry.name)) continue;
      this.collectSkillRows(join(dir, entry.name), source, rows, seenDirs, seenNames, depth + 1);
    }
  }

  private addSkillRow(
    skillDir: string,
    source: SourceRecord,
    rows: SourceSkillRow[],
    seenNames: Set<string>,
  ): void {
    try {
      const metadata = readSkillMarkdownMetadata(skillDir);
      if (
        metadata.meta.version === 'unknown' &&
        metadata.metadataSource === 'unknown' &&
        !existsSync(join(skillDir, 'SKILL.md'))
      ) {
        return;
      }
      if (seenNames.has(metadata.meta.name)) return;
      seenNames.add(metadata.meta.name);
      rows.push({ source, skillDir, metadata });
    } catch {
      return;
    }
  }

  private skillParents(cacheRoot: string, source: SourceRecord): string[] {
    const parents = [cacheRoot, join(cacheRoot, 'skills')];
    const skillsDirectory = source.skillsDirectory?.replace(/\\/g, '/').replace(/^\/+/, '').trim();
    if (skillsDirectory && skillsDirectory !== '.' && !skillsDirectory.startsWith('../')) {
      parents.push(join(cacheRoot, skillsDirectory));
    }
    return [...new Set(parents.map((parent) => resolve(parent)))];
  }

  private filterRowsByQuery(rows: SourceSkillRow[], query: string): SourceSkillRow[] {
    const found = new Set(searchSkills(rows.map((row) => row.metadata.meta), query).map((meta) => meta.name));
    return rows.filter((row) => found.has(row.metadata.meta.name));
  }

  private filesForRow(row: SourceSkillRow): SkillFileRecord[] {
    const updatedAt = this.updatedAt(row);
    return collectSourceFiles(row.skillDir).map((filePath) => {
      const relativePath = normalize(filePath.slice(row.skillDir.length + 1)).replace(/\\/g, '/');
      return {
        path: relativePath,
        content: readFileSync(filePath, 'utf8'),
        updatedAt,
      };
    });
  }

  private toSkillRecord(row: SourceSkillRow): SkillRecord {
    const meta = row.metadata.meta;
    const name = textValue(meta.name) || basename(row.skillDir);
    const description = textValue(meta.description) || 'Source skill package';
    const version = textValue(meta.version) || 'unknown';
    const category = textValue(meta.category) || this.firstTag(meta.tags) || 'custom';
    return {
      id: `skill-${slugify(name) || name}`,
      name,
      description,
      author: textValue(meta.author) || row.source.label || row.source.name,
      source: row.source.name,
      category,
      version,
      installs: numberValue(meta.installs),
      rating: numberValue(meta.rating),
      reviews: numberValue(meta.reviews),
      status: 'verified',
      tags: normalizeStringArray(meta.tags),
      command: `npx suit-skills@latest install ${name}`,
      updatedAt: this.updatedAt(row),
      owner: 'source',
      uploadStatus: 'published',
      gitUrl: this.effectiveUrl(row.source),
    };
  }

  private firstTag(value: unknown): string | undefined {
    return normalizeStringArray(value)[0];
  }

  private updatedAt(row: SourceSkillRow): string {
    try {
      return statSync(row.skillDir).mtime.toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  private effectiveUrl(source: SourceRecord): string {
    const mirror = source.domesticMirror;
    if (mirror?.enabled && mirror.url.trim()) {
      return mirror.url.trim();
    }
    return source.url?.trim() ?? '';
  }
}

class PackageUploadStore {
  constructor(
    private readonly document: JsonDocumentStore<PackageUploadStoreData>,
    private readonly uploadDir: string,
  ) {}

  async list(params: {
    owner?: string;
    status?: PackageUploadStatus;
  }): Promise<PackageUploadListResponse> {
    const data = await this.read();
    let items = data.uploads;
    if (params.owner) {
      items = items.filter((item) => item.owner === params.owner);
    }
    if (params.status) {
      items = items.filter((item) => item.status === params.status);
    }
    items = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { items, total: items.length };
  }

  async get(id: string): Promise<PackageUploadRecord | null> {
    const data = await this.read();
    return data.uploads.find((item) => item.id === id) ?? null;
  }

  async parsePackage(file: UploadedFile, owner: string): Promise<PackageUploadRecord> {
    const now = new Date().toISOString();
    const id = randomUUID();
    const packageRoot = resolve(this.uploadDir, id);
    const originalFilePath = join(packageRoot, 'original', sanitizeFileName(file.fileName));
    const extractedDir = join(packageRoot, 'package');

    await mkdir(dirname(originalFilePath), { recursive: true });
    await mkdir(extractedDir, { recursive: true });
    await writeFile(originalFilePath, file.content);

    await extractSkillPackage(file, extractedDir);
    const parsed = await parseExtractedSkill(extractedDir);
    const metadata = buildSkillRecord(parsed, owner);
    const validation = validatePackage(metadata, parsed);
    const packageDir = parsed.skillFilePath ? dirname(parsed.skillFilePath) : extractedDir;
    const record: PackageUploadRecord = {
      id,
      fileName: file.fileName,
      packageDir,
      originalFilePath,
      owner,
      status: 'parsed',
      metadata,
      validation,
      createdAt: now,
      updatedAt: now,
    };

    await this.updateData((data) => ({
      ...data,
      uploads: [record, ...data.uploads],
    }));
    return record;
  }

  async updateMetadata(id: string, input: unknown): Promise<PackageUploadRecord | null> {
    const patch = parseSkillInput(input);
    let updated: PackageUploadRecord | null = null;
    await this.updateData((data) => {
      const uploads = data.uploads.map((record) => {
        if (record.id !== id) return record;
        updated = {
          ...record,
          metadata: {
            ...record.metadata,
            ...patch,
            id: `skill-${slugify(patch.name) || record.id}`,
            command: `npx suit-skills@latest install ${patch.name}`,
            updatedAt: new Date().toISOString(),
          },
          updatedAt: new Date().toISOString(),
        };
        return updated;
      });
      return { ...data, uploads };
    });
    return updated;
  }

  async submit(id: string): Promise<PackageUploadRecord | null> {
    return this.setStatus(id, 'waiting_review');
  }

  async publish(
    id: string,
    sourceStore: SourceStore,
    skillStore: SkillStore,
  ): Promise<PackageUploadRecord | null> {
    const record = await this.setStatus(id, 'publishing');
    if (!record) return null;

    try {
      const publishSource = await sourceStore.getPublishTarget();
      if (!publishSource) {
        throw new ApiError(
          400,
          'MISSING_PUBLISH_SOURCE',
          'At least one enabled source with publish enabled and a Git URL is required before publishing',
        );
      }
      const publishedCommit = await publishPackageToSource(record, publishSource);
      const metadata: SkillRecord = {
        ...record.metadata,
        source: publishSource.name,
        gitUrl: publishSource.url,
        status: 'verified',
        uploadStatus: 'published',
        updatedAt: new Date().toISOString(),
      };
      await skillStore.upsert(metadata);
      return this.patchRecord(id, {
        status: 'published',
        metadata,
        publishedCommit,
        publishError: undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.patchRecord(id, {
        status: 'publish_failed',
        publishError: message,
      });
    }
  }

  private async setStatus(
    id: string,
    status: PackageUploadStatus,
  ): Promise<PackageUploadRecord | null> {
    return this.patchRecord(id, { status });
  }

  private async patchRecord(
    id: string,
    patch: Partial<PackageUploadRecord>,
  ): Promise<PackageUploadRecord | null> {
    let updated: PackageUploadRecord | null = null;
    await this.updateData((data) => {
      const uploads = data.uploads.map((record) => {
        if (record.id !== id) return record;
        updated = {
          ...record,
          ...patch,
          updatedAt: new Date().toISOString(),
        };
        return updated;
      });
      return { ...data, uploads };
    });
    return updated;
  }

  private async read(): Promise<PackageUploadStoreData> {
    try {
      const parsed = await this.document.read({ version: 1, uploads: [] });
      if (!Array.isArray(parsed.uploads)) {
        throw new ApiError(500, 'INVALID_UPLOADS_FILE', 'Uploads data is malformed');
      }
      return {
        version: 1,
        uploads: parsed.uploads.filter(isPackageUploadRecord),
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof SyntaxError) {
        throw new ApiError(500, 'INVALID_UPLOADS_FILE', 'Uploads data is not valid JSON');
      }
      throw error;
    }
  }

  private async updateData(
    updater: (data: PackageUploadStoreData) => PackageUploadStoreData,
  ): Promise<void> {
    await this.document.write(updater(await this.read()));
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): PlatformApiConfig {
  const portText = env.PORT ?? env.PLATFORM_API_PORT ?? '4591';
  const port = Number.parseInt(portText, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT value: ${portText}`);
  }
  const host = env.HOST ?? env.PLATFORM_API_HOST ?? '0.0.0.0';
  const appBaseUrl = (env.PLATFORM_WEB_APP_URL ?? env.APP_BASE_URL ?? 'http://127.0.0.1:1431').replace(/\/$/, '');
  const publicBaseUrl = (env.PLATFORM_API_PUBLIC_URL ?? `http://127.0.0.1:${port}`).replace(/\/$/, '');

  return {
    host,
    port,
    dataFile: env.PLATFORM_API_DATA_FILE
      ? resolve(env.PLATFORM_API_DATA_FILE)
      : env.DATA_FILE
        ? resolve(env.DATA_FILE)
        : DEFAULT_DATA_FILE,
    skillsFile: env.PLATFORM_API_SKILLS_FILE
      ? resolve(env.PLATFORM_API_SKILLS_FILE)
      : DEFAULT_SKILLS_FILE,
    gitConfigFile: env.PLATFORM_API_GIT_CONFIG_FILE
      ? resolve(env.PLATFORM_API_GIT_CONFIG_FILE)
      : DEFAULT_GIT_CONFIG_FILE,
    sourcesFile: env.PLATFORM_API_SOURCES_FILE
      ? resolve(env.PLATFORM_API_SOURCES_FILE)
      : DEFAULT_SOURCES_FILE,
    uploadsFile: env.PLATFORM_API_UPLOADS_FILE
      ? resolve(env.PLATFORM_API_UPLOADS_FILE)
      : DEFAULT_UPLOADS_FILE,
    uploadDir: env.PLATFORM_API_UPLOAD_DIR
      ? resolve(env.PLATFORM_API_UPLOAD_DIR)
      : DEFAULT_UPLOAD_DIR,
    databaseUrl: env.PLATFORM_DATABASE_URL ?? env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    corsOrigins: parseCorsOrigins(env.CORS_ORIGIN ?? env.PLATFORM_API_CORS_ORIGIN),
    appBaseUrl,
    auth: loadOAuthConfig(env, publicBaseUrl),
  };
}

function loadOAuthConfig(
  env: NodeJS.ProcessEnv,
  publicBaseUrl: string,
): OAuthConfig {
  const issuer = (env.OAUTH_ISSUER_URL ?? env.OIDC_ISSUER_URL ?? '').replace(/\/$/, '');
  const authorizationUrl =
    env.OAUTH_AUTHORIZATION_URL ??
    env.OIDC_AUTHORIZATION_URL ??
    (issuer ? `${issuer}/authorize` : '');
  const tokenUrl =
    env.OAUTH_TOKEN_URL ??
    env.OIDC_TOKEN_URL ??
    (issuer ? `${issuer}/oauth/token` : '');
  const userInfoUrl =
    env.OAUTH_USERINFO_URL ??
    env.OIDC_USERINFO_URL ??
    (issuer ? `${issuer}/userinfo` : '');

  const clientId = env.OAUTH_CLIENT_ID ?? env.OIDC_CLIENT_ID ?? '';
  const clientSecret = env.OAUTH_CLIENT_SECRET ?? env.OIDC_CLIENT_SECRET ?? '';
  const sessionSecret =
    env.PLATFORM_AUTH_SESSION_SECRET ??
    env.OAUTH_SESSION_SECRET ??
    env.SESSION_SECRET ??
    '';
  const hasOAuthPasswordConfig = Boolean(
    clientId && clientSecret && tokenUrl && userInfoUrl && sessionSecret,
  );
  const localMode =
    env.PLATFORM_AUTH_MODE === 'local' ||
    (env.PLATFORM_AUTH_MODE !== 'oauth' && !hasOAuthPasswordConfig);
  const effectiveSessionSecret =
    sessionSecret || 'local-dev-clawhub-session-secret-change-before-production';

  return {
    enabled: localMode || hasOAuthPasswordConfig,
    mode: localMode ? 'local' : 'oauth',
    clientId,
    clientSecret,
    authorizationUrl,
    tokenUrl,
    userInfoUrl,
    redirectUri:
      env.OAUTH_REDIRECT_URI ??
      env.OIDC_REDIRECT_URI ??
      `${publicBaseUrl}/api/auth/callback`,
    scopes: splitCsv(env.OAUTH_SCOPES ?? env.OIDC_SCOPES ?? 'openid,profile,email'),
    sessionSecret: effectiveSessionSecret,
    adminEmails: splitCsv(env.PLATFORM_ADMIN_EMAILS),
    adminDomains: splitCsv(env.PLATFORM_ADMIN_DOMAINS).map((domain) =>
      domain.replace(/^@/, '').toLowerCase(),
    ),
  };
}

function splitCsv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function handleOAuthLogin(
  res: ServerResponse,
  config: PlatformApiConfig,
  redirectPath?: string,
): void {
  if (!config.auth.enabled) {
    throw new ApiError(503, 'OAUTH_NOT_CONFIGURED', 'OAuth login is not configured');
  }

  const state = randomBytes(24).toString('base64url');
  const redirect = normalizeAppRedirect(redirectPath);
  const statePayload = signPayload(
    { state, redirect, expiresAt: Date.now() + 1000 * 60 * 10 },
    config.auth.sessionSecret,
  );
  setCookie(res, OAUTH_STATE_COOKIE_NAME, statePayload, 600);

  const authUrl = new URL(config.auth.authorizationUrl);
  authUrl.searchParams.set('client_id', config.auth.clientId);
  authUrl.searchParams.set('redirect_uri', config.auth.redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', config.auth.scopes.join(' '));
  authUrl.searchParams.set('state', state);

  res.writeHead(302, { location: authUrl.toString() });
  res.end();
}

async function handleOAuthPasswordLogin(
  req: IncomingMessage,
  res: ServerResponse,
  config: PlatformApiConfig,
): Promise<void> {
  if (!config.auth.enabled) {
    throw new ApiError(503, 'OAUTH_NOT_CONFIGURED', 'OAuth login is not configured');
  }
  const body = await readJsonBody(req);
  if (!isPlainObject(body)) {
    throw new ApiError(400, 'INVALID_BODY', 'Request body must be a JSON object');
  }
  const username = requiredString(body.username, 'username');
  const password = requiredString(body.password, 'password');
  const user =
    config.auth.mode === 'local'
      ? createLocalAuthUser(username, config.auth)
      : await exchangeOAuthPassword(config.auth, username, password).then((token) =>
          fetchOAuthUser(config.auth, token.access_token),
        );
  const session = signPayload(
    { user, expiresAt: Date.now() + SESSION_TTL_MS },
    config.auth.sessionSecret,
  );
  setCookie(res, AUTH_COOKIE_NAME, session, Math.floor(SESSION_TTL_MS / 1000));
  sendJson(res, 200, { user });
}

function createLocalAuthUser(username: string, auth: OAuthConfig): AuthUser {
  const email = username.includes('@') ? username.toLowerCase() : `${username}@local.dev`;
  return {
    id: `local:${email}`,
    email,
    name: username,
    role: resolveUserRole(email, auth),
  };
}

async function handleOAuthCallback(
  req: IncomingMessage,
  res: ServerResponse,
  config: PlatformApiConfig,
  url: URL,
): Promise<void> {
  if (!config.auth.enabled) {
    throw new ApiError(503, 'OAUTH_NOT_CONFIGURED', 'OAuth login is not configured');
  }

  const error = url.searchParams.get('error');
  if (error) {
    redirectToApp(res, config, `/auth/callback?error=${encodeURIComponent(error)}`);
    return;
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) {
    throw new ApiError(400, 'INVALID_OAUTH_CALLBACK', 'OAuth callback is missing code or state');
  }

  const stateCookie = readCookie(req, OAUTH_STATE_COOKIE_NAME);
  const statePayload = stateCookie
    ? verifyPayload<{ state?: unknown; redirect?: unknown; expiresAt?: unknown }>(
        stateCookie,
        config.auth.sessionSecret,
      )
    : null;
  if (
    !statePayload ||
    statePayload.state !== state ||
    typeof statePayload.expiresAt !== 'number' ||
    statePayload.expiresAt < Date.now()
  ) {
    throw new ApiError(400, 'INVALID_OAUTH_STATE', 'OAuth state is invalid or expired');
  }

  const token = await exchangeOAuthCode(config.auth, code);
  const user = await fetchOAuthUser(config.auth, token.access_token);
  const session = signPayload(
    { user, expiresAt: Date.now() + SESSION_TTL_MS },
    config.auth.sessionSecret,
  );

  clearCookie(res, OAUTH_STATE_COOKIE_NAME);
  setCookie(res, AUTH_COOKIE_NAME, session, Math.floor(SESSION_TTL_MS / 1000));
  redirectToApp(res, config, normalizeAppRedirect(String(statePayload.redirect || '/market')));
}

async function exchangeOAuthCode(
  auth: OAuthConfig,
  code: string,
): Promise<{ access_token: string }> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: auth.redirectUri,
    client_id: auth.clientId,
    client_secret: auth.clientSecret,
  });
  const response = await fetch(auth.tokenUrl, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof payload.access_token !== 'string') {
    throw new ApiError(
      502,
      'OAUTH_TOKEN_FAILED',
      `OAuth token exchange failed with status ${response.status}`,
    );
  }
  return { access_token: payload.access_token };
}

async function exchangeOAuthPassword(
  auth: OAuthConfig,
  username: string,
  password: string,
): Promise<{ access_token: string }> {
  const body = new URLSearchParams({
    grant_type: 'password',
    username,
    password,
    scope: auth.scopes.join(' '),
    client_id: auth.clientId,
    client_secret: auth.clientSecret,
  });
  const response = await fetch(auth.tokenUrl, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof payload.access_token !== 'string') {
    const description =
      textValue(payload.error_description) ||
      textValue(payload.error) ||
      `OAuth password login failed with status ${response.status}`;
    throw new ApiError(401, 'OAUTH_PASSWORD_LOGIN_FAILED', description);
  }
  return { access_token: payload.access_token };
}

async function fetchOAuthUser(auth: OAuthConfig, accessToken: string): Promise<AuthUser> {
  const response = await fetch(auth.userInfoUrl, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new ApiError(
      502,
      'OAUTH_USERINFO_FAILED',
      `OAuth userinfo failed with status ${response.status}`,
    );
  }

  const email = textValue(payload.email).toLowerCase();
  const id = textValue(payload.sub) || email || textValue(payload.id);
  if (!id) {
    throw new ApiError(502, 'OAUTH_USER_MISSING_ID', 'OAuth userinfo did not include an id');
  }
  const name = textValue(payload.name) || textValue(payload.nickname) || email || id;
  return {
    id,
    email,
    name,
    avatarUrl: textValue(payload.picture) || textValue(payload.avatar_url) || undefined,
    role: resolveUserRole(email, auth),
  };
}

function resolveUserRole(email: string, auth: OAuthConfig): 'user' | 'admin' {
  if (!email) return 'user';
  if (auth.adminEmails.map((item) => item.toLowerCase()).includes(email)) {
    return 'admin';
  }
  const domain = email.split('@')[1]?.toLowerCase();
  return domain && auth.adminDomains.includes(domain) ? 'admin' : 'user';
}

function readSessionUser(
  req: IncomingMessage,
  auth: OAuthConfig,
): AuthUser | null {
  if (!auth.enabled) return null;
  const cookie = readCookie(req, AUTH_COOKIE_NAME);
  if (!cookie) return null;
  const payload = verifyPayload<{ user?: unknown; expiresAt?: unknown }>(
    cookie,
    auth.sessionSecret,
  );
  if (!payload || typeof payload.expiresAt !== 'number' || payload.expiresAt < Date.now()) {
    return null;
  }
  return normalizeAuthUser(payload.user);
}

function normalizeAuthUser(value: unknown): AuthUser | null {
  if (!isPlainObject(value)) return null;
  const id = textValue(value.id);
  if (!id) return null;
  const email = textValue(value.email);
  const role = value.role === 'admin' ? 'admin' : 'user';
  return {
    id,
    email,
    name: textValue(value.name) || email || id,
    avatarUrl: textValue(value.avatarUrl) || undefined,
    role,
  };
}

function signPayload(value: unknown, secret: string): string {
  const body = Buffer.from(JSON.stringify(value)).toString('base64url');
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verifyPayload<T>(token: string, secret: string): T | null {
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = createHmac('sha256', secret).update(body).digest('base64url');
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

function readCookie(req: IncomingMessage, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (rawName === name) {
      return decodeURIComponent(rawValue.join('='));
    }
  }
  return null;
}

function setCookie(
  res: ServerResponse,
  name: string,
  value: string,
  maxAgeSeconds: number,
): void {
  appendSetCookie(
    res,
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`,
  );
}

function clearCookie(res: ServerResponse, name: string): void {
  appendSetCookie(res, `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function appendSetCookie(res: ServerResponse, cookie: string): void {
  const current = res.getHeader('set-cookie');
  if (!current) {
    res.setHeader('set-cookie', cookie);
    return;
  }
  res.setHeader(
    'set-cookie',
    Array.isArray(current) ? [...current, cookie] : [String(current), cookie],
  );
}

function redirectToApp(
  res: ServerResponse,
  config: PlatformApiConfig,
  path: string,
): void {
  const target = new URL(normalizeAppRedirect(path), config.appBaseUrl);
  res.writeHead(302, { location: target.toString() });
  res.end();
}

function normalizeAppRedirect(path: string | undefined): string {
  if (!path || path.startsWith('//') || /^[a-z]+:\/\//i.test(path)) {
    return '/market';
  }
  return path.startsWith('/') ? path : `/${path}`;
}

export function createPlatformApiServer(config = loadConfig()): ReturnType<typeof createServer> {
  const db = createDocumentDatabase(config.databaseUrl);
  const store = new EvaluationStore(new JsonDocumentStore(db, 'evaluations'));
  const skillStore = new SkillStore(new JsonDocumentStore(db, 'skills'));
  const skillFileStore = new SkillFileStore(
    new JsonDocumentStore(db, 'skill-files'),
    skillStore,
  );
  const gitConfigStore = new GitConfigStore(new JsonDocumentStore(db, 'git-config'));
  const sourceStore = new SourceStore(new JsonDocumentStore(db, 'sources'));
  const sourceSkillCatalog = new SourceBackedSkillCatalog(sourceStore);
  const uploadStore = new PackageUploadStore(
    new JsonDocumentStore(db, 'uploads'),
    config.uploadDir,
  );
  const notificationStore = new NotificationStore(new JsonDocumentStore(db, 'notifications'));
  const favoriteStore = new FavoriteStore(new JsonDocumentStore(db, 'favorites'));
  const searchHistoryStore = new SearchHistoryStore(new JsonDocumentStore(db, 'search-history'));

  const server = createServer((req, res) => {
    void handleRequest(
      req,
      res,
      config,
      store,
      skillStore,
      sourceSkillCatalog,
      skillFileStore,
      gitConfigStore,
      sourceStore,
      uploadStore,
      notificationStore,
      favoriteStore,
      searchHistoryStore,
    );
  });
  server.once('close', () => {
    void db.close();
  });
  return server;
}

export async function startPlatformApiServer(
  config = loadConfig(),
): Promise<ReturnType<typeof createServer>> {
  const server = createPlatformApiServer(config);
  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(config.port, config.host, () => {
      server.off('error', rejectPromise);
      resolvePromise();
    });
  });
  return server;
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: PlatformApiConfig,
  store: EvaluationStore,
  skillStore: SkillStore,
  sourceSkillCatalog: SourceBackedSkillCatalog,
  skillFileStore: SkillFileStore,
  gitConfigStore: GitConfigStore,
  sourceStore: SourceStore,
  uploadStore: PackageUploadStore,
  notificationStore: NotificationStore,
  favoriteStore: FavoriteStore,
  searchHistoryStore: SearchHistoryStore,
): Promise<void> {
  applyCors(req, res, config);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const url = requestUrl(req, config);
    const pathname = normalizeResourcePath(url.pathname);

    if (req.method === 'GET' && (pathname === '/health' || pathname === '/api/health')) {
      sendJson(res, 200, {
        ok: true,
        service: '@suit-skills/server',
        dataFile: config.dataFile,
        skillsFile: config.skillsFile,
        gitConfigFile: config.gitConfigFile,
        sourcesFile: config.sourcesFile,
        uploadsFile: config.uploadsFile,
        uploadDir: config.uploadDir,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/auth/config') {
      sendJson(res, 200, {
        enabled: config.auth.enabled,
        mode: config.auth.mode,
        scopes: config.auth.scopes,
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/auth/login') {
      handleOAuthLogin(res, config, url.searchParams.get('redirect') ?? undefined);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/auth/login') {
      await handleOAuthPasswordLogin(req, res, config);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/auth/callback') {
      await handleOAuthCallback(req, res, config, url);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/auth/me') {
      const user = readSessionUser(req, config.auth);
      if (!user) {
        sendJson(res, 401, errorBody('UNAUTHENTICATED', 'Not logged in'));
        return;
      }
      sendJson(res, 200, { user });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/auth/logout') {
      clearCookie(res, AUTH_COOKIE_NAME);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (config.auth.enabled && pathname.startsWith('/api/')) {
      const user = readSessionUser(req, config.auth);
      if (!user) {
        sendJson(res, 401, errorBody('UNAUTHENTICATED', 'Not logged in'));
        return;
      }
    }

    if (req.method === 'GET' && pathname === '/api/uploads') {
      sendJson(res, 200, await uploadStore.list(parseUploadQuery(url)));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/uploads/parse') {
      const form = await readMultipartBody(req);
      const file = form.files[0];
      if (!file) {
        throw new ApiError(400, 'MISSING_FILE', 'Upload package file is required');
      }
      sendJson(res, 201, await uploadStore.parsePackage(file, form.fields.owner ?? 'current-user'));
      return;
    }

    const uploadMatch = pathname.match(/^\/api\/uploads\/([^/]+)$/);
    if (req.method === 'PATCH' && uploadMatch) {
      const record = await uploadStore.updateMetadata(
        decodeURIComponent(uploadMatch[1]!),
        await readJsonBody(req),
      );
      if (!record) {
        sendJson(res, 404, errorBody('NOT_FOUND', 'Upload record not found'));
        return;
      }
      sendJson(res, 200, record);
      return;
    }

    const submitUploadMatch = pathname.match(/^\/api\/uploads\/([^/]+)\/submit$/);
    if (req.method === 'POST' && submitUploadMatch) {
      const record = await uploadStore.submit(decodeURIComponent(submitUploadMatch[1]!));
      if (!record) {
        sendJson(res, 404, errorBody('NOT_FOUND', 'Upload record not found'));
        return;
      }
      sendJson(res, 200, record);
      return;
    }

    const approveUploadMatch = pathname.match(/^\/api\/uploads\/([^/]+)\/approve$/);
    if (req.method === 'POST' && approveUploadMatch) {
      const record = await uploadStore.publish(
        decodeURIComponent(approveUploadMatch[1]!),
        sourceStore,
        skillStore,
      );
      if (!record) {
        sendJson(res, 404, errorBody('NOT_FOUND', 'Upload record not found'));
        return;
      }
      sendJson(res, 200, record);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/sources') {
      sendJson(res, 200, await sourceStore.list());
      return;
    }

    if (req.method === 'POST' && pathname === '/api/sources') {
      sendJson(res, 201, await sourceStore.create(await readJsonBody(req)));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/sources/restore-builtins') {
      sendJson(res, 200, await sourceStore.restoreBuiltins());
      return;
    }

    const sourceMatch = pathname.match(/^\/api\/sources\/([^/]+)$/);
    if (req.method === 'PATCH' && sourceMatch) {
      sendJson(
        res,
        200,
        await sourceStore.update(
          decodeURIComponent(sourceMatch[1]!),
          await readJsonBody(req),
        ),
      );
      return;
    }

    if (req.method === 'DELETE' && sourceMatch) {
      sendJson(res, 200, await sourceStore.remove(decodeURIComponent(sourceMatch[1]!)));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/skills') {
      sendJson(res, 200, await sourceSkillCatalog.list(parseSkillQuery(url)));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/skills/upload') {
      sendJson(res, 201, await skillStore.upload(await readJsonBody(req)));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/my-skills') {
      const owner = url.searchParams.get('owner') ?? 'platform';
      sendJson(res, 200, await skillStore.list({ owner }));
      return;
    }

    const skillMatch = pathname.match(/^\/api\/skills\/([^/]+)$/);
    if (req.method === 'GET' && skillMatch) {
      const record = await sourceSkillCatalog.get(decodeURIComponent(skillMatch[1]!));
      if (!record) {
        sendJson(res, 404, errorBody('NOT_FOUND', 'Skill not found'));
        return;
      }
      sendJson(res, 200, record);
      return;
    }

    const skillFilesMatch = pathname.match(/^\/api\/skills\/([^/]+)\/files$/);
    if (req.method === 'GET' && skillFilesMatch) {
      const record = await sourceSkillCatalog.listFiles(
        decodeURIComponent(skillFilesMatch[1]!),
        url.searchParams.get('path') ?? undefined,
      );
      if (!record) {
        sendJson(res, 404, errorBody('NOT_FOUND', 'Skill not found'));
        return;
      }
      sendJson(res, 200, record);
      return;
    }

    const skillFileContentMatch = pathname.match(/^\/api\/skills\/([^/]+)\/files\/content$/);
    if (skillFileContentMatch && req.method === 'GET') {
      const file = await sourceSkillCatalog.getFile(
        decodeURIComponent(skillFileContentMatch[1]!),
        url.searchParams.get('path') ?? '',
      );
      if (!file) {
        sendJson(res, 404, errorBody('NOT_FOUND', 'Skill file not found'));
        return;
      }
      sendJson(res, 200, file);
      return;
    }

    const skillFilePathMatch = pathname.match(/^\/api\/skills\/([^/]+)\/files\/(.+)$/);
    if (skillFilePathMatch && req.method === 'GET') {
      const file = await sourceSkillCatalog.getFile(
        decodeURIComponent(skillFilePathMatch[1]!),
        decodeURIComponent(skillFilePathMatch[2]!),
      );
      if (!file) {
        sendJson(res, 404, errorBody('NOT_FOUND', 'Skill file not found'));
        return;
      }
      sendJson(res, 200, file);
      return;
    }

    if (skillFileContentMatch && req.method === 'PUT') {
      const body = await readJsonBody(req);
      if (!isPlainObject(body)) {
        throw new ApiError(400, 'INVALID_BODY', 'Request body must be a JSON object');
      }
      const file = await skillFileStore.writeFile(
        decodeURIComponent(skillFileContentMatch[1]!),
        requiredString(body.path, 'path'),
        requiredString(body.content, 'content'),
      );
      if (!file) {
        sendJson(res, 404, errorBody('NOT_FOUND', 'Skill file not found'));
        return;
      }
      sendJson(res, 200, file);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/git/config') {
      sendJson(res, 200, await gitConfigStore.get());
      return;
    }

    if (req.method === 'PUT' && pathname === '/api/git/config') {
      sendJson(res, 200, await gitConfigStore.update(await readJsonBody(req)));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/git/test') {
      sendJson(res, 200, await gitConfigStore.test());
      return;
    }

    if (req.method === 'POST' && pathname === '/api/evaluations') {
      const record = await store.create(await readJsonBody(req));
      sendJson(res, 201, record);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/evaluations') {
      sendJson(res, 200, await store.list(parseListQuery(url)));
      return;
    }

    const statusMatch = pathname.match(/^\/api\/evaluations\/([^/]+)\/status$/);
    if (req.method === 'PATCH' && statusMatch) {
      const status = parseStatusInput(await readJsonBody(req));
      const record = await store.updateStatus(decodeURIComponent(statusMatch[1]!), status);
      if (!record) {
        sendJson(res, 404, errorBody('NOT_FOUND', 'Evaluation not found'));
        return;
      }
      sendJson(res, 200, record);
      return;
    }

    const detailMatch = pathname.match(/^\/api\/evaluations\/([^/]+)$/);
    if (req.method === 'GET' && detailMatch) {
      const record = await store.get(decodeURIComponent(detailMatch[1]!));
      if (!record) {
        sendJson(res, 404, errorBody('NOT_FOUND', 'Evaluation not found'));
        return;
      }
      sendJson(res, 200, record);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/notifications') {
      const user = readSessionUser(req, config.auth);
      if (!user) {
        sendJson(res, 401, errorBody('UNAUTHENTICATED', 'Not logged in'));
        return;
      }
      const params = parseNotificationListQuery(url, user.id);
      const response = await notificationStore.list(params);
      sendJson(res, 200, response);
      return;
    }

    const notificationMatch = pathname.match(/^\/api\/notifications\/([^/]+)$/);
    if (req.method === 'GET' && notificationMatch) {
      const record = await notificationStore.get(decodeURIComponent(notificationMatch[1]!));
      if (!record) {
        sendJson(res, 404, errorBody('NOT_FOUND', 'Notification not found'));
        return;
      }
      sendJson(res, 200, record);
      return;
    }

    const readMatch = pathname.match(/^\/api\/notifications\/([^/]+)\/read$/);
    if (req.method === 'PUT' && readMatch) {
      const body = await readJsonBody(req);
      const isRead = typeof body === 'object' && body !== null && 'isRead' in body
        ? Boolean(body.isRead)
        : true;
      const record = await notificationStore.updateRead(
        decodeURIComponent(readMatch[1]!),
        isRead,
      );
      if (!record) {
        sendJson(res, 404, errorBody('NOT_FOUND', 'Notification not found'));
        return;
      }
      sendJson(res, 200, record);
      return;
    }

    if (req.method === 'PUT' && pathname === '/api/notifications/batch/read') {
      const body = await readJsonBody(req);
      if (!isPlainObject(body)) {
        throw new ApiError(400, 'INVALID_BODY', 'Request body must be a JSON object');
      }
      const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === 'string') : [];
      const isRead = typeof body.isRead === 'boolean' ? body.isRead : true;
      const count = await notificationStore.batchUpdateRead(ids, isRead);
      sendJson(res, 200, { count });
      return;
    }

    if (req.method === 'DELETE' && notificationMatch) {
      const deleted = await notificationStore.delete(decodeURIComponent(notificationMatch[1]!));
      if (!deleted) {
        sendJson(res, 404, errorBody('NOT_FOUND', 'Notification not found'));
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/notifications/unread-count') {
      const user = readSessionUser(req, config.auth);
      if (!user) {
        sendJson(res, 401, errorBody('UNAUTHENTICATED', 'Not logged in'));
        return;
      }
      const result = await notificationStore.getUnreadCount(user.id);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/favorites') {
      const user = readSessionUser(req, config.auth);
      if (!user) {
        sendJson(res, 401, errorBody('UNAUTHENTICATED', 'Not logged in'));
        return;
      }
      const params = parseFavoriteListQuery(url, user.id);
      const response = await favoriteStore.list(params);
      sendJson(res, 200, response);
      return;
    }

    const favoriteMatch = pathname.match(/^\/api\/favorites\/([^/]+)$/);
    if (req.method === 'POST' && favoriteMatch) {
      const user = readSessionUser(req, config.auth);
      if (!user) {
        sendJson(res, 401, errorBody('UNAUTHENTICATED', 'Not logged in'));
        return;
      }
      const skillId = decodeURIComponent(favoriteMatch[1]!);
      const record = await favoriteStore.create(user.id, skillId);
      sendJson(res, 201, record);
      return;
    }

    if (req.method === 'DELETE' && favoriteMatch) {
      const user = readSessionUser(req, config.auth);
      if (!user) {
        sendJson(res, 401, errorBody('UNAUTHENTICATED', 'Not logged in'));
        return;
      }
      const skillId = decodeURIComponent(favoriteMatch[1]!);
      const deleted = await favoriteStore.delete(user.id, skillId);
      if (!deleted) {
        sendJson(res, 404, errorBody('NOT_FOUND', 'Favorite not found'));
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    const checkFavoriteMatch = pathname.match(/^\/api\/favorites\/check\/([^/]+)$/);
    if (req.method === 'GET' && checkFavoriteMatch) {
      const user = readSessionUser(req, config.auth);
      if (!user) {
        sendJson(res, 401, errorBody('UNAUTHENTICATED', 'Not logged in'));
        return;
      }
      const skillId = decodeURIComponent(checkFavoriteMatch[1]!);
      const isFavorited = await favoriteStore.isFavorited(user.id, skillId);
      sendJson(res, 200, { isFavorited });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/search-history') {
      const user = readSessionUser(req, config.auth);
      if (!user) {
        sendJson(res, 401, errorBody('UNAUTHENTICATED', 'Not logged in'));
        return;
      }
      const params = parseSearchHistoryListQuery(url, user.id);
      const response = await searchHistoryStore.list(params);
      sendJson(res, 200, response);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/search-history') {
      const user = readSessionUser(req, config.auth);
      if (!user) {
        sendJson(res, 401, errorBody('UNAUTHENTICATED', 'Not logged in'));
        return;
      }
      const body = await readJsonBody(req);
      if (!isPlainObject(body)) {
        throw new ApiError(400, 'INVALID_BODY', 'Request body must be a JSON object');
      }
      const query = requiredString(body.query, 'query');
      const record = await searchHistoryStore.create(user.id, query);
      sendJson(res, 201, record);
      return;
    }

    const searchHistoryMatch = pathname.match(/^\/api\/search-history\/([^/]+)$/);
    if (req.method === 'DELETE' && searchHistoryMatch) {
      const user = readSessionUser(req, config.auth);
      if (!user) {
        sendJson(res, 401, errorBody('UNAUTHENTICATED', 'Not logged in'));
        return;
      }
      const deleted = await searchHistoryStore.delete(decodeURIComponent(searchHistoryMatch[1]!));
      if (!deleted) {
        sendJson(res, 404, errorBody('NOT_FOUND', 'Search history record not found'));
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'DELETE' && pathname === '/api/search-history') {
      const user = readSessionUser(req, config.auth);
      if (!user) {
        sendJson(res, 401, errorBody('UNAUTHENTICATED', 'Not logged in'));
        return;
      }
      const count = await searchHistoryStore.clear(user.id);
      sendJson(res, 200, { count });
      return;
    }

    sendJson(res, 404, errorBody('NOT_FOUND', 'API route not found'));
  } catch (error) {
    if (error instanceof ApiError) {
      sendJson(res, error.status, errorBody(error.code, error.message));
      return;
    }

    const message = error instanceof Error ? error.message : 'Unexpected server error';
    sendJson(res, 500, errorBody('INTERNAL_ERROR', message));
  }
}

function parseEvaluationInput(input: unknown): Omit<
  EvaluationRecord,
  'id' | 'status' | 'createdAt' | 'updatedAt'
> {
  if (!isPlainObject(input)) {
    throw new ApiError(400, 'INVALID_BODY', 'Request body must be a JSON object');
  }

  const skillId = requiredString(input.skillId, 'skillId');
  const rating = optionalRating(input.rating);

  return compactObject({
    skillId,
    skillName: optionalString(input.skillName, 'skillName'),
    version: optionalString(input.version, 'version'),
    rating,
    title: optionalString(input.title, 'title'),
    comment: optionalString(input.comment, 'comment'),
    reviewer: parseReviewer(input.reviewer),
    metadata: parseMetadata(input.metadata),
  });
}

function parseReviewer(value: unknown): EvaluationReviewer | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) {
    throw new ApiError(400, 'INVALID_REVIEWER', 'reviewer must be an object');
  }

  return compactObject({
    name: optionalString(value.name, 'reviewer.name'),
    email: optionalString(value.email, 'reviewer.email'),
  });
}

function parseMetadata(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) {
    throw new ApiError(400, 'INVALID_METADATA', 'metadata must be an object');
  }
  return value;
}

function parseStatusInput(input: unknown): EvaluationStatus {
  if (!isPlainObject(input)) {
    throw new ApiError(400, 'INVALID_BODY', 'Request body must be a JSON object');
  }

  const status = input.status;
  if (typeof status !== 'string' || !VALID_STATUSES.has(status as EvaluationStatus)) {
    throw new ApiError(
      400,
      'INVALID_STATUS',
      'status must be one of: submitted, reviewing, approved, rejected, archived',
    );
  }

  return status as EvaluationStatus;
}

function parseListQuery(url: URL): {
  status?: EvaluationStatus;
  skillId?: string;
  limit: number;
  offset: number;
} {
  const statusText = url.searchParams.get('status') ?? undefined;
  const status =
    statusText && VALID_STATUSES.has(statusText as EvaluationStatus)
      ? (statusText as EvaluationStatus)
      : undefined;

  if (statusText && !status) {
    throw new ApiError(
      400,
      'INVALID_STATUS',
      'status must be one of: submitted, reviewing, approved, rejected, archived',
    );
  }

  return {
    status,
    skillId: url.searchParams.get('skillId') ?? undefined,
    limit: parseIntegerQuery(url, 'limit', 50, 1, 200),
    offset: parseIntegerQuery(url, 'offset', 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

function parseSkillQuery(url: URL): {
  q?: string;
  category?: string;
  source?: string;
  owner?: string;
} {
  return compactObject({
    q: optionalQueryString(url, 'q'),
    category: optionalQueryString(url, 'category'),
    source: optionalQueryString(url, 'source'),
    owner: optionalQueryString(url, 'owner'),
  });
}

function parseUploadQuery(url: URL): {
  owner?: string;
  status?: PackageUploadStatus;
} {
  const status = optionalQueryString(url, 'status');
  return compactObject({
    owner: optionalQueryString(url, 'owner'),
    status:
      status === 'parsed' ||
      status === 'waiting_review' ||
      status === 'rejected' ||
      status === 'publishing' ||
      status === 'published' ||
      status === 'publish_failed'
        ? status
        : undefined,
  });
}

function optionalQueryString(url: URL, name: string): string | undefined {
  const value = url.searchParams.get(name);
  return value && value.trim() ? value.trim() : undefined;
}

function parseIntegerQuery(
  url: URL,
  name: string,
  defaultValue: number,
  min: number,
  max: number,
): number {
  const raw = url.searchParams.get(name);
  if (raw === null) return defaultValue;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ApiError(400, 'INVALID_QUERY', `${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiError(400, 'INVALID_FIELD', `${name} is required`);
  }
  return value.trim();
}

function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new ApiError(400, 'INVALID_FIELD', `${name} must be a string`);
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalRating(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1 || value > 5) {
    throw new ApiError(400, 'INVALID_FIELD', 'rating must be a number from 1 to 5');
  }
  return value;
}

function parseSkillInput(input: unknown): Omit<
  SkillRecord,
  'id' | 'installs' | 'rating' | 'reviews' | 'status' | 'command' | 'updatedAt' | 'uploadStatus'
> &
  Partial<Pick<SkillRecord, 'id' | 'installs' | 'rating' | 'reviews' | 'status' | 'command' | 'updatedAt' | 'uploadStatus'>> {
  if (!isPlainObject(input)) {
    throw new ApiError(400, 'INVALID_BODY', 'Request body must be a JSON object');
  }

  const tags = input.tags;
  if (tags !== undefined && !Array.isArray(tags)) {
    throw new ApiError(400, 'INVALID_FIELD', 'tags must be an array');
  }

  return compactObject({
    name: requiredString(input.name, 'name'),
    description: requiredString(input.description, 'description'),
    author: optionalString(input.author, 'author') ?? 'Current user',
    source: optionalString(input.source, 'source') ?? 'default',
    category: optionalString(input.category, 'category') ?? 'custom',
    version: optionalString(input.version, 'version') ?? '0.1.0',
    tags: Array.isArray(tags)
      ? tags.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
      : [],
    owner: optionalString(input.owner, 'owner') ?? 'current-user',
    gitUrl: optionalString(input.gitUrl, 'gitUrl'),
    packageFileName: optionalString(input.packageFileName, 'packageFileName'),
  });
}

function parseSourceInput(input: unknown): Pick<
  SourceRecord,
  'name' | 'label' | 'description' | 'url' | 'branch' | 'skillsDirectory' | 'publishEnabled'
> {
  if (!isPlainObject(input)) {
    throw new ApiError(400, 'INVALID_BODY', 'Request body must be a JSON object');
  }

  const name = requiredString(input.name, 'name');
  if (!/^[a-z0-9][a-z0-9-_.]*$/i.test(name)) {
    throw new ApiError(
      400,
      'INVALID_SOURCE_NAME',
      'Source name can only contain letters, numbers, hyphen, underscore, and dot',
    );
  }

  return {
    name,
    label: optionalString(input.label, 'label') ?? name,
    description: optionalString(input.description, 'description') ?? 'Custom platform skill source.',
    url: optionalString(input.url, 'url'),
    branch: optionalString(input.branch, 'branch') ?? 'main',
    skillsDirectory: optionalString(input.skillsDirectory, 'skillsDirectory') ?? 'skills/',
    publishEnabled: input.publishEnabled === true,
  };
}

function parseSourcePatch(input: unknown): Partial<
  Pick<
    SourceRecord,
    | 'label'
    | 'description'
    | 'enabled'
    | 'url'
    | 'branch'
    | 'skillsDirectory'
    | 'publishEnabled'
    | 'domesticMirror'
  >
> {
  if (!isPlainObject(input)) {
    throw new ApiError(400, 'INVALID_BODY', 'Request body must be a JSON object');
  }

  const enabled = input.enabled;
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    throw new ApiError(400, 'INVALID_FIELD', 'enabled must be a boolean');
  }
  const publishEnabled = input.publishEnabled;
  if (publishEnabled !== undefined && typeof publishEnabled !== 'boolean') {
    throw new ApiError(400, 'INVALID_FIELD', 'publishEnabled must be a boolean');
  }
  const domesticMirror = input.domesticMirror;
  if (
    domesticMirror !== undefined &&
    (!isPlainObject(domesticMirror) ||
      (domesticMirror.enabled !== undefined && typeof domesticMirror.enabled !== 'boolean'))
  ) {
    throw new ApiError(400, 'INVALID_FIELD', 'domesticMirror.enabled must be a boolean');
  }

  return compactObject({
    label: optionalString(input.label, 'label'),
    description: optionalString(input.description, 'description'),
    url: optionalString(input.url, 'url'),
    branch: optionalString(input.branch, 'branch'),
    skillsDirectory: optionalString(input.skillsDirectory, 'skillsDirectory'),
    publishEnabled,
    domesticMirror:
      isPlainObject(domesticMirror) && typeof domesticMirror.enabled === 'boolean'
        ? { url: '', enabled: domesticMirror.enabled }
        : undefined,
    enabled,
  });
}

async function extractSkillPackage(file: UploadedFile, outDir: string): Promise<void> {
  const lowerName = file.fileName.toLowerCase();
  if (lowerName.endsWith('.zip')) {
    const zip = new AdmZip(file.content);
    const outRoot = resolve(outDir);
    for (const entry of zip.getEntries()) {
      const target = resolve(outRoot, normalize(entry.entryName));
      if (target !== outRoot && !target.startsWith(`${outRoot}${sep}`)) {
        throw new ApiError(400, 'UNSAFE_ZIP_ENTRY', 'Zip package contains an unsafe path');
      }
      if (entry.isDirectory) {
        await mkdir(target, { recursive: true });
        continue;
      }
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, entry.getData());
    }
    return;
  }

  throw new ApiError(400, 'UNSUPPORTED_PACKAGE', 'Only .zip packages are supported');
}

async function parseExtractedSkill(rootDir: string): Promise<ParsedSkillPackage> {
  const files = await listFiles(rootDir);
  const skillFilePath = files.find((file) => basename(file).toUpperCase() === 'SKILL.MD');
  const skillMarkdown = skillFilePath ? await readFile(skillFilePath, 'utf8') : '';
  const frontmatter = parseFrontmatter(skillMarkdown);
  const markdownTitle = skillMarkdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  let totalBytes = 0;
  for (const file of files) {
    totalBytes += (await stat(file)).size;
  }
  return {
    rootDir,
    skillFilePath,
    frontmatter,
    markdownTitle,
    fileCount: files.length,
    totalBytes,
  };
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function hasSourceSkillEntry(skillDir: string): boolean {
  return existsSync(join(skillDir, 'SKILL.md')) || existsSync(join(skillDir, 'meta.json'));
}

function isIgnoredSourceDirectory(name: string): boolean {
  return (
    name === '.git' ||
    name === 'node_modules' ||
    name === 'dist' ||
    name === 'build' ||
    name === 'coverage' ||
    name === '.next' ||
    name === '.turbo' ||
    name === '.cache'
  );
}

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function parseFrontmatter(markdown: string): Record<string, unknown> | undefined {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return undefined;
  const result: Record<string, unknown> = {};
  let currentArrayKey = '';
  for (const rawLine of match[1]!.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;
    const arrayMatch = line.match(/^\s*-\s+(.+)$/);
    if (arrayMatch && currentArrayKey) {
      const current = Array.isArray(result[currentArrayKey])
        ? (result[currentArrayKey] as string[])
        : [];
      current.push(stripYamlValue(arrayMatch[1]!));
      result[currentArrayKey] = current;
      continue;
    }
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!pair) continue;
    const key = pair[1]!;
    const value = pair[2]!.trim();
    if (value === '') {
      currentArrayKey = key;
      result[key] = [];
    } else {
      currentArrayKey = '';
      result[key] = stripYamlValue(value);
    }
  }
  return result;
}

function stripYamlValue(value: string): string {
  return value.replace(/^['"]|['"]$/g, '').trim();
}

function buildSkillRecord(parsed: ParsedSkillPackage, owner: string): SkillRecord {
  const frontmatter = parsed.frontmatter ?? {};
  const name =
    textValue(frontmatter.name) ||
    parsed.markdownTitle ||
    basename(parsed.rootDir);
  const description =
    textValue(frontmatter.description) ||
    'Uploaded skill package';
  const tags = normalizeStringArray(frontmatter.tags);
  const now = new Date().toISOString();
  return {
    id: `skill-${slugify(name) || randomUUID()}`,
    name,
    description,
    author: textValue(frontmatter.author) || owner,
    source: textValue(frontmatter.source) || 'default',
    category: textValue(frontmatter.category) || 'custom',
    version: textValue(frontmatter.version) || '0.1.0',
    installs: 0,
    rating: 0,
    reviews: 0,
    status: 'review',
    tags,
    command: `npx suit-skills@latest install ${name}`,
    updatedAt: now,
    owner,
    uploadStatus: 'waiting_publish',
  };
}

function validatePackage(
  metadata: SkillRecord,
  parsed: ParsedSkillPackage,
): PackageValidationItem[] {
  const items: PackageValidationItem[] = [];
  if (!parsed.skillFilePath) {
    items.push({
      code: 'MISSING_SKILL_MD',
      message: 'Package must include SKILL.md',
      severity: 'error',
    });
  }
  if (!metadata.name.trim()) {
    items.push({
      code: 'MISSING_NAME',
      message: 'Skill name is required',
      severity: 'error',
    });
  }
  if (!parsed.frontmatter || Object.keys(parsed.frontmatter).length === 0) {
    items.push({
      code: 'MISSING_FRONTMATTER',
      message: 'SKILL.md should include frontmatter metadata',
      severity: 'warning',
    });
  }
  if (!/^[a-z0-9][a-z0-9-_.]*$/i.test(metadata.name)) {
    items.push({
      code: 'INVALID_NAME',
      message: 'Skill name can only contain letters, numbers, hyphen, underscore, and dot',
      severity: 'error',
    });
  }
  items.push({
    code: 'PACKAGE_SIZE',
    message: `${parsed.fileCount} files, ${parsed.totalBytes} bytes parsed`,
    severity: 'info',
  });
  return items;
}

async function publishPackageToSource(
  record: PackageUploadRecord,
  source: SourceRecord,
): Promise<string> {
  const repoUrl = source.url?.trim() ?? '';
  if (!repoUrl) {
    throw new ApiError(400, 'MISSING_SOURCE_URL', 'Source Git URL is required before publishing');
  }
  const workDir = resolve(dirname(record.originalFilePath), '..', 'git-worktree');
  await rm(workDir, { recursive: true, force: true });
  await execGit(['clone', repoUrl, workDir], process.cwd());

  if (source.branch) {
    await execGit(['checkout', source.branch], workDir).catch(() => undefined);
  }
  await execGit(['config', 'user.email', 'platform@example.local'], workDir);
  await execGit(['config', 'user.name', 'Suit Skills Platform'], workDir);

  const skillsDir = source.skillsDirectory || 'skills';
  const targetDir = resolve(workDir, skillsDir, record.metadata.name);
  const workRoot = resolve(workDir);
  if (!targetDir.startsWith(`${workRoot}${sep}`)) {
    throw new ApiError(400, 'INVALID_SKILLS_DIRECTORY', 'skillsDirectory resolves outside repository');
  }
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(dirname(targetDir), { recursive: true });
  await cp(record.packageDir, targetDir, { recursive: true });

  await execGit(['add', skillsDir], workDir);
  const status = await execGit(['status', '--porcelain'], workDir);
  if (status.trim()) {
    await execGit(['commit', '-m', `Publish skill ${record.metadata.name}`], workDir);
  }
  const commit = (await execGit(['rev-parse', 'HEAD'], workDir)).trim();

  if (!isLocalGitUrl(repoUrl) || repoUrl.endsWith('.git')) {
    await execGit(['push', 'origin', source.branch || 'HEAD'], workDir);
  }
  return commit;
}

async function execGit(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd });
  return stdout;
}

function isLocalGitUrl(value: string): boolean {
  return !/^([a-z]+:\/\/|git@)/i.test(value);
}

function textValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function numberValue(value: unknown): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(textValue)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sanitizeFileName(value: string): string {
  return basename(value).replace(/[^a-z0-9._-]/gi, '_') || 'package.zip';
}

function parseGitConfig(input: unknown, fallback: GitConfig): GitConfig {
  if (!isPlainObject(input)) return fallback;
  const publishStrategy = input.publishStrategy;
  const authType = input.authType;
  const lastTestStatus = input.lastTestStatus;

  return {
    loggedIn: typeof input.loggedIn === 'boolean' ? input.loggedIn : fallback.loggedIn,
    userName: optionalString(input.userName, 'userName') ?? fallback.userName,
    email: optionalString(input.email, 'email') ?? fallback.email,
    defaultGitUrl:
      optionalString(input.defaultGitUrl, 'defaultGitUrl') ?? fallback.defaultGitUrl,
    defaultBranch:
      optionalString(input.defaultBranch, 'defaultBranch') ?? fallback.defaultBranch,
    skillsDirectory:
      optionalString(input.skillsDirectory, 'skillsDirectory') ?? fallback.skillsDirectory,
    publishStrategy:
      publishStrategy === 'direct' ||
      publishStrategy === 'pull_request' ||
      publishStrategy === 'review'
        ? publishStrategy
        : fallback.publishStrategy,
    authType:
      authType === 'none' || authType === 'ssh' || authType === 'token'
        ? authType
        : fallback.authType,
    lastTestAt: optionalString(input.lastTestAt, 'lastTestAt') ?? fallback.lastTestAt,
    lastTestStatus:
      lastTestStatus === 'untested' ||
      lastTestStatus === 'success' ||
      lastTestStatus === 'failed'
        ? lastTestStatus
        : fallback.lastTestStatus,
  };
}

function defaultSkillFiles(skill: SkillRecord): SkillFileRecord[] {
  const now = skill.updatedAt || new Date().toISOString();
  return [
    {
      path: 'SKILL.md',
      content: [
        '---',
        `name: ${skill.name}`,
        `description: ${skill.description}`,
        `version: ${skill.version}`,
        '---',
        '',
        `# ${skill.name}`,
        '',
        skill.description,
        '',
        '## Usage',
        '',
        `Install with \`${skill.command}\`.`,
        '',
        '## Tags',
        '',
        skill.tags.map((tag) => `- ${tag}`).join('\n') || '- custom',
        '',
      ].join('\n'),
      updatedAt: now,
    },
    {
      path: 'meta.json',
      content: `${JSON.stringify(
        {
          name: skill.name,
          description: skill.description,
          version: skill.version,
          author: skill.author,
          tags: skill.tags,
        },
        null,
        2,
      )}\n`,
      updatedAt: now,
    },
    {
      path: 'examples/basic.md',
      content: `# ${skill.name} example\n\nDescribe a common workflow for this skill here.\n`,
      updatedAt: now,
    },
  ];
}

function normalizeSkillFilePath(value: unknown): string {
  const textValue = requiredString(value, 'path').replace(/\\/g, '/');
  const normalizedPath = normalize(textValue).replace(/\\/g, '/').replace(/^\/+/, '');
  if (
    normalizedPath === '' ||
    normalizedPath === '.' ||
    normalizedPath.startsWith('../') ||
    normalizedPath.includes('/../') ||
    normalizedPath.includes('\0')
  ) {
    throw new ApiError(400, 'INVALID_PATH', 'path must stay inside the skill package');
  }
  return normalizedPath;
}

function buildFileTree(files: SkillFileRecord[]): SkillFileEntry {
  const root: SkillFileEntry = {
    path: '',
    name: 'skill package',
    type: 'directory',
    children: [],
  };

  for (const file of files) {
    const segments = file.path.split('/').filter(Boolean);
    let cursor = root;
    segments.forEach((segment, index) => {
      const isFile = index === segments.length - 1;
      cursor.children ??= [];
      let child = cursor.children.find((item) => item.name === segment);
      if (!child) {
        const childPath = segments.slice(0, index + 1).join('/');
        child = isFile
          ? {
              path: childPath,
              name: segment,
              type: 'file',
              size: Buffer.byteLength(file.content, 'utf8'),
              updatedAt: file.updatedAt,
            }
          : {
              path: childPath,
              name: segment,
              type: 'directory',
              children: [],
            };
        cursor.children.push(child);
      }
      cursor = child;
    });
  }

  sortFileTree(root);
  return root;
}

function sortFileTree(entry: SkillFileEntry): void {
  entry.children?.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  entry.children?.forEach(sortFileTree);
}

function fileDetail(file: SkillFileRecord): SkillFileDetail {
  return {
    path: file.path,
    name: basename(file.path),
    type: 'file',
    content: file.content,
    language: languageForPath(file.path),
    size: Buffer.byteLength(file.content, 'utf8'),
    updatedAt: file.updatedAt,
    editable: isEditableSkillFile(file.path),
  };
}

function languageForPath(path: string): string {
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.md') || path.endsWith('.mdx')) return 'markdown';
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript';
  if (path.endsWith('.js') || path.endsWith('.jsx')) return 'javascript';
  if (path.endsWith('.yml') || path.endsWith('.yaml')) return 'yaml';
  return 'text';
}

function isEditableSkillFile(path: string): boolean {
  return !/\.(png|jpe?g|gif|webp|zip|pdf|docx|xlsx)$/i.test(path);
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}

function isEvaluationRecord(value: unknown): value is EvaluationRecord {
  return (
    isPlainObject(value) &&
    typeof value.id === 'string' &&
    typeof value.skillId === 'string' &&
    typeof value.status === 'string' &&
    VALID_STATUSES.has(value.status as EvaluationStatus) &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  );
}

function isSkillRecord(value: unknown): value is SkillRecord {
  return (
    isPlainObject(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.description === 'string' &&
    typeof value.author === 'string' &&
    typeof value.source === 'string' &&
    typeof value.category === 'string' &&
    typeof value.version === 'string' &&
    typeof value.installs === 'number' &&
    typeof value.rating === 'number' &&
    typeof value.reviews === 'number' &&
    typeof value.status === 'string' &&
    (value.status === 'verified' || value.status === 'review' || value.status === 'new') &&
    Array.isArray(value.tags) &&
    typeof value.command === 'string' &&
    typeof value.updatedAt === 'string'
  );
}

function isSkillFileRecord(value: unknown): value is SkillFileRecord {
  return (
    isPlainObject(value) &&
    typeof value.path === 'string' &&
    typeof value.content === 'string' &&
    typeof value.updatedAt === 'string'
  );
}

function isSourceRecord(value: unknown): value is SourceRecord {
  return (
    isPlainObject(value) &&
    typeof value.name === 'string' &&
    typeof value.label === 'string' &&
    typeof value.description === 'string' &&
    (value.url === undefined || typeof value.url === 'string') &&
    (value.branch === undefined || typeof value.branch === 'string') &&
    (value.skillsDirectory === undefined || typeof value.skillsDirectory === 'string') &&
    (value.publishEnabled === undefined || typeof value.publishEnabled === 'boolean') &&
    (value.domesticMirror === undefined ||
      (isPlainObject(value.domesticMirror) &&
        typeof value.domesticMirror.url === 'string' &&
        typeof value.domesticMirror.enabled === 'boolean')) &&
    typeof value.enabled === 'boolean'
  );
}

function isPackageUploadRecord(value: unknown): value is PackageUploadRecord {
  return (
    isPlainObject(value) &&
    typeof value.id === 'string' &&
    typeof value.fileName === 'string' &&
    typeof value.packageDir === 'string' &&
    typeof value.originalFilePath === 'string' &&
    typeof value.owner === 'string' &&
    typeof value.status === 'string' &&
    (value.status === 'parsed' ||
      value.status === 'waiting_review' ||
      value.status === 'rejected' ||
      value.status === 'publishing' ||
      value.status === 'published' ||
      value.status === 'publish_failed') &&
    isSkillRecord(value.metadata) &&
    Array.isArray(value.validation) &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  );
}

function isNotificationRecord(value: unknown): value is NotificationRecord {
  return (
    isPlainObject(value) &&
    typeof value.id === 'string' &&
    typeof value.userId === 'string' &&
    typeof value.type === 'string' &&
    (value.type === 'skill_reviewed' ||
      value.type === 'skill_status_changed' ||
      value.type === 'skill_comment' ||
      value.type === 'system') &&
    typeof value.title === 'string' &&
    typeof value.message === 'string' &&
    typeof value.isRead === 'boolean' &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  );
}

function parseNotificationInput(input: unknown): Omit<
  NotificationRecord,
  'id' | 'isRead' | 'createdAt' | 'updatedAt'
> {
  if (!isPlainObject(input)) {
    throw new ApiError(400, 'INVALID_BODY', 'Request body must be a JSON object');
  }

  const userId = requiredString(input.userId, 'userId');
  const type = requiredString(input.type, 'type');
  const title = requiredString(input.title, 'title');
  const message = requiredString(input.message, 'message');

  if (type !== 'skill_reviewed' && type !== 'skill_status_changed' && type !== 'skill_comment' && type !== 'system') {
    throw new ApiError(
      400,
      'INVALID_TYPE',
      'type must be one of: skill_reviewed, skill_status_changed, skill_comment, system',
    );
  }

  return compactObject({
    userId,
    type: type as NotificationType,
    title,
    message,
    relatedSkillId: optionalString(input.relatedSkillId, 'relatedSkillId'),
    relatedSkillName: optionalString(input.relatedSkillName, 'relatedSkillName'),
    relatedReviewId: optionalString(input.relatedReviewId, 'relatedReviewId'),
    actionUrl: optionalString(input.actionUrl, 'actionUrl'),
  });
}

function parseNotificationListQuery(url: URL, userId: string): {
  userId: string;
  page: number;
  pageSize: number;
  type?: NotificationType;
  unreadOnly?: boolean;
} {
  const typeParam = optionalQueryString(url, 'type');
  const type =
    typeParam === 'skill_reviewed' ||
    typeParam === 'skill_status_changed' ||
    typeParam === 'skill_comment' ||
    typeParam === 'system'
      ? (typeParam as NotificationType)
      : undefined;

  return {
    userId,
    page: parseIntegerQuery(url, 'page', 1, 1, Number.MAX_SAFE_INTEGER),
    pageSize: parseIntegerQuery(url, 'pageSize', 20, 1, 100),
    type,
    unreadOnly: url.searchParams.get('unreadOnly') === 'true',
  };
}

function isFavoriteRecord(value: unknown): value is FavoriteRecord {
  return (
    isPlainObject(value) &&
    typeof value.id === 'string' &&
    typeof value.userId === 'string' &&
    typeof value.skillId === 'string' &&
    typeof value.createdAt === 'string'
  );
}

function parseFavoriteListQuery(url: URL, userId: string): {
  userId: string;
  page: number;
  pageSize: number;
} {
  return {
    userId,
    page: parseIntegerQuery(url, 'page', 1, 1, Number.MAX_SAFE_INTEGER),
    pageSize: parseIntegerQuery(url, 'pageSize', 20, 1, 100),
  };
}

function isSearchHistoryRecord(value: unknown): value is SearchHistoryRecord {
  return (
    isPlainObject(value) &&
    typeof value.id === 'string' &&
    typeof value.userId === 'string' &&
    typeof value.query === 'string' &&
    typeof value.createdAt === 'string'
  );
}

function parseSearchHistoryListQuery(url: URL, userId: string): {
  userId: string;
  limit: number;
} {
  return {
    userId,
    limit: parseIntegerQuery(url, 'limit', 10, 1, 100),
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function isDirectRun(): boolean {
  if (!process.argv[1]) return false;
  return resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  const config = loadConfig();
  const server = await startPlatformApiServer(config);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : config.port;
  console.log(`Platform API listening on http://${config.host}:${port}`);
  console.log(`Database: ${config.databaseUrl}`);
}
