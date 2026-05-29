import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCliContext } from '../../apps/cli/src/cli/context.js';
import { captureInstalledSkillBaseline } from '@suit-skills/core';
import { getDefaultConfig } from '@suit-skills/core';
import { getSourceCacheDir } from '@suit-skills/core';
import {
  addWebSource,
  exportWebInstalledSkill,
  getWebInstalledSkillFileContent,
  getWebInstalledSkillFileTree,
  getWebSkillDetail,
  generateNpxInstallCommand,
  installWebSkill,
  linkWebInstalledSkillToTargets,
  listWebInstalledSkills,
  listWebSkills,
  resetWebInstalledSkill,
  resetWebInstalledSkillFile,
  listWebSources,
  removeWebInstalledSkill,
  removeWebSource,
  restoreWebBuiltinSources,
  saveWebInstalledSkillFile,
  updateWebSource,
  translateWebTextBatch,
} from '../../apps/cli/src/lib/web/api.js';

const TEST_SOURCE = {
  name: 'team',
  url: 'https://github.com/acme/team-skills.git',
  enabled: true,
};

function getConfigWithUserSource() {
  const config = getDefaultConfig();
  config.sources = [{ ...TEST_SOURCE }, ...config.sources];
  config.defaultSource = TEST_SOURCE.name;
  return config;
}

function writeSkill(
  cacheRoot: string,
  name: string,
  meta: Record<string, unknown>,
): void {
  const dir = join(cacheRoot, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'meta.json'),
    `${JSON.stringify({ name, version: '1.0.0', ...meta }, null, 2)}\n`,
  );
  writeFileSync(join(dir, 'SKILL.md'), `# ${name}\n\n## Usage\n\n- Run it\n`);
}

function writeStandardSkill(
  root: string,
  name: string,
  options: {
    version?: string;
    description?: string;
    tags?: string[];
    author?: string;
  } = {},
): void {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  const tags = options.tags?.length
    ? `tags:\n${options.tags.map((tag) => `  - ${tag}`).join('\n')}\n`
    : '';
  writeFileSync(
    join(dir, 'SKILL.md'),
    [
      '---',
      `name: ${name}`,
      `version: ${options.version ?? '1.0.0'}`,
      options.description ? `description: ${options.description}` : '',
      options.author ? `author: ${options.author}` : '',
      tags.trimEnd(),
      '---',
      '',
      `# ${name}`,
      '',
      'Standard skill body.',
      '',
    ]
      .filter((line) => line !== '')
      .join('\n'),
  );
}

describe('web api', () => {
  let tmp: string;
  let projectDir: string;
  let userHome: string;
  let suitHome: string;
  let sourceUrl: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'skills-cli-web-'));
    projectDir = join(tmp, 'project');
    userHome = join(tmp, 'user');
    suitHome = join(tmp, 'suit');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(userHome, { recursive: true });
    mkdirSync(suitHome, { recursive: true });
    process.env.SUIT_SKILLS_HOME = suitHome;

    const config = getConfigWithUserSource();
    sourceUrl = TEST_SOURCE.url;
    writeFileSync(
      join(suitHome, 'config.json'),
      `${JSON.stringify(config, null, 2)}\n`,
    );

    const cacheRoot = getSourceCacheDir(sourceUrl);
    writeSkill(cacheRoot, 'code-review', {
      description: 'Code review assistant',
      tags: ['review', 'quality'],
      author: 'suit-skills',
    });
    writeSkill(cacheRoot, 'react-helper', {
      description: 'React helper',
      tags: ['react', 'frontend'],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SUIT_SKILLS_HOME;
    if (existsSync(tmp)) {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  function ctx() {
    return createCliContext({
      cwd: projectDir,
      userHome,
      refreshExtra: {
        cloneOrPullRepo: (_url, path) => ({ path, freshlyCloned: false }),
      },
    });
  }

  it('lists sources', () => {
    const result = listWebSources(ctx());
    expect(result.defaultSource).toBe('team');
    expect(result.sources[0]?.name).toBe('team');
    expect(result.sources[0]).toMatchObject({
      builtin: false,
      category: 'custom',
      label: 'team',
      description: 'User-defined skill source.',
      effectiveUrl: TEST_SOURCE.url,
    });
    const anthropics = result.sources.find(
      (source) => source.name === 'anthropics-skills',
    );
    expect(anthropics).toMatchObject({
      label: 'Anthropic 官方技能库',
      description: 'Claude 官方技能合集，适合作为基础技能来源。',
      domesticMirror: {
        url: 'https://gitee.com/zhujun12/skills.git',
        enabled: true,
      },
      effectiveUrl: 'https://gitee.com/zhujun12/skills.git',
    });
  });

  it('keeps built-in source display text as readable UTF-8', () => {
    const result = listWebSources(ctx());

    expect(
      result.sources
        .filter((source) => source.builtin)
        .map((source) => ({
          name: source.name,
          label: source.label,
          description: source.description,
        })),
    ).toEqual([
      {
        name: 'anthropics-skills',
        label: 'Anthropic 官方技能库',
        description: 'Claude 官方技能合集，适合作为基础技能来源。',
      },
      {
        name: 'superpowers',
        label: 'Superpowers 工程技能库',
        description: '面向复杂开发、TDD、调试和重构的工程技能库。',
      },
      {
        name: 'vercel-agent-skills',
        label: 'Vercel Agent 技能库',
        description: '聚焦 Web、全栈、Next.js 和部署场景的技能库。',
      },
      {
        name: 'huggingface-skills',
        label: 'Hugging Face 技能库',
        description: '面向 Hugging Face 与开源模型生态的技能库。',
      },
      {
        name: 'antigravity-awesome-skills',
        label: 'Antigravity 技能合集',
        description: '跨平台 AI 技能资源合集。',
      },
      {
        name: 'awesome-claude-skills',
        label: 'Claude 技能资源索引',
        description: 'Claude 技能资源的精选索引，适合发现更多来源。',
      },
    ]);
  });

  it('restores missing built-in sources without touching custom sources', () => {
    const config = getConfigWithUserSource();
    config.sources = [{ ...TEST_SOURCE }];
    writeFileSync(
      join(suitHome, 'config.json'),
      `${JSON.stringify(config, null, 2)}\n`,
    );

    const result = restoreWebBuiltinSources(ctx());
    expect(result.added).toContain('anthropics-skills');
    expect(result.defaultSource).toBe('team');
    expect(result.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'team',
          builtin: false,
          category: 'custom',
          enabled: true,
        }),
        expect.objectContaining({
          name: 'anthropics-skills',
          builtin: true,
          category: 'official',
          enabled: true,
        }),
      ]),
    );

    const disk = JSON.parse(readFileSync(join(suitHome, 'config.json'), 'utf8'));
    expect(disk.defaultSource).toBe('team');
    expect(
      disk.sources.find((source: { name: string }) => source.name === 'team'),
    ).toMatchObject({ enabled: true });
  });

  it('adds, disables, enables, and removes custom sources', () => {
    const added = addWebSource(ctx(), {
      name: 'extra',
      url: 'https://github.com/acme/extra-skills.git',
    });
    expect(added.source).toMatchObject({ name: 'extra', enabled: true });

    const disabled = updateWebSource(ctx(), 'extra', { enabled: false });
    expect(disabled.source.enabled).toBe(false);

    const enabled = updateWebSource(ctx(), 'extra', { enabled: true });
    expect(enabled.source.enabled).toBe(true);

    const removed = removeWebSource(ctx(), 'extra');
    expect(removed.sources.some((source) => source.name === 'extra')).toBe(false);
  });

  it('updates a source url without forcing enabled state changes', () => {
    updateWebSource(ctx(), 'anthropics-skills', { enabled: true });
    const disabled = updateWebSource(ctx(), 'team', { enabled: false });
    expect(disabled.source.enabled).toBe(false);

    const updated = updateWebSource(ctx(), 'team', {
      url: 'https://github.com/acme/team-v2.git',
    });
    expect(updated.source).toMatchObject({
      url: 'https://github.com/acme/team-v2.git',
      enabled: false,
    });
  });

  it('toggles a built-in domestic mirror without changing the source name', () => {
    const disabled = updateWebSource(ctx(), 'anthropics-skills', {
      domesticMirror: { enabled: false },
    });
    expect(disabled.source).toMatchObject({
      name: 'anthropics-skills',
      url: 'https://github.com/anthropics/skills.git',
      effectiveUrl: 'https://github.com/anthropics/skills.git',
      domesticMirror: {
        url: 'https://gitee.com/zhujun12/skills.git',
        enabled: false,
      },
    });

    const enabled = updateWebSource(ctx(), 'anthropics-skills', {
      domesticMirror: { enabled: true },
    });
    expect(enabled.source.effectiveUrl).toBe('https://gitee.com/zhujun12/skills.git');
  });

  it('does not disable the last enabled source', () => {
    const config = getDefaultConfig();
    config.sources = [{ ...TEST_SOURCE }];
    config.defaultSource = TEST_SOURCE.name;
    writeFileSync(
      join(suitHome, 'config.json'),
      `${JSON.stringify(config, null, 2)}\n`,
    );

    expect(() => updateWebSource(ctx(), 'team', { enabled: false })).toThrow(
      'Cannot disable the last enabled source',
    );
  });

  it('does not remove the last enabled source', () => {
    const config = getDefaultConfig();
    config.sources = [{ ...TEST_SOURCE }];
    config.defaultSource = TEST_SOURCE.name;
    writeFileSync(
      join(suitHome, 'config.json'),
      `${JSON.stringify(config, null, 2)}\n`,
    );

    expect(() => removeWebSource(ctx(), 'team')).toThrow(
      'Cannot remove the last enabled source',
    );
  });

  it('removes the configured default source and clears defaultSource', () => {
    updateWebSource(ctx(), 'anthropics-skills', { enabled: true });
    const result = removeWebSource(ctx(), 'team');
    expect(result.defaultSource).toBe('');
    expect(result.sources.some((source) => source.name === 'team')).toBe(false);
  });

  it('lists and filters skills', () => {
    const all = listWebSkills(ctx(), {});
    expect(all.items.map((item) => item.name)).toContain('code-review');

    const filtered = listWebSkills(ctx(), { q: 'react', tag: 'frontend' });
    expect(filtered.items.map((item) => item.name)).toEqual(['react-helper']);
  });

  it('uses local source cache by default without refreshing git', () => {
    const cloneOrPullRepo = vi.fn((_url: string, path: string) => ({
      path,
      freshlyCloned: false,
    }));
    const cachedCtx = createCliContext({
      cwd: projectDir,
      userHome,
      refreshExtra: { cloneOrPullRepo },
    });

    const result = listWebSkills(cachedCtx, {});

    expect(result.items.map((item) => item.name)).toContain('code-review');
    expect(cloneOrPullRepo).not.toHaveBeenCalled();
  });

  it('refreshes git when explicitly requested', () => {
    const cloneOrPullRepo = vi.fn((_url: string, path: string) => ({
      path,
      freshlyCloned: false,
    }));
    const cachedCtx = createCliContext({
      cwd: projectDir,
      userHome,
      refreshExtra: { cloneOrPullRepo },
    });

    listWebSkills(cachedCtx, { refresh: true });

    expect(cloneOrPullRepo).toHaveBeenCalled();
  });

  it('filters skills with non-string metadata without leaking unsafe values', () => {
    const cacheRoot = getSourceCacheDir(sourceUrl);
    writeSkill(cacheRoot, 'dirty-meta', {
      description: { en: 'Nested description' },
      tags: [42, 'findme', { bad: true }],
    });

    expect(() => listWebSkills(ctx(), { q: 'findme' })).not.toThrow();
    const result = listWebSkills(ctx(), { q: 'findme' });

    expect(result.items.map((item) => item.name)).toEqual(['dirty-meta']);
    expect(result.items[0]?.description).toBeUndefined();
    expect(result.items[0]?.tags).toEqual(['42', 'findme']);
  });

  it('reports source refresh failures with the source name and URL', () => {
    const config = getDefaultConfig();
    config.sources.push({
      name: 'no-cache',
      url: 'https://github.com/acme/no-cache.git',
      enabled: true,
    });
    writeFileSync(
      join(suitHome, 'config.json'),
      `${JSON.stringify(config, null, 2)}\n`,
    );

    const failingCtx = createCliContext({
      cwd: projectDir,
      userHome,
      refreshExtra: {
        cloneOrPullRepo: (url) => {
          throw new Error(`git clone (${url}) timed out after 30s`);
        },
      },
    });

    expect(() => listWebSkills(failingCtx, { source: 'no-cache' })).toThrow(
      /Failed to refresh source "no-cache".*timed out after 30s/,
    );
  });

  it('translates multiple markdown fragments with one configured CLI call', async () => {
    const config = getConfigWithUserSource();
    config.translation = {
      provider: 'cli',
      cliCommand: process.execPath,
      cliArgs: [
        '-e',
        'process.stdin.resume(); process.stdin.on("data", () => {}); process.stdin.on("end", () => console.log(JSON.stringify({ items: [{ translated: "你好" }, { translated: "世界" }] })));',
      ],
    };
    writeFileSync(
      join(suitHome, 'config.json'),
      `${JSON.stringify(config, null, 2)}\n`,
    );

    const result = await translateWebTextBatch(ctx(), {
      items: [{ text: 'Hello' }, { text: 'World' }],
    });

    expect(result.items).toEqual([
      { translated: '你好', provider: 'cli' },
      { translated: '世界', provider: 'cli' },
    ]);
  });

  it('rejects batch translation results with mismatched item counts', async () => {
    const config = getConfigWithUserSource();
    config.translation = {
      provider: 'cli',
      cliCommand: process.execPath,
      cliArgs: [
        '-e',
        'process.stdin.resume(); process.stdin.on("data", () => {}); process.stdin.on("end", () => console.log(JSON.stringify({ items: [{ translated: "你好" }] })));',
      ],
    };
    writeFileSync(
      join(suitHome, 'config.json'),
      `${JSON.stringify(config, null, 2)}\n`,
    );

    await expect(
      translateWebTextBatch(ctx(), {
        items: [{ text: 'Hello' }, { text: 'World' }],
      }),
    ).rejects.toThrow('translations for 2 inputs');
  });

  it('keeps all enabled skills usable when one source cannot refresh', () => {
    const config = getConfigWithUserSource();
    config.sources.push({
      name: 'github-only',
      url: 'https://github.com/acme/skills.git',
      enabled: true,
    });
    writeFileSync(
      join(suitHome, 'config.json'),
      `${JSON.stringify(config, null, 2)}\n`,
    );

    const partialCtx = createCliContext({
      cwd: projectDir,
      userHome,
      refreshExtra: {
        cloneOrPullRepo: (url, path) => {
          if (url.includes('github.com/acme')) {
            throw new Error(`git clone (${url}) timed out after 30s`);
          }
          return { path, freshlyCloned: false };
        },
      },
    });

    const result = listWebSkills(partialCtx, { source: 'all', refresh: true });
    expect(result.items.map((item) => item.name)).toContain('code-review');
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceName: 'github-only',
        url: 'https://github.com/acme/skills.git',
        usingCache: false,
      }),
    ]));
    expect(
      result.warnings.find((warning) => warning.sourceName === 'github-only')?.message,
    ).toContain('timed out after 30s');
  });

  it('reports local cache warnings without hiding cached skills', () => {
    const cachedCtx = createCliContext({
      cwd: projectDir,
      userHome,
      refreshExtra: {
        cloneOrPullRepo: (_url, path) => ({
          path,
          warning: true,
          warningMessage: 'git pull timed out after 30s',
        }),
      },
    });

    const result = listWebSkills(cachedCtx, { source: 'team', refresh: true });
    expect(result.items.map((item) => item.name)).toContain('code-review');
    expect(result.warnings).toEqual([
      expect.objectContaining({
        sourceName: 'team',
        usingCache: true,
      }),
    ]);
    expect(result.warnings[0]?.message).toContain('Using local cache');
  });

  it('falls back to a domestic mirror cache when the upstream source is unreachable', () => {
    const config = getDefaultConfig();
    const anthropics = config.sources.find(
      (source) => source.name === 'anthropics-skills',
    )!;
    anthropics.enabled = true;
    anthropics.domesticMirror!.enabled = false;
    writeFileSync(
      join(suitHome, 'config.json'),
      `${JSON.stringify(config, null, 2)}\n`,
    );

    const mirrorCacheRoot = getSourceCacheDir(anthropics.domesticMirror!.url);
    writeSkill(mirrorCacheRoot, 'mirror-cached-skill', {
      description: 'Cached from the domestic mirror',
      tags: ['mirror'],
    });

    const upstreamFailingCtx = createCliContext({
      cwd: projectDir,
      userHome,
      refreshExtra: {
        cloneOrPullRepo: (url, path) => {
          if (url.includes('github.com/anthropics')) {
            throw new Error(`git clone (${url}) timed out after 30s`);
          }
          return { path, freshlyCloned: false };
        },
      },
    });

    const result = listWebSkills(upstreamFailingCtx, {
      source: 'anthropics-skills',
      refresh: true,
    });
    expect(result.items.map((item) => item.name)).toContain(
      'mirror-cached-skill',
    );
    expect(result.warnings).toEqual([
      expect.objectContaining({
        sourceName: 'anthropics-skills',
        usingCache: true,
      }),
    ]);
    expect(result.warnings[0]?.message).toContain('Using local cache');
  });

  it('returns no skills from all when no sources are enabled', () => {
    const config = getDefaultConfig();
    config.sources = config.sources.map((source) => ({
      ...source,
      enabled: false,
    }));
    writeFileSync(
      join(suitHome, 'config.json'),
      `${JSON.stringify(config, null, 2)}\n`,
    );

    const all = listWebSkills(ctx(), { source: 'all' });
    expect(all.items).toEqual([]);
  });

  it('reads skill detail markdown', () => {
    const detail = getWebSkillDetail(ctx(), 'code-review', {});
    expect(detail.name).toBe('code-review');
    expect(detail.markdown).toContain('# code-review');
  });

  it('reads standard SKILL.md frontmatter for web summaries and detail', () => {
    const cacheRoot = getSourceCacheDir(sourceUrl);
    writeStandardSkill(cacheRoot, 'standard-skill', {
      version: '3.2.1',
      description: 'Standard metadata skill',
      tags: ['standard', 'frontmatter'],
      author: 'tester',
    });

    const listed = listWebSkills(ctx(), { q: 'frontmatter' });
    expect(listed.items[0]).toMatchObject({
      name: 'standard-skill',
      version: '3.2.1',
      description: 'Standard metadata skill',
      author: 'tester',
      tags: ['standard', 'frontmatter'],
      metadataSource: 'skill-md',
    });

    const detail = getWebSkillDetail(ctx(), 'standard-skill', {});
    expect(detail.frontmatter.name).toBe('standard-skill');
    expect(detail.metadataSource).toBe('skill-md');
    expect(detail.markdown).toContain('Standard skill body.');
  });

  it('reports installed skills and targets', () => {
    const installedDir = join(projectDir, '.claude', 'skills', 'code-review');
    mkdirSync(installedDir, { recursive: true });
    writeFileSync(
      join(installedDir, 'meta.json'),
      '{"name":"code-review","version":"1.0.0"}',
    );

    const listed = listWebInstalledSkills(ctx(), { agent: 'claude' });
    expect(listed.items[0]?.name).toBe('code-review');

    const skills = listWebSkills(ctx(), { q: 'code-review' });
    expect(skills.items[0]?.installed).toBe(true);
    expect(skills.items[0]?.installedTargets).toContain('claude');
  });

  it('searches installed skills by frontmatter and path', () => {
    const installedDir = join(projectDir, '.claude', 'skills', 'local-helper');
    writeStandardSkill(join(projectDir, '.claude', 'skills'), 'local-helper', {
      version: '0.5.0',
      description: 'Local only helper',
      tags: ['local', 'helper'],
    });

    const byTag = listWebInstalledSkills(ctx(), { target: 'claude', q: 'local' });
    expect(byTag.items.map((item) => item.name)).toContain('local-helper');

    const byPath = listWebInstalledSkills(ctx(), {
      target: 'claude',
      q: installedDir,
    });
    expect(byPath.items.map((item) => item.name)).toEqual(['local-helper']);
  });

  it('reads installed skill files and saves text edits', () => {
    writeStandardSkill(join(projectDir, '.claude', 'skills'), 'editable-helper', {
      description: 'Editable helper',
      tags: ['edit'],
    });
    writeFileSync(
      join(projectDir, '.claude', 'skills', 'editable-helper', 'notes.txt'),
      'hello world',
    );

    const tree = getWebInstalledSkillFileTree(ctx(), 'editable-helper', {
      target: 'claude',
      scope: 'project',
    });
    expect(tree.files.map((item) => item.path)).toEqual(
      expect.arrayContaining(['SKILL.md', 'notes.txt']),
    );

    const before = getWebInstalledSkillFileContent(
      ctx(),
      'editable-helper',
      'notes.txt',
      {
        target: 'claude',
        scope: 'project',
      },
    );
    expect(before.content).toBe('hello world');
    expect(before.encoding).toBe('text');

    const saved = saveWebInstalledSkillFile(ctx(), 'editable-helper', 'notes.txt', {
      target: 'claude',
      scope: 'project',
      content: 'edited from web api',
    });
    expect(saved.content).toBe('edited from web api');
    expect(
      readFileSync(
        join(projectDir, '.claude', 'skills', 'editable-helper', 'notes.txt'),
        'utf8',
      ),
    ).toBe('edited from web api');
  });

  it('rejects editing non-text installed skill files', () => {
    writeStandardSkill(join(projectDir, '.claude', 'skills'), 'image-helper');
    writeFileSync(
      join(projectDir, '.claude', 'skills', 'image-helper', 'logo.png'),
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    );

    expect(() =>
      saveWebInstalledSkillFile(ctx(), 'image-helper', 'logo.png', {
        target: 'claude',
        scope: 'project',
        content: 'not allowed',
      }),
    ).toThrow('Only previewable text files can be edited');
  });

  it('restores installed skill files and directories from a baseline snapshot', () => {
    const skillDir = join(projectDir, '.claude', 'skills', 'baseline-helper');
    writeStandardSkill(join(projectDir, '.claude', 'skills'), 'baseline-helper', {
      description: 'Baseline helper',
      tags: ['baseline'],
    });
    writeFileSync(join(skillDir, 'notes.txt'), 'original notes');
    captureInstalledSkillBaseline(skillDir, {
      skillName: 'baseline-helper',
      installedVersion: '1.0.0',
    });

    writeFileSync(join(skillDir, 'notes.txt'), 'changed notes');
    writeFileSync(join(skillDir, 'scratch.txt'), 'temporary file');

    const resetFile = resetWebInstalledSkillFile(ctx(), 'baseline-helper', {
      target: 'claude',
      scope: 'project',
      filePath: 'notes.txt',
    });
    expect(resetFile.status).toBe('reset');
    expect(resetFile.file?.content).toBe('original notes');
    expect(readFileSync(join(skillDir, 'notes.txt'), 'utf8')).toBe('original notes');

    const resetSkill = resetWebInstalledSkill(ctx(), 'baseline-helper', {
      target: 'claude',
      scope: 'project',
    });
    expect(resetSkill.status).toBe('reset');
    expect(existsSync(join(skillDir, 'scratch.txt'))).toBe(false);
    expect(readFileSync(join(skillDir, 'notes.txt'), 'utf8')).toBe('original notes');
  });

  it('reports a missing baseline when restoring an older installed skill', () => {
    writeStandardSkill(join(projectDir, '.claude', 'skills'), 'legacy-helper');

    expect(() =>
      resetWebInstalledSkillFile(ctx(), 'legacy-helper', {
        target: 'claude',
        scope: 'project',
        filePath: 'SKILL.md',
      }),
    ).toThrow('No installation baseline is available for this skill');
  });

  it('generates and applies AI edit previews for installed skills', async () => {
    const skillDir = join(projectDir, '.claude', 'skills', 'ai-helper');
    writeStandardSkill(join(projectDir, '.claude', 'skills'), 'ai-helper', {
      description: 'AI helper',
    });
    writeFileSync(
      join(skillDir, 'notes.txt'),
      'Use short answers.\n',
    );
    const configPath = join(suitHome, 'config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as ReturnType<typeof getDefaultConfig>;
    config.aiEditing = {
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-5',
    };
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: 'Refined the skill instructions.',
                    files: [
                      {
                        path: 'notes.txt',
                        content: 'Use concise answers.\nAdd one example.\n',
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

    const preview = await import('../../apps/cli/src/lib/web/api.js').then((api) =>
      api.generateWebInstalledSkillAiEdit(ctx(), 'ai-helper', {
        target: 'claude',
        scope: 'project',
        mode: 'file',
        filePath: 'notes.txt',
        prompt: 'Make the guidance more concise and add one example.',
      }),
    );

    expect(preview.provider).toBe('openai');
    expect(preview.files).toEqual([
      {
        path: 'notes.txt',
        beforeContent: 'Use short answers.\n',
        afterContent: 'Use concise answers.\nAdd one example.\n',
      },
    ]);

    const { applyWebInstalledSkillAiEdit } = await import('../../apps/cli/src/lib/web/api.js');
    const applied = applyWebInstalledSkillAiEdit(ctx(), 'ai-helper', {
      target: 'claude',
      scope: 'project',
      files: preview.files.map((file) => ({
        path: file.path,
        content: file.afterContent,
      })),
    });
    expect(applied).toEqual({
      status: 'applied',
      files: ['notes.txt'],
    });
    expect(readFileSync(join(skillDir, 'notes.txt'), 'utf8')).toBe(
      'Use concise answers.\nAdd one example.\n',
    );
  });

  it('searches installed skills across project and user locations', () => {
    writeStandardSkill(join(projectDir, '.codex', 'skills'), 'project-codex', {
      description: 'Workspace codex helper',
      tags: ['workspace'],
    });
    writeStandardSkill(join(userHome, '.claude', 'skills'), 'global-claude', {
      description: 'User claude helper',
      tags: ['user'],
    });

    const all = listWebInstalledSkills(ctx(), { scope: 'all', q: 'helper' });
    expect(all.items.map((item) => item.name)).toEqual([
      'global-claude',
      'project-codex',
    ]);
    expect(all.items.map((item) => `${item.target}:${item.scope}`)).toEqual([
      'claude:global',
      'codex:project',
    ]);

    const codexOnly = listWebInstalledSkills(ctx(), {
      target: 'codex',
      scope: 'all',
      q: 'workspace',
    });
    expect(codexOnly.items.map((item) => item.name)).toEqual([
      'project-codex',
    ]);

    const globalOnly = listWebInstalledSkills(ctx(), {
      scope: 'global',
      q: 'user',
    });
    expect(globalOnly.items.map((item) => item.name)).toEqual([
      'global-claude',
    ]);
  });

  it('lists installed skills without refreshing remote sources', () => {
    writeStandardSkill(join(projectDir, '.claude', 'skills'), 'code-review', {
      description: 'Installed locally',
      tags: ['offline'],
    });

    const offlineCtx = createCliContext({
      cwd: projectDir,
      userHome,
      refreshExtra: {
        cloneOrPullRepo: () => {
          throw new Error('should not refresh sources when listing installed');
        },
      },
    });

    const listed = listWebInstalledSkills(offlineCtx, {
      target: 'claude',
      scope: 'project',
    });

    expect(listed.items).toEqual([
      expect.objectContaining({
        name: 'code-review',
        target: 'claude',
        scope: 'project',
        sourceName: 'team',
      }),
    ]);
  });

  it('deduplicates project and user locations that resolve to the same directory', () => {
    writeStandardSkill(join(userHome, '.agents', 'skills'), 'same-place', {
      description: 'Shared user home helper',
    });

    const sameHomeCtx = createCliContext({
      cwd: userHome,
      userHome,
      refreshExtra: {
        cloneOrPullRepo: (_url, path) => ({ path, freshlyCloned: false }),
      },
    });
    const listed = listWebInstalledSkills(sameHomeCtx, {
      target: 'agents',
      scope: 'all',
      q: 'shared',
    });
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]).toMatchObject({
      name: 'same-place',
      target: 'agents',
      scope: 'global',
    });
  });

  it('generates npx install commands', () => {
    expect(
      generateNpxInstallCommand({
        skillName: 'code-review',
        source: 'default',
        agent: 'claude',
      }),
    ).toBe(
      'npx suit-skills@latest install code-review --source default --agent claude',
    );
  });

  it('installs and removes a skill through web api helpers', () => {
    const result = installWebSkill(ctx(), {
      identifier: 'react-helper',
      source: 'team',
      targets: ['skills'],
      strategy: 'overwrite',
    });
    expect(
      result.results.some(
        (r) =>
          r.target === 'agents' &&
          r.scope === 'project' &&
          r.status === 'installed',
      ),
    ).toBe(true);
    expect(
      result.results.some(
        (r) =>
          r.target === 'skills' &&
          r.scope === 'project' &&
          r.status === 'installed',
      ),
    ).toBe(true);
    const centralPath = join(projectDir, '.agents', 'skills', 'react-helper');
    const installedPath = join(projectDir, '.skills', 'react-helper');
    expect(existsSync(join(centralPath, 'meta.json'))).toBe(true);
    expect(existsSync(join(installedPath, 'meta.json'))).toBe(true);

    writeFileSync(join(centralPath, 'SKILL.md'), '# react-helper\n\nChanged locally\n');
    const reset = resetWebInstalledSkillFile(ctx(), 'react-helper', {
      target: 'agents',
      scope: 'project',
      filePath: 'SKILL.md',
    });
    expect(reset.status).toBe('reset');
    expect(reset.file?.content).toContain('## Usage');

    const removed = removeWebInstalledSkill(ctx(), 'react-helper', {
      target: 'skills',
      scope: 'project',
    });
    expect(removed.status).toBe('removed');
    expect(existsSync(installedPath)).toBe(false);
  });

  it('exports installed skill as a zip buffer', () => {
    writeStandardSkill(join(projectDir, '.agents', 'skills'), 'zip-helper', {
      version: '4.0.0',
      description: 'Zip export helper',
    });
    writeFileSync(
      join(projectDir, '.agents', 'skills', 'zip-helper', 'notes.txt'),
      'zip me',
    );

    const result = exportWebInstalledSkill(ctx(), {
      name: 'zip-helper',
      target: 'agents',
      scope: 'project',
    });
    expect(result.fileName).toBe('zip-helper-4.0.0.zip');
    expect(result.contentType).toBe('application/zip');
    expect(result.body.subarray(0, 4).toString('hex')).toBe('504b0304');
    expect(result.body.includes(Buffer.from('zip-helper/SKILL.md'))).toBe(true);
    expect(result.body.includes(Buffer.from('zip-helper/notes.txt'))).toBe(true);
  });

  it('links an installed skill to cursor and codex targets', () => {
    writeStandardSkill(join(userHome, '.claude', 'skills'), 'shared-helper', {
      version: '1.2.0',
      description: 'Shared helper',
    });

    const result = linkWebInstalledSkillToTargets(ctx(), {
      name: 'shared-helper',
      target: 'claude',
      scope: 'global',
      targets: ['cursor', 'codex'],
    });

    expect(result.results.map((item) => item.status)).toEqual([
      'linked',
      'linked',
    ]);
    expect(
      existsSync(join(userHome, '.cursor', 'skills', 'shared-helper', 'SKILL.md')),
    ).toBe(true);
    expect(
      existsSync(join(userHome, '.codex', 'skills', 'shared-helper', 'SKILL.md')),
    ).toBe(true);
  });
});
