import { afterEach, describe, expect, it } from 'vitest';
import AdmZip from 'adm-zip';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlatformApiServer } from '../../packages/server/src/index.js';
import type { OAuthConfig } from '../../packages/server/src/types.js';

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

async function startServer(tmp: string, repoUrl: string) {
  const auth: OAuthConfig = {
    enabled: false,
    mode: 'local',
    clientId: '',
    clientSecret: '',
    authorizationUrl: '',
    tokenUrl: '',
    userInfoUrl: '',
    redirectUri: '',
    scopes: [],
    sessionSecret: '',
    adminEmails: [],
    adminDomains: [],
  };
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
    appBaseUrl: 'http://127.0.0.1:1431',
    auth,
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;
  await fetch(`${baseUrl}/api/sources`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'test-publish',
      label: 'Test publish source',
      description: 'Local bare repository for upload publishing',
      url: repoUrl,
      branch: 'main',
      skillsDirectory: 'skills',
      publishEnabled: true,
    }),
  });
  return { server, baseUrl };
}

function packageZip(): Blob {
  const zip = new AdmZip();
  zip.addFile(
    'upload-helper/SKILL.md',
    Buffer.from(
      [
        '---',
        'name: upload-helper',
        'description: Parsed from uploaded package',
        'version: 1.2.3',
        'author: Upload Team',
        'tags:',
        '  - upload',
        '  - review',
        '---',
        '',
        '# upload-helper',
        '',
        'Use it after review.',
        '',
      ].join('\n'),
    ),
  );
  zip.addFile(
    'upload-helper/meta.json',
    Buffer.from(JSON.stringify({ name: 'legacy-meta-name', description: 'legacy metadata' })),
  );
  return new Blob([zip.toBuffer()], { type: 'application/zip' });
}

describe('platform upload review flow', () => {
  const temps: string[] = [];

  afterEach(() => {
    for (const dir of temps.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('parses a dragged package, submits review, and publishes to git', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'platform-upload-'));
    temps.push(tmp);
    const bareRepo = join(tmp, 'skills-origin.git');
    const checkout = join(tmp, 'checkout');
    git(['init', '--bare', '--initial-branch=main', bareRepo], tmp);

    const { server, baseUrl } = await startServer(tmp, bareRepo);
    try {
      const form = new FormData();
      form.set('owner', 'current-user');
      form.set('package', packageZip(), 'upload-helper.zip');
      const parsedResponse = await fetch(`${baseUrl}/api/uploads/parse`, {
        method: 'POST',
        body: form,
      });
      expect(parsedResponse.status).toBe(201);
      const parsed = await parsedResponse.json();
      expect(parsed.metadata).toMatchObject({
        name: 'upload-helper',
        description: 'Parsed from uploaded package',
        version: '1.2.3',
      });
      expect(parsed.validation).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'PACKAGE_SIZE', severity: 'info' }),
        ]),
      );

      const submitResponse = await fetch(`${baseUrl}/api/uploads/${parsed.id}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(submitResponse.status).toBe(200);
      expect((await submitResponse.json()).status).toBe('waiting_review');

      const approveResponse = await fetch(`${baseUrl}/api/uploads/${parsed.id}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(approveResponse.status).toBe(200);
      const approved = await approveResponse.json();
      expect(approved.status).toBe('published');
      expect(approved.publishedCommit).toMatch(/[a-f0-9]{40}/);

      git(['clone', bareRepo, checkout], tmp);
      expect(readFileSync(join(checkout, 'skills', 'upload-helper', 'SKILL.md'), 'utf8')).toContain(
        'name: upload-helper',
      );

      const listed = await fetch(`${baseUrl}/api/skills?q=upload-helper`);
      const payload = await listed.json();
      expect(payload.items[0]).toMatchObject({
        name: 'upload-helper',
        status: 'verified',
        uploadStatus: 'published',
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rejects standalone meta.json uploads', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'platform-upload-json-'));
    temps.push(tmp);
    const bareRepo = join(tmp, 'skills-origin.git');
    git(['init', '--bare', '--initial-branch=main', bareRepo], tmp);

    const { server, baseUrl } = await startServer(tmp, bareRepo);
    try {
      const form = new FormData();
      form.set('owner', 'current-user');
      form.set('package', new Blob(['{"name":"legacy"}'], { type: 'application/json' }), 'meta.json');
      const response = await fetch(`${baseUrl}/api/uploads/parse`, {
        method: 'POST',
        body: form,
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { code: 'UNSUPPORTED_PACKAGE' },
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
