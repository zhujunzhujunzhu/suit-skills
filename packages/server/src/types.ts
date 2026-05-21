export interface ServerPackageInfo {
  name: '@suit-skills/server';
  purpose: 'private-platform-api';
}

export type EvaluationStatus =
  | 'submitted'
  | 'reviewing'
  | 'approved'
  | 'rejected'
  | 'archived';

export interface EvaluationReviewer {
  name?: string;
  email?: string;
}

export interface EvaluationRecord {
  id: string;
  skillId: string;
  skillName?: string;
  version?: string;
  rating?: number;
  title?: string;
  comment?: string;
  reviewer?: EvaluationReviewer;
  status: EvaluationStatus;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface EvaluationListResponse {
  items: EvaluationRecord[];
  total: number;
  limit: number;
  offset: number;
}

export type SkillStatus = 'verified' | 'review' | 'new';
export type UploadStatus = 'draft' | 'validating' | 'validated' | 'waiting_publish' | 'published';
export type PackageUploadStatus =
  | 'parsed'
  | 'waiting_review'
  | 'rejected'
  | 'publishing'
  | 'published'
  | 'publish_failed';

export interface SkillRecord {
  id: string;
  name: string;
  description: string;
  author: string;
  source: string;
  category: string;
  version: string;
  installs: number;
  rating: number;
  reviews: number;
  status: SkillStatus;
  tags: string[];
  command: string;
  updatedAt: string;
  owner?: string;
  uploadStatus?: UploadStatus;
  gitUrl?: string;
  packageFileName?: string;
}

export interface SkillListResponse {
  items: SkillRecord[];
  total: number;
}

export interface SkillFileEntry {
  path: string;
  name: string;
  type: 'file' | 'directory';
  size?: number;
  updatedAt?: string;
  children?: SkillFileEntry[];
}

export interface SkillFileDetail {
  path: string;
  name: string;
  type: 'file';
  content: string;
  language: string;
  size: number;
  updatedAt: string;
  editable: boolean;
}

export interface SkillFilesResponse {
  root: SkillFileEntry;
  selectedFile?: SkillFileDetail;
}

export interface PackageValidationItem {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

export interface PackageUploadRecord {
  id: string;
  fileName: string;
  packageDir: string;
  originalFilePath: string;
  owner: string;
  status: PackageUploadStatus;
  metadata: SkillRecord;
  validation: PackageValidationItem[];
  publishedCommit?: string;
  publishError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PackageUploadListResponse {
  items: PackageUploadRecord[];
  total: number;
}

export interface GitConfig {
  loggedIn: boolean;
  userName: string;
  email: string;
  defaultGitUrl: string;
  defaultBranch: string;
  skillsDirectory: string;
  publishStrategy: 'direct' | 'pull_request' | 'review';
  authType: 'none' | 'ssh' | 'token';
  lastTestAt?: string;
  lastTestStatus?: 'untested' | 'success' | 'failed';
}

export interface SourceRecord {
  name: string;
  label: string;
  description: string;
  url?: string;
  branch?: string;
  skillsDirectory?: string;
  publishEnabled?: boolean;
  domesticMirror?: {
    url: string;
    enabled: boolean;
  };
  effectiveUrl?: string;
  enabled: boolean;
  default: boolean;
  builtin?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SourcesResponse {
  sources: SourceRecord[];
  defaultSources: string[];
}

export interface PlatformApiConfig {
  host: string;
  port: number;
  dataFile: string;
  skillsFile: string;
  gitConfigFile: string;
  sourcesFile: string;
  uploadsFile: string;
  uploadDir: string;
  databaseUrl: string;
  corsOrigins: string[];
  appBaseUrl: string;
  auth: OAuthConfig;
}

export interface OAuthConfig {
  enabled: boolean;
  mode: 'oauth' | 'local';
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  redirectUri: string;
  scopes: string[];
  sessionSecret: string;
  adminEmails: string[];
  adminDomains: string[];
  bootstrapPassword?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: 'user' | 'admin';
}

export interface PlatformUserRecord extends AuthUser {
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
  passwordUpdatedAt?: string;
  hasPassword: boolean;
}

export interface PlatformUserListResponse {
  items: PlatformUserRecord[];
  total: number;
}

export interface EvaluationStoreData {
  version: 1;
  evaluations: EvaluationRecord[];
}

export interface SkillStoreData {
  version: 1;
  skills: SkillRecord[];
}

export interface SkillFileRecord {
  path: string;
  content: string;
  updatedAt: string;
}

export interface SkillFileStoreData {
  version: 1;
  skills: Record<string, SkillFileRecord[]>;
}

export interface SourceStoreData {
  version: 1;
  sources: SourceRecord[];
}

export interface PackageUploadStoreData {
  version: 1;
  uploads: PackageUploadRecord[];
}

export interface ParsedSkillPackage {
  rootDir: string;
  skillFilePath?: string;
  frontmatter?: Record<string, unknown>;
  markdownTitle?: string;
  fileCount: number;
  totalBytes: number;
}

export type NotificationType = 'skill_reviewed' | 'skill_status_changed' | 'skill_comment' | 'system';

export interface NotificationRecord {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedSkillId?: string;
  relatedSkillName?: string;
  relatedReviewId?: string;
  isRead: boolean;
  actionUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationListResponse {
  data: NotificationRecord[];
  total: number;
  page: number;
  pageSize: number;
  unreadCount: number;
}

export interface NotificationStoreData {
  version: 1;
  notifications: NotificationRecord[];
}

export interface FavoriteRecord {
  id: string;
  userId: string;
  skillId: string;
  createdAt: string;
}

export interface FavoriteListResponse {
  items: FavoriteRecord[];
  total: number;
}

export interface FavoriteStoreData {
  version: 1;
  favorites: FavoriteRecord[];
}

export interface SearchHistoryRecord {
  id: string;
  userId: string;
  query: string;
  createdAt: string;
}

export interface SearchHistoryListResponse {
  items: SearchHistoryRecord[];
  total: number;
}

export interface SearchHistoryStoreData {
  version: 1;
  searchHistory: SearchHistoryRecord[];
}
