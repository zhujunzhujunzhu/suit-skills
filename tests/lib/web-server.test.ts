import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createCliContext } from '../../apps/cli/src/cli/context.js';
import { captureInstalledSkillBaseline } from '@suit-skills/core';
import { getDefaultConfig } from '@suit-skills/core';
import { createWebServer } from '../../apps/cli/src/lib/web/server.js';

describe('web server desktop downloads', () => {
  let tmp: string;
  let projectDir: string;
  let userHome: string;
  let suitHome: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'skills-cli-web-server-'));
    projectDir = join(tmp, 'project');
    userHome = join(tmp, 'user');
    suitHome = join(tmp, 'suit');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(userHome, { recursive: true });
    mkdirSync(suitHome, { recursive: true });
    writeFileSync(
      join(suitHome, 'config.json'),
      `${JSON.stringify(getDefaultConfig(), null, 2)}\n`,
    );
    process.env.SUIT_SKILLS_HOME = suitHome;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.SUIT_SKILLS_HOME;
    rmSync(tmp, { recursive: true, force: true });
  });

  it('proxies desktop downloads as attachments', async () => {
    const originalFetch = globalThis.fetch;
    const artifactRepo = join(tmp, 'artifact-repo');
    mkdirSync(join(artifactRepo, 'desktop-windows-setup-msi', 'msi'), {
      recursive: true,
    });
    const artifactPath = join(
      artifactRepo,
      'desktop-windows-setup-msi',
      'msi',
      'Suit Skills_1.0.1_x64_en-US.msi',
    );
    const payload = new Uint8Array([0x4d, 0x53, 0x49, 0x21]);
    writeFileSync(artifactPath, payload);
    spawnSync('git', ['init', '-b', 'desktop-artifacts'], { cwd: artifactRepo });
    spawnSync('git', ['config', 'user.email', 'test@example.test'], { cwd: artifactRepo });
    spawnSync('git', ['config', 'user.name', 'Test'], { cwd: artifactRepo });
    spawnSync('git', ['add', '.'], { cwd: artifactRepo });
    spawnSync('git', ['commit', '-m', 'artifact'], { cwd: artifactRepo });

    const manifest = {
      version: '1.0.1',
      pub_date: '2026-04-20T16:19:20.229Z',
      notes: 'Source ref: master, Commit: 6e8c97f',
      platforms: {
        'windows-x86_64': {
          filename: 'Suit Skills_1.0.1_x64_en-US.msi',
          repo: artifactRepo,
          branch: 'desktop-artifacts',
          path: 'desktop-windows-setup-msi/msi/Suit Skills_1.0.1_x64_en-US.msi',
        },
      },
    };

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(manifest), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
    );

    const ctx = createCliContext({
      cwd: projectDir,
      userHome,
      refreshExtra: {
        cloneOrPullRepo: (_url, path) => ({ path, freshlyCloned: false }),
      },
    });

    const server = createWebServer(ctx);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to bind test server');
    }

    try {
      const response = await originalFetch(
        `http://127.0.0.1:${address.port}/api/desktop/download?platform=windows-x86_64`,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('content-disposition')).toContain(
        'Suit Skills_1.0.1_x64_en-US.msi',
      );
      expect(response.headers.get('content-type')).toBe('application/octet-stream');
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(payload);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('serves and saves installed skill files through api routes', async () => {
    const skillDir = join(projectDir, '.claude', 'skills', 'editor-skill');
    mkdirSync(skillDir, {
      recursive: true,
    });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      '# editor-skill\n',
    );
    writeFileSync(
      join(skillDir, 'notes.txt'),
      'before save',
    );
    captureInstalledSkillBaseline(skillDir, {
      skillName: 'editor-skill',
      installedVersion: '1.0.0',
    });

    const originalFetch = globalThis.fetch;
    const ctx = createCliContext({
      cwd: projectDir,
      userHome,
      refreshExtra: {
        cloneOrPullRepo: (_url, path) => ({ path, freshlyCloned: false }),
      },
    });

    const server = createWebServer(ctx);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to bind test server');
    }

    try {
      const treeResponse = await originalFetch(
        `http://127.0.0.1:${address.port}/api/installed/editor-skill/files?target=claude&scope=project`,
      );
      expect(treeResponse.status).toBe(200);
      const tree = (await treeResponse.json()) as {
        files: Array<{ path: string }>;
      };
      expect(tree.files.map((item) => item.path)).toEqual(
        expect.arrayContaining(['SKILL.md', 'notes.txt']),
      );

      const saveResponse = await originalFetch(
        `http://127.0.0.1:${address.port}/api/installed/editor-skill/files/notes.txt`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            target: 'claude',
            scope: 'project',
            content: 'after save',
          }),
        },
      );
      expect(saveResponse.status).toBe(200);
      const saved = (await saveResponse.json()) as { content: string };
      expect(saved.content).toBe('after save');
      expect(
        readFileSync(
          join(skillDir, 'notes.txt'),
          'utf8',
        ),
      ).toBe('after save');

      const invalidSaveResponse = await originalFetch(
        `http://127.0.0.1:${address.port}/api/installed/editor-skill/files/notes.txt`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            target: 'claude',
            scope: 'project',
          }),
        },
      );
      expect(invalidSaveResponse.status).toBe(400);
      expect(
        readFileSync(
          join(skillDir, 'notes.txt'),
          'utf8',
        ),
      ).toBe('after save');

      const resetFileResponse = await originalFetch(
        `http://127.0.0.1:${address.port}/api/installed/editor-skill/reset-file`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            target: 'claude',
            scope: 'project',
            filePath: 'notes.txt',
          }),
        },
      );
      expect(resetFileResponse.status).toBe(200);
      const resetFile = (await resetFileResponse.json()) as {
        status: string;
        file?: { content?: string };
      };
      expect(resetFile.status).toBe('reset');
      expect(resetFile.file?.content).toBe('before save');

      writeFileSync(join(skillDir, 'scratch.txt'), 'temp');
      const resetSkillResponse = await originalFetch(
        `http://127.0.0.1:${address.port}/api/installed/editor-skill/reset-skill`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            target: 'claude',
            scope: 'project',
          }),
        },
      );
      expect(resetSkillResponse.status).toBe(200);
      expect(readFileSync(join(skillDir, 'notes.txt'), 'utf8')).toBe('before save');
      expect(() => readFileSync(join(skillDir, 'scratch.txt'), 'utf8')).toThrow();
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('generates and applies AI edit previews through api routes', async () => {
    const skillDir = join(projectDir, '.claude', 'skills', 'ai-editor-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), '# ai-editor-skill\n');
    writeFileSync(join(skillDir, 'notes.txt'), 'Be brief.\n');

    const configPath = join(suitHome, 'config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as ReturnType<typeof getDefaultConfig>;
    config.aiEditing = {
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-5',
    };
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

    const originalFetch = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: 'Made the note clearer.',
                    files: [
                      {
                        path: 'notes.txt',
                        content: 'Be concise and include one example.\n',
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      ),
    );

    const ctx = createCliContext({
      cwd: projectDir,
      userHome,
      refreshExtra: {
        cloneOrPullRepo: (_url, path) => ({ path, freshlyCloned: false }),
      },
    });

    const server = createWebServer(ctx);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to bind test server');
    }

    try {
      const previewResponse = await originalFetch(
        `http://127.0.0.1:${address.port}/api/installed/ai-editor-skill/ai-edit`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            target: 'claude',
            scope: 'project',
            mode: 'file',
            filePath: 'notes.txt',
            prompt: 'Make the instructions clearer.',
          }),
        },
      );
      expect(previewResponse.status).toBe(200);
      const preview = (await previewResponse.json()) as {
        files: Array<{ path: string; beforeContent: string; afterContent: string }>;
      };
      expect(preview.files[0]).toEqual({
        path: 'notes.txt',
        beforeContent: 'Be brief.\n',
        afterContent: 'Be concise and include one example.\n',
      });

      const applyResponse = await originalFetch(
        `http://127.0.0.1:${address.port}/api/installed/ai-editor-skill/apply-ai-edit`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            target: 'claude',
            scope: 'project',
            files: [
              {
                path: 'notes.txt',
                content: 'Be concise and include one example.\n',
              },
            ],
          }),
        },
      );
      expect(applyResponse.status).toBe(200);
      expect(readFileSync(join(skillDir, 'notes.txt'), 'utf8')).toBe(
        'Be concise and include one example.\n',
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
