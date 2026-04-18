import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
import { createCliContext } from '../../src/cli/context.js';
import { getDefaultConfig } from '../../src/lib/config.js';
import { getSourceCacheDir } from '../../src/lib/cache.js';
import {
  addWebSource,
  exportWebInstalledSkill,
  getWebSkillDetail,
  generateNpxInstallCommand,
  installWebSkill,
  linkWebInstalledSkillToTargets,
  listWebInstalledSkills,
  listWebSkills,
  listWebSources,
  removeWebInstalledSkill,
  removeWebSource,
  restoreWebBuiltinSources,
  updateWebSource,
} from '../../src/lib/web/api.js';

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

    const config = getDefaultConfig();
    sourceUrl = config.sources[0]!.url;
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
    expect(result.defaultSource).toBe('default');
    expect(result.sources[0]?.name).toBe('default');
    expect(result.sources[0]).toMatchObject({
      builtin: true,
      category: 'cn',
    });
  });

  it('restores missing built-in sources without touching custom sources', () => {
    const config = getDefaultConfig();
    config.sources = [
      config.sources[0]!,
      {
        name: 'team',
        url: 'https://github.com/acme/team-skills.git',
        enabled: true,
      },
    ];
    config.defaultSource = 'team';
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
          enabled: false,
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
      name: 'team',
      url: 'https://github.com/acme/team-skills.git',
    });
    expect(added.source).toMatchObject({ name: 'team', enabled: true });

    const disabled = updateWebSource(ctx(), 'team', { enabled: false });
    expect(disabled.source.enabled).toBe(false);

    const enabled = updateWebSource(ctx(), 'team', { enabled: true });
    expect(enabled.source.enabled).toBe(true);

    const removed = removeWebSource(ctx(), 'team');
    expect(removed.sources.some((source) => source.name === 'team')).toBe(false);
  });

  it('does not disable the last enabled source', () => {
    expect(() => updateWebSource(ctx(), 'default', { enabled: false })).toThrow(
      'Cannot disable the last enabled source',
    );
  });

  it('does not remove the last enabled source', () => {
    const config = getDefaultConfig();
    config.sources[0] = { ...config.sources[0]!, enabled: false };
    config.sources.push({
      name: 'team',
      url: 'https://github.com/acme/team-skills.git',
      enabled: true,
    });
    writeFileSync(
      join(suitHome, 'config.json'),
      `${JSON.stringify(config, null, 2)}\n`,
    );

    expect(() => removeWebSource(ctx(), 'team')).toThrow(
      'Cannot remove the last enabled source',
    );
  });

  it('does not remove the default source', () => {
    expect(() => removeWebSource(ctx(), 'default')).toThrow(
      'Cannot remove default source',
    );
  });

  it('lists and filters skills', () => {
    const all = listWebSkills(ctx(), {});
    expect(all.items.map((item) => item.name)).toContain('code-review');

    const filtered = listWebSkills(ctx(), { q: 'react', tag: 'frontend' });
    expect(filtered.items.map((item) => item.name)).toEqual(['react-helper']);
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
      source: 'default',
      targets: ['skills'],
      strategy: 'overwrite',
    });
    expect(result.results[0]).toMatchObject({
      target: 'skills',
      scope: 'project',
      status: 'installed',
    });
    const installedPath = join(projectDir, '.skills', 'react-helper');
    expect(existsSync(installedPath)).toBe(true);

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
