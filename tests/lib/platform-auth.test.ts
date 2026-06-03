import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlatformApiServer } from '../../packages/server/src/index.js';

describe('platform oauth auth flow', () => {
  const temps: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of temps.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('redirects through oauth callback and restores the signed session user', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'platform-auth-'));
    temps.push(tmp);
    const originalFetch = globalThis.fetch;
    let baseUrl = '';

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (baseUrl && url.startsWith(baseUrl)) {
          return originalFetch(input, init);
        }
        if (url === 'https://oauth.example.test/token') {
          return new Response(JSON.stringify({ access_token: 'test-access-token' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url === 'https://oauth.example.test/userinfo') {
          return new Response(
            JSON.stringify({
              sub: 'user-1',
              email: 'admin@example.com',
              name: 'Admin User',
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        }
        return originalFetch(input, init);
      }),
    );

    const server = createPlatformApiServer({
      host: '127.0.0.1',
      port: 0,
      dataFile: join(tmp, 'evaluations.json'),
      skillsFile: join(tmp, 'skills.json'),
      gitConfigFile: join(tmp, 'git-config.json'),
      sourcesFile: join(tmp, 'sources.json'),
      uploadsFile: join(tmp, 'uploads.json'),
      uploadDir: join(tmp, 'uploads'),
      databaseUrl: `sqlite://${join(tmp, 'platform.sqlite')}`,
      corsOrigins: ['*'],
      appBaseUrl: 'http://platform.example.test',
      auth: {
        enabled: true,
        mode: 'oauth',
        clientId: 'client-id',
        clientSecret: 'client-secret',
        authorizationUrl: 'https://oauth.example.test/authorize',
        tokenUrl: 'https://oauth.example.test/token',
        userInfoUrl: 'https://oauth.example.test/userinfo',
        redirectUri: 'http://127.0.0.1/callback',
        scopes: ['openid', 'profile', 'email'],
        sessionSecret: 'test-session-secret',
        adminEmails: ['admin@example.com'],
        adminDomains: [],
        adminMatchPaths: ['email'],
        userInfoIdPaths: ['sub'],
        userInfoLoginPaths: ['email'],
        userInfoNamePaths: ['name'],
        userInfoAvatarPaths: ['picture'],
      },
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    try {
      const login = await originalFetch(`${baseUrl}/api/auth/login?redirect=/notifications`, {
        redirect: 'manual',
      });
      expect(login.status).toBe(302);
      const stateCookie = login.headers.get('set-cookie') ?? '';
      const authorizeUrl = new URL(login.headers.get('location') ?? '');
      expect(authorizeUrl.origin + authorizeUrl.pathname).toBe(
        'https://oauth.example.test/authorize',
      );

      const callback = await originalFetch(
        `${baseUrl}/api/auth/callback?code=test-code&state=${authorizeUrl.searchParams.get('state')}`,
        {
          redirect: 'manual',
          headers: { cookie: stateCookie },
        },
      );
      expect(callback.status).toBe(302);
      expect(callback.headers.get('location')).toBe('http://platform.example.test/notifications');
      const sessionCookie = callback.headers
        .get('set-cookie')
        ?.split(',')
        .find((cookie) => cookie.trim().startsWith('clawhub_session='));
      expect(sessionCookie).toBeTruthy();

      const me = await originalFetch(`${baseUrl}/api/auth/me`, {
        headers: { cookie: sessionCookie ?? '' },
      });
      expect(me.status).toBe(200);
      expect(await me.json()).toEqual({
        user: {
          id: 'user-1',
          email: 'admin@example.com',
          name: 'Admin User',
          role: 'admin',
        },
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('logs in with username and password through the oauth token endpoint', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'platform-password-auth-'));
    temps.push(tmp);
    const originalFetch = globalThis.fetch;
    let baseUrl = '';

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (baseUrl && url.startsWith(baseUrl)) {
          return originalFetch(input, init);
        }
        if (url === 'https://oauth.example.test/token') {
          const body = init?.body?.toString() ?? '';
          expect(body).toContain('grant_type=password');
          expect(body).toContain('username=user%40example.com');
          expect(body).toContain('password=secret');
          return new Response(JSON.stringify({ access_token: 'password-token' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url === 'https://oauth.example.test/userinfo') {
          return new Response(
            JSON.stringify({
              sub: 'user-2',
              email: 'user@example.com',
              name: 'Password User',
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        }
        return originalFetch(input, init);
      }),
    );

    const server = createPlatformApiServer({
      host: '127.0.0.1',
      port: 0,
      dataFile: join(tmp, 'evaluations.json'),
      skillsFile: join(tmp, 'skills.json'),
      gitConfigFile: join(tmp, 'git-config.json'),
      sourcesFile: join(tmp, 'sources.json'),
      uploadsFile: join(tmp, 'uploads.json'),
      uploadDir: join(tmp, 'uploads'),
      databaseUrl: `sqlite://${join(tmp, 'platform.sqlite')}`,
      corsOrigins: ['*'],
      appBaseUrl: 'http://platform.example.test',
      auth: {
        enabled: true,
        mode: 'oauth',
        clientId: 'client-id',
        clientSecret: 'client-secret',
        authorizationUrl: 'https://oauth.example.test/authorize',
        tokenUrl: 'https://oauth.example.test/token',
        userInfoUrl: 'https://oauth.example.test/userinfo',
        redirectUri: 'http://127.0.0.1/callback',
        scopes: ['openid', 'profile', 'email'],
        sessionSecret: 'test-session-secret',
        adminEmails: [],
        adminDomains: [],
        adminMatchPaths: ['email'],
        userInfoIdPaths: ['sub'],
        userInfoLoginPaths: ['email'],
        userInfoNamePaths: ['name'],
        userInfoAvatarPaths: ['picture'],
      },
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    try {
      const login = await originalFetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: 'user@example.com',
          password: 'secret',
        }),
      });
      expect(login.status).toBe(200);
      expect(await login.json()).toEqual({
        user: {
          id: 'user-2',
          email: 'user@example.com',
          name: 'Password User',
          role: 'user',
        },
      });
      expect(login.headers.get('set-cookie')).toContain('clawhub_session=');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('allows local username and password login when oauth env is not configured', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'platform-local-auth-'));
    temps.push(tmp);
    const config = {
      PLATFORM_API_DATA_FILE: join(tmp, 'evaluations.json'),
      PLATFORM_API_SKILLS_FILE: join(tmp, 'skills.json'),
      PLATFORM_API_GIT_CONFIG_FILE: join(tmp, 'git-config.json'),
      PLATFORM_API_SOURCES_FILE: join(tmp, 'sources.json'),
      PLATFORM_API_UPLOADS_FILE: join(tmp, 'uploads.json'),
      PLATFORM_API_UPLOAD_DIR: join(tmp, 'uploads'),
      PLATFORM_DATABASE_URL: `sqlite://${join(tmp, 'platform.sqlite')}`,
      PLATFORM_ADMIN_EMAILS: 'admin@local.dev',
      PLATFORM_AUTH_BOOTSTRAP_PASSWORD: 'secret',
    };
    const { loadConfig } = await import('../../packages/server/src/index.js');
    const server = createPlatformApiServer(loadConfig(config));
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const authConfig = await fetch(`${baseUrl}/api/auth/config`);
      expect(await authConfig.json()).toMatchObject({
        enabled: true,
        mode: 'local',
      });

      const login = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: 'admin@local.dev',
          password: 'secret',
        }),
      });
      expect(login.status).toBe(200);
      expect(await login.json()).toEqual({
        user: {
          id: 'local:admin@local.dev',
          email: 'admin@local.dev',
          name: 'admin@local.dev',
          role: 'admin',
        },
      });
      expect(login.headers.get('set-cookie')).toContain('clawhub_session=');

      const badLogin = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: 'admin@local.dev',
          password: 'wrong-password',
        }),
      });
      expect(badLogin.status).toBe(401);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('registers a local user with a one-time admin invitation', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'platform-invite-auth-'));
    temps.push(tmp);
    const config = {
      PLATFORM_API_DATA_FILE: join(tmp, 'evaluations.json'),
      PLATFORM_API_SKILLS_FILE: join(tmp, 'skills.json'),
      PLATFORM_API_GIT_CONFIG_FILE: join(tmp, 'git-config.json'),
      PLATFORM_API_SOURCES_FILE: join(tmp, 'sources.json'),
      PLATFORM_API_UPLOADS_FILE: join(tmp, 'uploads.json'),
      PLATFORM_API_UPLOAD_DIR: join(tmp, 'uploads'),
      PLATFORM_DATABASE_URL: `sqlite://${join(tmp, 'platform.sqlite')}`,
      PLATFORM_ADMIN_EMAILS: 'admin@local.dev',
      PLATFORM_AUTH_BOOTSTRAP_PASSWORD: 'secret',
    };
    const { loadConfig } = await import('../../packages/server/src/index.js');
    const server = createPlatformApiServer(loadConfig(config));
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const adminLogin = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: 'admin@local.dev',
          password: 'secret',
        }),
      });
      const adminCookie = adminLogin.headers
        .get('set-cookie')
        ?.split(',')
        .find((cookie) => cookie.trim().startsWith('clawhub_session='));
      expect(adminLogin.status).toBe(200);
      expect(adminCookie).toBeTruthy();

      const invite = await fetch(`${baseUrl}/api/admin/invitations`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: adminCookie ?? '',
        },
        body: JSON.stringify({}),
      });
      expect(invite.status).toBe(201);
      const inviteBody = await invite.json() as { token?: string; role?: string; expiresAt?: string };
      expect(inviteBody.token).toBeTruthy();
      expect(inviteBody.role).toBe('user');
      expect(inviteBody.expiresAt).toBeTruthy();

      const register = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: inviteBody.token,
          email: 'invited@example.com',
          name: 'Invited User',
          password: 'new-secret',
        }),
      });
      expect(register.status).toBe(201);
      expect(await register.json()).toEqual({
        user: {
          id: 'local:invited@example.com',
          email: 'invited@example.com',
          name: 'Invited User',
          role: 'user',
        },
      });

      const reused = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: inviteBody.token,
          email: 'second@example.com',
          password: 'new-secret',
        }),
      });
      expect(reused.status).toBe(400);

      const userLogin = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: 'invited@example.com',
          password: 'new-secret',
        }),
      });
      expect(userLogin.status).toBe(200);
      expect(await userLogin.json()).toMatchObject({
        user: {
          email: 'invited@example.com',
          role: 'user',
        },
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('loads external token auth mode from env userinfo config', async () => {
    const { loadConfig } = await import('../../packages/server/src/index.js');
    const config = loadConfig({
      PLATFORM_AUTH_MODE: 'external-token',
      PLATFORM_AUTH_SESSION_SECRET: 'test-session-secret',
      PLATFORM_AUTH_USERINFO_URL: 'https://external.example.test/userinfo',
      PLATFORM_DATABASE_URL: 'sqlite://memory',
      PLATFORM_ADMIN_EMAILS: 'admin@example.com',
    });

    expect(config.auth).toMatchObject({
      enabled: true,
      mode: 'external-token',
      userInfoUrl: 'https://external.example.test/userinfo',
      adminEmails: ['admin@example.com'],
    });
  });

  it('creates an external user from token login and marks admins by email', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'platform-external-auth-'));
    temps.push(tmp);
    const originalFetch = globalThis.fetch;
    let baseUrl = '';

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (baseUrl && url.startsWith(baseUrl)) {
          return originalFetch(input, init);
        }
        if (url === 'https://external.example.test/userinfo') {
          const headers = new Headers(init?.headers);
          expect(headers.get('authorization')).toBe('Bearer external-token-123');
          return new Response(
            JSON.stringify({
              sub: 'external-user-1',
              email: 'admin@example.com',
              name: 'External Admin',
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        }
        return originalFetch(input, init);
      }),
    );

    const server = createPlatformApiServer({
      host: '127.0.0.1',
      port: 0,
      dataFile: join(tmp, 'evaluations.json'),
      skillsFile: join(tmp, 'skills.json'),
      gitConfigFile: join(tmp, 'git-config.json'),
      sourcesFile: join(tmp, 'sources.json'),
      uploadsFile: join(tmp, 'uploads.json'),
      uploadDir: join(tmp, 'uploads'),
      databaseUrl: `sqlite://${join(tmp, 'platform.sqlite')}`,
      corsOrigins: ['*'],
      appBaseUrl: 'http://platform.example.test',
      auth: {
        enabled: true,
        mode: 'external-token',
        clientId: '',
        clientSecret: '',
        authorizationUrl: '',
        tokenUrl: '',
        userInfoUrl: 'https://external.example.test/userinfo',
        redirectUri: 'http://127.0.0.1/callback',
        scopes: [],
        sessionSecret: 'test-session-secret',
        adminEmails: ['admin@example.com'],
        adminDomains: [],
        adminMatchPaths: ['email'],
        userInfoIdPaths: ['sub'],
        userInfoLoginPaths: ['email'],
        userInfoNamePaths: ['name'],
        userInfoAvatarPaths: ['picture'],
      },
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    try {
      const login = await originalFetch(`${baseUrl}/api/auth/external-token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'external-token-123' }),
      });
      expect(login.status).toBe(200);
      expect(await login.json()).toEqual({
        user: {
          id: 'external-user-1',
          email: 'admin@example.com',
          name: 'External Admin',
          role: 'admin',
        },
      });
      const sessionCookie = login.headers
        .get('set-cookie')
        ?.split(',')
        .find((cookie) => cookie.trim().startsWith('clawhub_session='));
      expect(sessionCookie).toBeTruthy();

      const me = await originalFetch(`${baseUrl}/api/auth/me`, {
        headers: { cookie: sessionCookie ?? '' },
      });
      expect(me.status).toBe(200);
      expect(await me.json()).toEqual({
        user: {
          id: 'external-user-1',
          email: 'admin@example.com',
          name: 'External Admin',
          role: 'admin',
        },
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('uses configurable userinfo paths to match admins by username', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'platform-external-username-auth-'));
    temps.push(tmp);
    const originalFetch = globalThis.fetch;
    let baseUrl = '';

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (baseUrl && url.startsWith(baseUrl)) {
          return originalFetch(input, init);
        }
        if (url === 'http://117.72.173.21/prod-api/getInfo') {
          const headers = new Headers(init?.headers);
          expect(headers.get('authorization')).toBe('Bearer screenshot-token');
          return new Response(
            JSON.stringify({
              code: 200,
              msg: '操作成功',
              roles: ['common'],
              user: {
                userId: 6,
                userName: 'zhujun',
                nickName: '朱俊',
                admin: false,
              },
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        }
        return originalFetch(input, init);
      }),
    );

    const server = createPlatformApiServer({
      host: '127.0.0.1',
      port: 0,
      dataFile: join(tmp, 'evaluations.json'),
      skillsFile: join(tmp, 'skills.json'),
      gitConfigFile: join(tmp, 'git-config.json'),
      sourcesFile: join(tmp, 'sources.json'),
      uploadsFile: join(tmp, 'uploads.json'),
      uploadDir: join(tmp, 'uploads'),
      databaseUrl: `sqlite://${join(tmp, 'platform.sqlite')}`,
      corsOrigins: ['*'],
      appBaseUrl: 'http://platform.example.test',
      auth: {
        enabled: true,
        mode: 'external-token',
        clientId: '',
        clientSecret: '',
        authorizationUrl: '',
        tokenUrl: '',
        userInfoUrl: 'http://117.72.173.21/prod-api/getInfo',
        redirectUri: 'http://127.0.0.1/callback',
        scopes: [],
        sessionSecret: 'test-session-secret',
        adminEmails: ['zhujun'],
        adminDomains: [],
        adminMatchPaths: ['user.userName'],
        userInfoIdPaths: ['user.userId'],
        userInfoLoginPaths: ['user.userName'],
        userInfoNamePaths: ['user.nickName', 'user.userName'],
        userInfoAvatarPaths: ['user.avatar'],
      },
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    try {
      const login = await originalFetch(`${baseUrl}/api/auth/external-token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'screenshot-token' }),
      });
      expect(login.status).toBe(200);
      expect(await login.json()).toEqual({
        user: {
          id: '6',
          email: 'zhujun',
          name: '朱俊',
          role: 'admin',
        },
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
