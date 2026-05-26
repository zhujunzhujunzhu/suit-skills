import { afterEach, describe, expect, it } from 'vitest';
import AdmZip from 'adm-zip';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlatformApiServer } from '../../packages/server/src/index.js';
import type { OAuthConfig } from '../../packages/server/src/types.js';

const LONG_GIT_FLOW_TIMEOUT_MS = 60_000;

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

async function startServer(tmp: string, repoUrl: string, seedPublishSource = true) {
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
    adminMatchPaths: [],
    userInfoIdPaths: [],
    userInfoLoginPaths: [],
    userInfoNamePaths: [],
    userInfoAvatarPaths: [],
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
  if (seedPublishSource) {
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
  }
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

  it('filters the private default source out of the sources api', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'platform-upload-'));
    temps.push(tmp);
    const { server, baseUrl } = await startServer(tmp, '', false);
    try {
      const hiddenResponse = await fetch(`${baseUrl}/api/sources`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'default',
          label: '默认源',
          description: 'Private team source',
          url: 'https://gitee.com/digital-construction-center_1/suit-skills-lib.git',
          branch: 'main',
          skillsDirectory: 'skills/',
          publishEnabled: false,
        }),
      });
      expect(hiddenResponse.status).toBe(201);
      const hiddenPayload = (await hiddenResponse.json()) as { sources: Array<{ name: string }> };
      expect(hiddenPayload.sources).toEqual([]);

      await fetch(`${baseUrl}/api/sources`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'test-publish',
          label: 'Test publish source',
          description: 'Public source',
          url: 'https://example.com/public.git',
          branch: 'main',
          skillsDirectory: 'skills/',
          publishEnabled: true,
        }),
      });

      const response = await fetch(`${baseUrl}/api/sources`);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        sources: Array<{ name: string }>;
        defaultSources: string[];
      };
      expect(payload.sources.map((source) => source.name)).toEqual(['test-publish']);
      expect(payload.defaultSources).toEqual([]);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('parses a dragged package, saves metadata, and publishes directly to git', async () => {
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

      const metadataResponse = await fetch(`${baseUrl}/api/uploads/${parsed.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'upload-helper',
          description: 'Updated description',
          author: 'Upload Team',
          source: 'test-publish',
          category: 'quality',
          version: '1.2.4',
          tags: ['upload', 'review'],
        }),
      });
      expect(metadataResponse.status).toBe(200);
      const metadataUpdated = await metadataResponse.json();
      expect(metadataUpdated.metadata).toMatchObject({
        description: 'Updated description',
        version: '1.2.4',
      });

      const legacyMetadataResponse = await fetch(`${baseUrl}/api/uploads/${parsed.id}/metadata`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'upload-helper',
          description: 'Legacy route still works',
          author: 'Upload Team',
          source: 'test-publish',
          category: 'quality',
          version: '1.2.5',
          tags: ['upload', 'review'],
        }),
      });
      expect(legacyMetadataResponse.status).toBe(200);
      expect((await legacyMetadataResponse.json()).metadata).toMatchObject({
        description: 'Legacy route still works',
        version: '1.2.5',
      });

      const saveResponse = await fetch(`${baseUrl}/api/uploads/${parsed.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'upload-helper',
          description: 'Saved draft description',
          author: 'Upload Team',
          source: 'test-publish',
          category: 'quality',
          version: '1.2.6',
          tags: ['upload', 'direct-publish'],
        }),
      });
      expect(saveResponse.status).toBe(200);
      const saved = await saveResponse.json();
      expect(saved.status).toBe('parsed');
      expect(saved.metadata).toMatchObject({
        description: 'Saved draft description',
        version: '1.2.6',
      });

      const draftDeleteResponse = await fetch(`${baseUrl}/api/uploads/${parsed.id}`, {
        method: 'DELETE',
      });
      expect(draftDeleteResponse.status).toBe(200);
      const deletedList = await fetch(`${baseUrl}/api/uploads?owner=current-user`);
      expect((await deletedList.json()).items).toEqual([]);

      const secondForm = new FormData();
      secondForm.set('owner', 'current-user');
      secondForm.set('package', packageZip(), 'upload-helper.zip');
      const secondParsedResponse = await fetch(`${baseUrl}/api/uploads/parse`, {
        method: 'POST',
        body: secondForm,
      });
      expect(secondParsedResponse.status).toBe(201);
      const secondParsed = await secondParsedResponse.json();

      const publishResponse = await fetch(`${baseUrl}/api/uploads/${secondParsed.id}/publish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(publishResponse.status).toBe(200);
      const approved = await publishResponse.json();
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
        installs: 0,
        status: 'verified',
        uploadStatus: 'published',
      });

      const packageResponse = await fetch(`${baseUrl}/api/skills/${payload.items[0].id}/package`);
      expect(packageResponse.status).toBe(200);
      expect(packageResponse.headers.get('content-type')).toContain('application/zip');
      const exportedZip = new AdmZip(Buffer.from(await packageResponse.arrayBuffer()));
      expect(exportedZip.getEntry('upload-helper/SKILL.md')).toBeTruthy();
      expect(exportedZip.readAsText('upload-helper/SKILL.md')).toContain('Use it after review.');

      const listedAfterPackageDownload = await fetch(`${baseUrl}/api/skills?q=upload-helper`);
      const afterPackageDownloadPayload = await listedAfterPackageDownload.json();
      expect(afterPackageDownloadPayload.items[0]).toMatchObject({
        name: 'upload-helper',
        installs: 1,
      });

      const secondPackageResponse = await fetch(
        `${baseUrl}/api/skills/${payload.items[0].id}/package`,
      );
      expect(secondPackageResponse.status).toBe(200);
      await secondPackageResponse.arrayBuffer();
      const listedAfterSecondPackageDownload = await fetch(`${baseUrl}/api/skills?q=upload-helper`);
      const afterSecondPackageDownloadPayload = await listedAfterSecondPackageDownload.json();
      expect(afterSecondPackageDownloadPayload.items[0]).toMatchObject({
        name: 'upload-helper',
        installs: 2,
      });

      await fetch(`${baseUrl}/api/sources/test-publish`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      });

      const listedFromPublishedStore = await fetch(`${baseUrl}/api/skills?q=upload-helper`);
      const storedPayload = await listedFromPublishedStore.json();
      expect(storedPayload.items[0]).toMatchObject({
        name: 'upload-helper',
        status: 'verified',
        uploadStatus: 'published',
      });

      const mySkillsResponse = await fetch(`${baseUrl}/api/my-skills?owner=current-user`);
      const mySkillsPayload = await mySkillsResponse.json();
      expect(mySkillsPayload.items[0]).toMatchObject({
        name: 'upload-helper',
        owner: 'current-user',
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, LONG_GIT_FLOW_TIMEOUT_MS);

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

  it('pushes to the configured publish branch when the remote default branch differs', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'platform-upload-branch-'));
    temps.push(tmp);
    const bareRepo = join(tmp, 'skills-origin.git');
    git(['init', '--bare', '--initial-branch=master', bareRepo], tmp);

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

      const publishResponse = await fetch(`${baseUrl}/api/uploads/${parsed.id}/publish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(publishResponse.status).toBe(200);
      const published = await publishResponse.json();
      expect(published.status).toBe('published');

      const mainCommit = git(['--git-dir', bareRepo, 'rev-parse', 'refs/heads/main'], tmp).trim();
      expect(mainCommit).toBe(published.publishedCommit);
      expect(git(['--git-dir', bareRepo, 'show', 'main:skills/upload-helper/SKILL.md'], tmp)).toContain(
        'name: upload-helper',
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('pulls the configured publish branch before committing package changes', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'platform-upload-pull-'));
    temps.push(tmp);
    const bareRepo = join(tmp, 'skills-origin.git');
    const seedCheckout = join(tmp, 'seed');
    git(['init', '--bare', '--initial-branch=main', bareRepo], tmp);
    git(['clone', bareRepo, seedCheckout], tmp);
    git(['config', 'user.email', 'seed@example.local'], seedCheckout);
    git(['config', 'user.name', 'Seed User'], seedCheckout);
    mkdirSync(join(seedCheckout, 'skills', 'existing-skill'), { recursive: true });
    writeFileSync(join(seedCheckout, 'skills', 'existing-skill', 'SKILL.md'), '# existing\n');
    git(['add', 'skills/existing-skill/SKILL.md'], seedCheckout);
    git(['commit', '-m', 'Seed existing skill'], seedCheckout);
    git(['push', 'origin', 'HEAD:main'], seedCheckout);

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

      const publishResponse = await fetch(`${baseUrl}/api/uploads/${parsed.id}/publish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(publishResponse.status).toBe(200);
      expect((await publishResponse.json()).status).toBe('published');

      expect(git(['--git-dir', bareRepo, 'show', 'main:skills/existing-skill/SKILL.md'], tmp)).toContain(
        '# existing',
      );
      expect(git(['--git-dir', bareRepo, 'show', 'main:skills/upload-helper/SKILL.md'], tmp)).toContain(
        'name: upload-helper',
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('deletes a published skill and its upload records', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'platform-upload-delete-'));
    temps.push(tmp);
    const bareRepo = join(tmp, 'skills-origin.git');
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
      const parsed = await parsedResponse.json();

      const publishResponse = await fetch(`${baseUrl}/api/uploads/${parsed.id}/publish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(publishResponse.status).toBe(200);

      const deleteResponse = await fetch(`${baseUrl}/api/skills/upload-helper`, {
        method: 'DELETE',
      });
      expect(deleteResponse.status).toBe(200);

      const skillsResponse = await fetch(`${baseUrl}/api/skills?q=upload-helper`);
      expect((await skillsResponse.json()).items[0]).toMatchObject({
        name: 'upload-helper',
        owner: 'source',
      });

      const mySkillsResponse = await fetch(`${baseUrl}/api/my-skills?owner=current-user`);
      expect((await mySkillsResponse.json()).items).toEqual([]);

      const uploadsResponse = await fetch(`${baseUrl}/api/uploads?owner=current-user`);
      expect((await uploadsResponse.json()).items).toEqual([]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
