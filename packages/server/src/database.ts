import {
  createPool,
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from 'mysql2/promise';
import type {
  EvaluationRecord,
  EvaluationStoreData,
  GitConfig,
  PackageUploadRecord,
  PackageUploadStoreData,
  SkillFileRecord,
  SkillFileStoreData,
  SkillRecord,
  SkillStoreData,
  SourceRecord,
  SourceStoreData,
  AuthUser,
} from './types.js';

type Queryable = Pool | PoolConnection;
type DbRow = RowDataPacket & Record<string, unknown>;

export interface DocumentDatabase {
  readDocument(collection: string): Promise<string | null>;
  writeDocument(collection: string, value: string): Promise<void>;
  listAuthUsers(): Promise<AuthUserRecord[]>;
  findAuthUserByEmail(email: string): Promise<AuthUserRecord | null>;
  findAuthUserById(id: string): Promise<AuthUserRecord | null>;
  upsertAuthUser(input: UpsertAuthUserInput): Promise<AuthUserRecord>;
  deleteAuthUser(id: string): Promise<boolean>;
  createAuthSession(input: AuthSessionInput): Promise<void>;
  findAuthSession(sessionId: string): Promise<AuthSessionRecord | null>;
  deleteAuthSession(sessionId: string): Promise<void>;
  deleteExpiredAuthSessions(nowIso: string): Promise<void>;
  close(): Promise<void>;
}

export interface AuthUserRecord extends AuthUser {
  passwordHash?: string;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
  passwordUpdatedAt?: string;
}

export interface UpsertAuthUserInput extends AuthUser {
  passwordHash?: string;
  disabled?: boolean;
}

export interface AuthSessionInput {
  id: string;
  userId: string;
  expiresAt: string;
}

export interface AuthSessionRecord {
  id: string;
  user: AuthUserRecord;
  expiresAt: string;
  createdAt: string;
}

export function createDocumentDatabase(databaseUrl: string): DocumentDatabase {
  if (databaseUrl.startsWith('sqlite://')) {
    return new MemoryPlatformDatabase();
  }
  return new MySqlPlatformDatabase(databaseUrl);
}

export class JsonDocumentStore<T> {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly database: DocumentDatabase,
    private readonly collection: string,
  ) {}

  async read(fallback: T): Promise<T> {
    const stored = await this.database.readDocument(this.collection);
    if (stored === null) {
      await this.write(fallback);
      return fallback;
    }
    return JSON.parse(stored) as T;
  }

  async write(value: T): Promise<void> {
    const writeTask = this.writeQueue.then(() =>
      this.database.writeDocument(this.collection, JSON.stringify(value, null, 2)),
    );
    this.writeQueue = writeTask.catch(() => undefined);
    await writeTask;
  }
}

class MySqlPlatformDatabase implements DocumentDatabase {
  private readonly pool: Pool;
  private readonly ready: Promise<void>;

  constructor(databaseUrl: string) {
    const config = parseDatabaseUrl(databaseUrl);
    this.pool = createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 10,
      charset: 'utf8mb4',
      timezone: 'Z',
    });
    this.ready = ensureDatabase(config).then(() => this.migrate());
  }

  async readDocument(collection: string): Promise<string | null> {
    await this.ready;
    switch (collection) {
      case 'evaluations':
        return stringifyStore(await this.readEvaluations(this.pool));
      case 'skills':
        return stringifyStore(await this.readSkills(this.pool));
      case 'skill-files':
        return stringifyStore(await this.readSkillFiles(this.pool));
      case 'git-config':
        return stringifyStore(await this.readGitConfig(this.pool));
      case 'sources':
        return stringifyStore(await this.readSources(this.pool));
      case 'uploads':
        return stringifyStore(await this.readUploads(this.pool));
      default:
        return null;
    }
  }

  async writeDocument(collection: string, value: string): Promise<void> {
    await this.ready;
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      switch (collection) {
        case 'evaluations':
          await this.writeEvaluations(connection, JSON.parse(value) as EvaluationStoreData);
          break;
        case 'skills':
          await this.writeSkills(connection, JSON.parse(value) as SkillStoreData);
          break;
        case 'skill-files':
          await this.writeSkillFiles(connection, JSON.parse(value) as SkillFileStoreData);
          break;
        case 'git-config':
          await this.writeGitConfig(connection, JSON.parse(value) as GitConfig);
          break;
        case 'sources':
          await this.writeSources(connection, JSON.parse(value) as SourceStoreData);
          break;
        case 'uploads':
          await this.writeUploads(connection, JSON.parse(value) as PackageUploadStoreData);
          break;
        default:
          throw new Error(`Unknown platform store: ${collection}`);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async close(): Promise<void> {
    await this.ready.catch(() => undefined);
    await this.pool.end();
  }

  private async migrate(): Promise<void> {
    await this.renameTableIfNeeded('platform_skills', 'platform_published_skills');

    const statements = [
      `CREATE TABLE IF NOT EXISTS platform_schema_migrations (
        version INT PRIMARY KEY,
        applied_at VARCHAR(64) NOT NULL
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS platform_users (
        id VARCHAR(191) PRIMARY KEY,
        email VARCHAR(320) NOT NULL UNIQUE,
        name VARCHAR(191) NOT NULL,
        avatar_url TEXT,
        password_hash TEXT,
        password_updated_at VARCHAR(64),
        disabled TINYINT(1) NOT NULL DEFAULT 0,
        role ENUM('user', 'admin') NOT NULL,
        created_at VARCHAR(64) NOT NULL,
        updated_at VARCHAR(64) NOT NULL
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS platform_sessions (
        id VARCHAR(191) PRIMARY KEY,
        user_id VARCHAR(191) NOT NULL,
        expires_at VARCHAR(64) NOT NULL,
        created_at VARCHAR(64) NOT NULL,
        INDEX idx_platform_sessions_user_id (user_id),
        INDEX idx_platform_sessions_expires_at (expires_at),
        CONSTRAINT fk_platform_sessions_user_id
          FOREIGN KEY (user_id) REFERENCES platform_users(id) ON DELETE CASCADE
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS platform_sources (
        name VARCHAR(191) PRIMARY KEY,
        label VARCHAR(191) NOT NULL,
        description TEXT NOT NULL,
        url TEXT,
        branch VARCHAR(191),
        skills_directory TEXT,
        publish_enabled TINYINT(1) NOT NULL DEFAULT 0,
        domestic_mirror_json JSON,
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        is_default TINYINT(1) NOT NULL DEFAULT 0,
        created_at VARCHAR(64),
        updated_at VARCHAR(64)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS platform_published_skills (
        id VARCHAR(191) PRIMARY KEY,
        name VARCHAR(191) NOT NULL,
        description TEXT NOT NULL,
        author VARCHAR(191) NOT NULL,
        source VARCHAR(191) NOT NULL,
        category VARCHAR(191) NOT NULL,
        version VARCHAR(64) NOT NULL,
        installs INT NOT NULL DEFAULT 0,
        rating DOUBLE NOT NULL DEFAULT 0,
        reviews INT NOT NULL DEFAULT 0,
        status ENUM('verified', 'review', 'new') NOT NULL,
        command TEXT NOT NULL,
        owner VARCHAR(191),
        upload_status ENUM('draft', 'validating', 'validated', 'waiting_publish', 'published'),
        git_url TEXT,
        package_file_name TEXT,
        updated_at VARCHAR(64) NOT NULL
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS platform_skill_tags (
        skill_id VARCHAR(191) NOT NULL,
        tag VARCHAR(191) NOT NULL,
        position INT NOT NULL,
        PRIMARY KEY (skill_id, tag),
        CONSTRAINT fk_platform_skill_tags_skill_id
          FOREIGN KEY (skill_id) REFERENCES platform_published_skills(id) ON DELETE CASCADE
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS platform_skill_files (
        skill_id VARCHAR(191) NOT NULL,
        path VARCHAR(512) NOT NULL,
        content MEDIUMTEXT NOT NULL,
        updated_at VARCHAR(64) NOT NULL,
        PRIMARY KEY (skill_id, path),
        CONSTRAINT fk_platform_skill_files_skill_id
          FOREIGN KEY (skill_id) REFERENCES platform_published_skills(id) ON DELETE CASCADE
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS platform_evaluations (
        id VARCHAR(191) PRIMARY KEY,
        skill_id VARCHAR(191) NOT NULL,
        skill_name VARCHAR(191),
        version VARCHAR(64),
        rating DOUBLE,
        title TEXT,
        comment TEXT,
        reviewer_json JSON,
        status ENUM('submitted', 'reviewing', 'approved', 'rejected', 'archived') NOT NULL,
        metadata_json JSON,
        created_at VARCHAR(64) NOT NULL,
        updated_at VARCHAR(64) NOT NULL,
        INDEX idx_platform_evaluations_skill_id (skill_id),
        INDEX idx_platform_evaluations_status (status)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS platform_git_config (
        id INT PRIMARY KEY,
        logged_in TINYINT(1) NOT NULL,
        user_name VARCHAR(191) NOT NULL,
        email VARCHAR(320) NOT NULL,
        default_git_url TEXT NOT NULL,
        default_branch VARCHAR(191) NOT NULL,
        skills_directory TEXT NOT NULL,
        publish_strategy ENUM('direct', 'pull_request', 'review') NOT NULL,
        auth_type ENUM('none', 'ssh', 'token') NOT NULL,
        last_test_at VARCHAR(64),
        last_test_status ENUM('untested', 'success', 'failed')
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS platform_package_uploads (
        id VARCHAR(191) PRIMARY KEY,
        file_name VARCHAR(255) NOT NULL,
        package_dir TEXT NOT NULL,
        original_file_path TEXT NOT NULL,
        owner VARCHAR(191) NOT NULL,
        status ENUM('parsed', 'waiting_review', 'rejected', 'publishing', 'published', 'publish_failed') NOT NULL,
        metadata_skill_id VARCHAR(191) NOT NULL,
        published_commit VARCHAR(191),
        publish_error TEXT,
        created_at VARCHAR(64) NOT NULL,
        updated_at VARCHAR(64) NOT NULL
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS platform_upload_metadata (
        upload_id VARCHAR(191) PRIMARY KEY,
        skill_id VARCHAR(191) NOT NULL,
        name VARCHAR(191) NOT NULL,
        description TEXT NOT NULL,
        author VARCHAR(191) NOT NULL,
        source VARCHAR(191) NOT NULL,
        category VARCHAR(191) NOT NULL,
        version VARCHAR(64) NOT NULL,
        installs INT NOT NULL DEFAULT 0,
        rating DOUBLE NOT NULL DEFAULT 0,
        reviews INT NOT NULL DEFAULT 0,
        status ENUM('verified', 'review', 'new') NOT NULL,
        command TEXT NOT NULL,
        owner VARCHAR(191),
        upload_status ENUM('draft', 'validating', 'validated', 'waiting_publish', 'published'),
        git_url TEXT,
        package_file_name TEXT,
        updated_at VARCHAR(64) NOT NULL,
        CONSTRAINT fk_platform_upload_metadata_upload_id
          FOREIGN KEY (upload_id) REFERENCES platform_package_uploads(id) ON DELETE CASCADE
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS platform_upload_validation (
        upload_id VARCHAR(191) NOT NULL,
        code VARCHAR(191) NOT NULL,
        message TEXT NOT NULL,
        severity ENUM('info', 'warning', 'error') NOT NULL,
        position INT NOT NULL,
        PRIMARY KEY (upload_id, position),
        CONSTRAINT fk_platform_upload_validation_upload_id
          FOREIGN KEY (upload_id) REFERENCES platform_package_uploads(id) ON DELETE CASCADE
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS platform_upload_metadata_tags (
        upload_id VARCHAR(191) NOT NULL,
        tag VARCHAR(191) NOT NULL,
        position INT NOT NULL,
        PRIMARY KEY (upload_id, tag),
        CONSTRAINT fk_platform_upload_metadata_tags_upload_id
          FOREIGN KEY (upload_id) REFERENCES platform_package_uploads(id) ON DELETE CASCADE
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    ];

    for (const statement of statements) {
      await this.pool.execute(statement);
    }

    await this.addColumnIfMissing('platform_sources', 'url', 'TEXT');
    await this.addColumnIfMissing('platform_sources', 'branch', 'VARCHAR(191)');
    await this.addColumnIfMissing('platform_sources', 'skills_directory', 'TEXT');
    await this.addColumnIfMissing('platform_sources', 'publish_enabled', 'TINYINT(1) NOT NULL DEFAULT 0');
    await this.addColumnIfMissing('platform_sources', 'domestic_mirror_json', 'JSON');
    await this.addColumnIfMissing('platform_users', 'password_hash', 'TEXT');
    await this.addColumnIfMissing('platform_users', 'password_updated_at', 'VARCHAR(64)');
    await this.addColumnIfMissing('platform_users', 'disabled', 'TINYINT(1) NOT NULL DEFAULT 0');
    await this.migrateLegacyDocuments();
    await this.pool.execute(
      `INSERT IGNORE INTO platform_schema_migrations (version, applied_at) VALUES (?, ?)`,
      [1, new Date().toISOString()],
    );
  }

  async findAuthUserByEmail(email: string): Promise<AuthUserRecord | null> {
    await this.ready;
    const rows = await rowsOf(
      this.pool,
      `SELECT * FROM platform_users WHERE email = ? LIMIT 1`,
      [email.toLowerCase()],
    );
    return rows[0] ? authUserFromRow(rows[0]) : null;
  }

  async listAuthUsers(): Promise<AuthUserRecord[]> {
    await this.ready;
    const rows = await rowsOf(
      this.pool,
      `SELECT * FROM platform_users ORDER BY created_at DESC, email ASC`,
    );
    return rows.map(authUserFromRow);
  }

  async findAuthUserById(id: string): Promise<AuthUserRecord | null> {
    await this.ready;
    const rows = await rowsOf(
      this.pool,
      `SELECT * FROM platform_users WHERE id = ? LIMIT 1`,
      [id],
    );
    return rows[0] ? authUserFromRow(rows[0]) : null;
  }

  async upsertAuthUser(input: UpsertAuthUserInput): Promise<AuthUserRecord> {
    await this.ready;
    const existing = await this.findAuthUserByEmail(input.email);
    const now = new Date().toISOString();
    const id = existing?.id ?? input.id;
    const passwordHash = input.passwordHash ?? existing?.passwordHash ?? null;
    const passwordUpdatedAt =
      input.passwordHash && input.passwordHash !== existing?.passwordHash
        ? now
        : existing?.passwordUpdatedAt ?? null;
    const disabled = input.disabled ?? existing?.disabled ?? false;

    await this.pool.execute(
      `INSERT INTO platform_users
        (id, email, name, avatar_url, password_hash, password_updated_at, disabled, role, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          avatar_url = VALUES(avatar_url),
          password_hash = VALUES(password_hash),
          password_updated_at = VALUES(password_updated_at),
          disabled = VALUES(disabled),
          role = VALUES(role),
          updated_at = VALUES(updated_at)`,
      [
        id,
        input.email.toLowerCase(),
        input.name,
        input.avatarUrl ?? null,
        passwordHash,
        passwordUpdatedAt,
        disabled ? 1 : 0,
        input.role,
        existing?.createdAt ?? now,
        now,
      ],
    );

    const user = await this.findAuthUserById(id);
    if (!user) throw new Error(`Failed to load auth user after upsert: ${id}`);
    return user;
  }

  async deleteAuthUser(id: string): Promise<boolean> {
    await this.ready;
    const [result] = await this.pool.execute<ResultSetHeader>(
      `DELETE FROM platform_users WHERE id = ?`,
      [id],
    );
    return result.affectedRows > 0;
  }

  async createAuthSession(input: AuthSessionInput): Promise<void> {
    await this.ready;
    await this.deleteExpiredAuthSessions(new Date().toISOString());
    await this.pool.execute(
      `INSERT INTO platform_sessions (id, user_id, expires_at, created_at)
       VALUES (?, ?, ?, ?)`,
      [input.id, input.userId, input.expiresAt, new Date().toISOString()],
    );
  }

  async findAuthSession(sessionId: string): Promise<AuthSessionRecord | null> {
    await this.ready;
    const rows = await rowsOf(
      this.pool,
      `SELECT
          s.id AS session_id,
          s.expires_at,
          s.created_at AS session_created_at,
          u.*
        FROM platform_sessions s
        INNER JOIN platform_users u ON u.id = s.user_id
        WHERE s.id = ?
        LIMIT 1`,
      [sessionId],
    );
    const row = rows[0];
    if (!row) return null;
    const user = authUserFromRow(row);
    return {
      id: text(row.session_id),
      user,
      expiresAt: text(row.expires_at),
      createdAt: text(row.session_created_at),
    };
  }

  async deleteAuthSession(sessionId: string): Promise<void> {
    await this.ready;
    await this.pool.execute(`DELETE FROM platform_sessions WHERE id = ?`, [sessionId]);
  }

  async deleteExpiredAuthSessions(nowIso: string): Promise<void> {
    await this.ready;
    await this.pool.execute(`DELETE FROM platform_sessions WHERE expires_at <= ?`, [nowIso]);
  }

  private async migrateLegacyDocuments(): Promise<void> {
    const legacyTables = await rowsOf(
      this.pool,
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = DATABASE()
         AND table_name = 'platform_documents'
       LIMIT 1`,
    );
    if (legacyTables.length === 0) return;

    const documents = await rowsOf(this.pool, `SELECT collection, value FROM platform_documents`);
    for (const row of documents) {
      const collection = text(row.collection);
      const value = jsonText(row.value);
      if (!value) continue;

      if (collection === 'evaluations' && (await this.tableIsEmpty('platform_evaluations'))) {
        await this.writeEvaluations(this.pool, JSON.parse(value) as EvaluationStoreData);
      } else if (collection === 'skills' && (await this.tableIsEmpty('platform_published_skills'))) {
        await this.writeSkills(this.pool, JSON.parse(value) as SkillStoreData);
      } else if (collection === 'skill-files' && (await this.tableIsEmpty('platform_skill_files'))) {
        await this.writeSkillFiles(this.pool, JSON.parse(value) as SkillFileStoreData);
      } else if (collection === 'git-config' && (await this.tableIsEmpty('platform_git_config'))) {
        await this.writeGitConfig(this.pool, JSON.parse(value) as GitConfig);
      } else if (collection === 'sources' && (await this.tableIsEmpty('platform_sources'))) {
        await this.writeSources(this.pool, JSON.parse(value) as SourceStoreData);
      } else if (collection === 'uploads' && (await this.tableIsEmpty('platform_package_uploads'))) {
        await this.writeUploads(this.pool, JSON.parse(value) as PackageUploadStoreData);
      }
    }

    await this.pool.execute(`DROP TABLE IF EXISTS platform_documents`);
  }

  private async tableIsEmpty(table: string): Promise<boolean> {
    const rows = await rowsOf(this.pool, `SELECT COUNT(*) AS count_value FROM ${mysqlIdentifier(table)}`);
    return number(rows[0]?.count_value) === 0;
  }

  private async renameTableIfNeeded(oldName: string, newName: string): Promise<void> {
    const [oldExists, newExists] = await Promise.all([
      this.tableExists(oldName),
      this.tableExists(newName),
    ]);
    if (oldExists && !newExists) {
      await this.pool.execute(`RENAME TABLE ${mysqlIdentifier(oldName)} TO ${mysqlIdentifier(newName)}`);
    }
  }

  private async tableExists(table: string): Promise<boolean> {
    const rows = await rowsOf(
      this.pool,
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = DATABASE()
         AND table_name = ?
       LIMIT 1`,
      [table],
    );
    return rows.length > 0;
  }

  private async addColumnIfMissing(table: string, column: string, definition: string): Promise<void> {
    const rows = await rowsOf(
      this.pool,
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = ?
         AND column_name = ?
       LIMIT 1`,
      [table, column],
    );
    if (rows.length === 0) {
      await this.pool.execute(`ALTER TABLE ${mysqlIdentifier(table)} ADD COLUMN ${mysqlIdentifier(column)} ${definition}`);
    }
  }

  private async readEvaluations(db: Queryable): Promise<EvaluationStoreData | null> {
    const rows = await rowsOf(db, `SELECT * FROM platform_evaluations ORDER BY created_at DESC`);
    if (rows.length === 0) return null;
    return {
      version: 1,
      evaluations: rows.map((row) => ({
        id: text(row.id),
        skillId: text(row.skill_id),
        skillName: optionalText(row.skill_name),
        version: optionalText(row.version),
        rating: optionalNumber(row.rating),
        title: optionalText(row.title),
        comment: optionalText(row.comment),
        reviewer: parseJson(row.reviewer_json),
        status: text(row.status) as EvaluationRecord['status'],
        metadata: parseJson(row.metadata_json),
        createdAt: text(row.created_at),
        updatedAt: text(row.updated_at),
      })),
    };
  }

  private async writeEvaluations(db: Queryable, data: EvaluationStoreData): Promise<void> {
    await db.execute(`DELETE FROM platform_evaluations`);
    for (const item of data.evaluations) {
      await db.execute(
        `INSERT INTO platform_evaluations
          (id, skill_id, skill_name, version, rating, title, comment, reviewer_json, status, metadata_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id,
          item.skillId,
          item.skillName ?? null,
          item.version ?? null,
          item.rating ?? null,
          item.title ?? null,
          item.comment ?? null,
          stringifyJson(item.reviewer),
          item.status,
          stringifyJson(item.metadata),
          item.createdAt,
          item.updatedAt,
        ],
      );
    }
  }

  private async readSkills(db: Queryable): Promise<SkillStoreData | null> {
    const rows = await rowsOf(db, `SELECT * FROM platform_published_skills ORDER BY updated_at DESC`);
    if (rows.length === 0) return null;
    const skills = [];
    for (const row of rows) {
      const id = text(row.id);
      skills.push({
        id,
        name: text(row.name),
        description: text(row.description),
        author: text(row.author),
        source: text(row.source),
        category: text(row.category),
        version: text(row.version),
        installs: number(row.installs),
        rating: number(row.rating),
        reviews: number(row.reviews),
        status: text(row.status) as SkillRecord['status'],
        tags: await this.readSkillTags(db, id),
        command: text(row.command),
        updatedAt: text(row.updated_at),
        owner: optionalText(row.owner),
        uploadStatus: optionalText(row.upload_status) as SkillRecord['uploadStatus'],
        gitUrl: optionalText(row.git_url),
        packageFileName: optionalText(row.package_file_name),
      });
    }
    return { version: 1, skills };
  }

  private async writeSkills(db: Queryable, data: SkillStoreData): Promise<void> {
    await db.execute(`DELETE FROM platform_skill_tags`);
    await db.execute(`DELETE FROM platform_published_skills`);
    for (const item of data.skills) {
      await this.insertSkill(db, item);
    }
  }

  private async insertSkill(db: Queryable, item: SkillRecord): Promise<void> {
    await db.execute(
      `INSERT INTO platform_published_skills
        (id, name, description, author, source, category, version, installs, rating, reviews, status, command, owner, upload_status, git_url, package_file_name, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.name,
        item.description,
        item.author,
        item.source,
        item.category,
        item.version,
        item.installs,
        item.rating,
        item.reviews,
        item.status,
        item.command,
        item.owner ?? null,
        item.uploadStatus ?? null,
        item.gitUrl ?? null,
        item.packageFileName ?? null,
        item.updatedAt,
      ],
    );
    await this.writeSkillTags(db, item.id, item.tags);
  }

  private async readSkillFiles(db: Queryable): Promise<SkillFileStoreData | null> {
    const rows = await rowsOf(db, `SELECT * FROM platform_skill_files ORDER BY skill_id, path`);
    if (rows.length === 0) return null;
    const skills: Record<string, SkillFileRecord[]> = {};
    for (const row of rows) {
      const skillId = text(row.skill_id);
      skills[skillId] ??= [];
      skills[skillId]!.push({
        path: text(row.path),
        content: text(row.content),
        updatedAt: text(row.updated_at),
      });
    }
    return { version: 1, skills };
  }

  private async writeSkillFiles(db: Queryable, data: SkillFileStoreData): Promise<void> {
    await db.execute(`DELETE FROM platform_skill_files`);
    for (const [skillId, files] of Object.entries(data.skills)) {
      if ((await this.skillExists(db, skillId)) === false) continue;
      for (const file of files) {
        await db.execute(
          `INSERT INTO platform_skill_files (skill_id, path, content, updated_at) VALUES (?, ?, ?, ?)`,
          [skillId, file.path, file.content, file.updatedAt],
        );
      }
    }
  }

  private async readGitConfig(db: Queryable): Promise<GitConfig | null> {
    const rows = await rowsOf(db, `SELECT * FROM platform_git_config WHERE id = 1 LIMIT 1`);
    const row = rows[0];
    if (!row) return null;
    return {
      loggedIn: bool(row.logged_in),
      userName: text(row.user_name),
      email: text(row.email),
      defaultGitUrl: text(row.default_git_url),
      defaultBranch: text(row.default_branch),
      skillsDirectory: text(row.skills_directory),
      publishStrategy: text(row.publish_strategy) as GitConfig['publishStrategy'],
      authType: text(row.auth_type) as GitConfig['authType'],
      lastTestAt: optionalText(row.last_test_at),
      lastTestStatus: optionalText(row.last_test_status) as GitConfig['lastTestStatus'],
    };
  }

  private async writeGitConfig(db: Queryable, config: GitConfig): Promise<void> {
    await db.execute(
      `INSERT INTO platform_git_config
        (id, logged_in, user_name, email, default_git_url, default_branch, skills_directory, publish_strategy, auth_type, last_test_at, last_test_status)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          logged_in = VALUES(logged_in),
          user_name = VALUES(user_name),
          email = VALUES(email),
          default_git_url = VALUES(default_git_url),
          default_branch = VALUES(default_branch),
          skills_directory = VALUES(skills_directory),
          publish_strategy = VALUES(publish_strategy),
          auth_type = VALUES(auth_type),
          last_test_at = VALUES(last_test_at),
          last_test_status = VALUES(last_test_status)`,
      [
        config.loggedIn ? 1 : 0,
        config.userName,
        config.email,
        config.defaultGitUrl,
        config.defaultBranch,
        config.skillsDirectory,
        config.publishStrategy,
        config.authType,
        config.lastTestAt ?? null,
        config.lastTestStatus ?? null,
      ],
    );
  }

  private async readSources(db: Queryable): Promise<SourceStoreData | null> {
    const rows = await rowsOf(db, `SELECT * FROM platform_sources ORDER BY is_default DESC, name`);
    if (rows.length === 0) return null;
    return {
      version: 1,
      sources: rows.map((row) => ({
        name: text(row.name),
        label: text(row.label),
        description: text(row.description),
        url: optionalText(row.url),
        branch: optionalText(row.branch),
        skillsDirectory: optionalText(row.skills_directory),
        publishEnabled: bool(row.publish_enabled),
        domesticMirror: parseJson(row.domestic_mirror_json),
        enabled: bool(row.enabled),
        default: bool(row.is_default),
        builtin: false,
        createdAt: optionalText(row.created_at),
        updatedAt: optionalText(row.updated_at),
      })),
    };
  }

  private async writeSources(db: Queryable, data: SourceStoreData): Promise<void> {
    await db.execute(`DELETE FROM platform_sources`);
    for (const item of data.sources) {
      await db.execute(
        `INSERT INTO platform_sources
          (name, label, description, url, branch, skills_directory, publish_enabled, domestic_mirror_json, enabled, is_default, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.name,
          item.label,
          item.description,
          item.url ?? null,
          item.branch ?? null,
          item.skillsDirectory ?? null,
          item.publishEnabled ? 1 : 0,
          stringifyJson(item.domesticMirror),
          item.enabled ? 1 : 0,
          item.default ? 1 : 0,
          item.createdAt ?? null,
          item.updatedAt ?? null,
        ],
      );
    }
  }

  private async readUploads(db: Queryable): Promise<PackageUploadStoreData | null> {
    const rows = await rowsOf(db, `SELECT * FROM platform_package_uploads ORDER BY created_at DESC`);
    if (rows.length === 0) return null;
    const uploads = [];
    for (const row of rows) {
      const uploadId = text(row.id);
      uploads.push({
        id: uploadId,
        fileName: text(row.file_name),
        packageDir: text(row.package_dir),
        originalFilePath: text(row.original_file_path),
        owner: text(row.owner),
        status: text(row.status) as PackageUploadRecord['status'],
        metadata: await this.readUploadMetadata(db, uploadId),
        validation: await this.readUploadValidation(db, uploadId),
        publishedCommit: optionalText(row.published_commit),
        publishError: optionalText(row.publish_error),
        createdAt: text(row.created_at),
        updatedAt: text(row.updated_at),
      });
    }
    return { version: 1, uploads };
  }

  private async writeUploads(db: Queryable, data: PackageUploadStoreData): Promise<void> {
    await db.execute(`DELETE FROM platform_upload_metadata_tags`);
    await db.execute(`DELETE FROM platform_upload_validation`);
    await db.execute(`DELETE FROM platform_upload_metadata`);
    await db.execute(`DELETE FROM platform_package_uploads`);
    for (const item of data.uploads) {
      await this.insertUpload(db, item);
    }
  }

  private async insertUpload(db: Queryable, item: PackageUploadRecord): Promise<void> {
    await db.execute(
      `INSERT INTO platform_package_uploads
        (id, file_name, package_dir, original_file_path, owner, status, metadata_skill_id, published_commit, publish_error, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.fileName,
        item.packageDir,
        item.originalFilePath,
        item.owner,
        item.status,
        item.metadata.id,
        item.publishedCommit ?? null,
        item.publishError ?? null,
        item.createdAt,
        item.updatedAt,
      ],
    );
    await this.upsertUploadMetadata(db, item.id, item.metadata);
    for (const [index, entry] of item.validation.entries()) {
      await db.execute(
        `INSERT INTO platform_upload_validation (upload_id, code, message, severity, position) VALUES (?, ?, ?, ?, ?)`,
        [item.id, entry.code, entry.message, entry.severity, index],
      );
    }
  }

  private async upsertUploadMetadata(db: Queryable, uploadId: string, metadata: SkillRecord): Promise<void> {
    await db.execute(
      `INSERT INTO platform_upload_metadata
        (upload_id, skill_id, name, description, author, source, category, version, installs, rating, reviews, status, command, owner, upload_status, git_url, package_file_name, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          skill_id = VALUES(skill_id),
          name = VALUES(name),
          description = VALUES(description),
          author = VALUES(author),
          source = VALUES(source),
          category = VALUES(category),
          version = VALUES(version),
          installs = VALUES(installs),
          rating = VALUES(rating),
          reviews = VALUES(reviews),
          status = VALUES(status),
          command = VALUES(command),
          owner = VALUES(owner),
          upload_status = VALUES(upload_status),
          git_url = VALUES(git_url),
          package_file_name = VALUES(package_file_name),
          updated_at = VALUES(updated_at)`,
      [
        uploadId,
        metadata.id,
        metadata.name,
        metadata.description,
        metadata.author,
        metadata.source,
        metadata.category,
        metadata.version,
        metadata.installs,
        metadata.rating,
        metadata.reviews,
        metadata.status,
        metadata.command,
        metadata.owner ?? null,
        metadata.uploadStatus ?? null,
        metadata.gitUrl ?? null,
        metadata.packageFileName ?? null,
        metadata.updatedAt,
      ],
    );
    await db.execute(`DELETE FROM platform_upload_metadata_tags WHERE upload_id = ?`, [uploadId]);
    await this.writeUploadMetadataTags(db, uploadId, metadata.tags);
  }

  private async readUploadMetadata(db: Queryable, uploadId: string): Promise<SkillRecord> {
    const rows = await rowsOf(db, `SELECT * FROM platform_upload_metadata WHERE upload_id = ? LIMIT 1`, [uploadId]);
    const row = rows[0];
    if (!row) {
      throw new Error(`Upload metadata not found: ${uploadId}`);
    }
    return {
      id: text(row.skill_id),
      name: text(row.name),
      description: text(row.description),
      author: text(row.author),
      source: text(row.source),
      category: text(row.category),
      version: text(row.version),
      installs: number(row.installs),
      rating: number(row.rating),
      reviews: number(row.reviews),
      status: text(row.status) as SkillRecord['status'],
      tags: await this.readUploadMetadataTags(db, uploadId),
      command: text(row.command),
      updatedAt: text(row.updated_at),
      owner: optionalText(row.owner),
      uploadStatus: optionalText(row.upload_status) as SkillRecord['uploadStatus'],
      gitUrl: optionalText(row.git_url),
      packageFileName: optionalText(row.package_file_name),
    };
  }

  private async readUploadValidation(db: Queryable, uploadId: string): Promise<PackageUploadRecord['validation']> {
    const rows = await rowsOf(db, `SELECT * FROM platform_upload_validation WHERE upload_id = ? ORDER BY position`, [
      uploadId,
    ]);
    return rows.map((row) => ({
      code: text(row.code),
      message: text(row.message),
      severity: text(row.severity) as PackageUploadRecord['validation'][number]['severity'],
    }));
  }

  private async readSkillTags(db: Queryable, skillId: string): Promise<string[]> {
    const rows = await rowsOf(db, `SELECT tag FROM platform_skill_tags WHERE skill_id = ? ORDER BY position`, [skillId]);
    return rows.map((row) => text(row.tag));
  }

  private async writeSkillTags(db: Queryable, skillId: string, tags: string[]): Promise<void> {
    for (const [index, tag] of tags.entries()) {
      await db.execute(`INSERT INTO platform_skill_tags (skill_id, tag, position) VALUES (?, ?, ?)`, [
        skillId,
        tag,
        index,
      ]);
    }
  }

  private async readUploadMetadataTags(db: Queryable, uploadId: string): Promise<string[]> {
    const rows = await rowsOf(db, `SELECT tag FROM platform_upload_metadata_tags WHERE upload_id = ? ORDER BY position`, [
      uploadId,
    ]);
    return rows.map((row) => text(row.tag));
  }

  private async writeUploadMetadataTags(db: Queryable, uploadId: string, tags: string[]): Promise<void> {
    for (const [index, tag] of tags.entries()) {
      await db.execute(`INSERT INTO platform_upload_metadata_tags (upload_id, tag, position) VALUES (?, ?, ?)`, [
        uploadId,
        tag,
        index,
      ]);
    }
  }

  private async skillExists(db: Queryable, skillId: string): Promise<boolean> {
    const rows = await rowsOf(db, `SELECT id FROM platform_published_skills WHERE id = ? LIMIT 1`, [skillId]);
    return rows.length > 0;
  }
}

interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

function parseDatabaseUrl(databaseUrl: string): DatabaseConfig {
  if (!databaseUrl.startsWith('mysql://') && !databaseUrl.startsWith('mysql2://')) {
    throw new Error(`Unsupported database URL protocol. Expected mysql://, received: ${databaseUrl}`);
  }

  const url = new URL(databaseUrl);
  return {
    host: url.hostname || 'localhost',
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username || 'root'),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '') || 'platform_web'),
  };
}

async function ensureDatabase(config: DatabaseConfig): Promise<void> {
  const pool = createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    waitForConnections: true,
    connectionLimit: 1,
    charset: 'utf8mb4',
    timezone: 'Z',
  });

  try {
    await pool.execute(
      `CREATE DATABASE IF NOT EXISTS ${mysqlIdentifier(config.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await pool.end();
  }
}

async function rowsOf(db: Queryable, sql: string, params: any[] = []): Promise<DbRow[]> {
  const [rows] = await db.execute<DbRow[]>(sql, params);
  return rows;
}

function stringifyStore(value: unknown): string | null {
  return value === null ? null : JSON.stringify(value, null, 2);
}

class MemoryPlatformDatabase implements DocumentDatabase {
  private readonly documents = new Map<string, string>();
  private readonly usersById = new Map<string, AuthUserRecord>();
  private readonly userIdsByEmail = new Map<string, string>();
  private readonly sessions = new Map<string, { id: string; userId: string; expiresAt: string; createdAt: string }>();

  async readDocument(collection: string): Promise<string | null> {
    return this.documents.get(collection) ?? null;
  }

  async writeDocument(collection: string, value: string): Promise<void> {
    this.documents.set(collection, value);
  }

  async findAuthUserByEmail(email: string): Promise<AuthUserRecord | null> {
    const id = this.userIdsByEmail.get(email.toLowerCase());
    return id ? this.findAuthUserById(id) : null;
  }

  async listAuthUsers(): Promise<AuthUserRecord[]> {
    return [...this.usersById.values()].sort((a, b) => {
      const created = b.createdAt.localeCompare(a.createdAt);
      return created || a.email.localeCompare(b.email);
    });
  }

  async findAuthUserById(id: string): Promise<AuthUserRecord | null> {
    return this.usersById.get(id) ?? null;
  }

  async upsertAuthUser(input: UpsertAuthUserInput): Promise<AuthUserRecord> {
    const email = input.email.toLowerCase();
    const existingId = this.userIdsByEmail.get(email);
    const existing = existingId ? this.usersById.get(existingId) : this.usersById.get(input.id);
    const now = new Date().toISOString();
    const id = existing?.id ?? input.id;
    const record: AuthUserRecord = {
      id,
      email,
      name: input.name,
      avatarUrl: input.avatarUrl,
      role: input.role,
      passwordHash: input.passwordHash ?? existing?.passwordHash,
      passwordUpdatedAt:
        input.passwordHash && input.passwordHash !== existing?.passwordHash
          ? now
          : existing?.passwordUpdatedAt,
      disabled: input.disabled ?? existing?.disabled ?? false,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.usersById.set(id, record);
    this.userIdsByEmail.set(email, id);
    return record;
  }

  async deleteAuthUser(id: string): Promise<boolean> {
    const existing = this.usersById.get(id);
    if (!existing) return false;
    this.usersById.delete(id);
    this.userIdsByEmail.delete(existing.email);
    for (const [sessionId, session] of this.sessions) {
      if (session.userId === id) {
        this.sessions.delete(sessionId);
      }
    }
    return true;
  }

  async createAuthSession(input: AuthSessionInput): Promise<void> {
    await this.deleteExpiredAuthSessions(new Date().toISOString());
    this.sessions.set(input.id, {
      id: input.id,
      userId: input.userId,
      expiresAt: input.expiresAt,
      createdAt: new Date().toISOString(),
    });
  }

  async findAuthSession(sessionId: string): Promise<AuthSessionRecord | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const user = this.usersById.get(session.userId);
    if (!user) return null;
    return {
      id: session.id,
      user,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
    };
  }

  async deleteAuthSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async deleteExpiredAuthSessions(nowIso: string): Promise<void> {
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= nowIso) {
        this.sessions.delete(id);
      }
    }
  }

  async close(): Promise<void> {}
}

function authUserFromRow(row: DbRow): AuthUserRecord {
  return {
    id: text(row.id),
    email: text(row.email),
    name: text(row.name),
    avatarUrl: optionalText(row.avatar_url),
    role: text(row.role) === 'admin' ? 'admin' : 'user',
    passwordHash: optionalText(row.password_hash),
    passwordUpdatedAt: optionalText(row.password_updated_at),
    disabled: bool(row.disabled),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

function jsonText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function mysqlIdentifier(value: string): string {
  return `\`${value.replace(/`/g, '``')}\``;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function optionalText(value: unknown): string | undefined {
  const result = text(value);
  return result ? result : undefined;
}

function number(value: unknown): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const result = Number(value);
  return Number.isFinite(result) ? result : undefined;
}

function bool(value: unknown): boolean {
  return value === true || value === 1;
}

function parseJson<T>(value: unknown): T | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'string') return JSON.parse(value) as T;
  return value as T;
}

function stringifyJson(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}
