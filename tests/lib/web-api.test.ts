import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCliContext } from '../../src/cli/context.js';
import { getDefaultConfig } from '../../src/lib/config.js';
import { getSourceCacheDir } from '../../src/lib/cache.js';
import {
  getWebSkillDetail,
  listWebInstalledSkills,
  listWebSkills,
  listWebSources,
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
  });

  it('lists and filters skills', () => {
    const all = listWebSkills(ctx(), {});
    expect(all.items.map((item) => item.name)).toContain('code-review');

    const filtered = listWebSkills(ctx(), { q: 'react', tag: 'frontend' });
    expect(filtered.items.map((item) => item.name)).toEqual(['react-helper']);
  });

  it('reads skill detail markdown', () => {
    const detail = getWebSkillDetail(ctx(), 'code-review', {});
    expect(detail.meta.name).toBe('code-review');
    expect(detail.markdown).toContain('# code-review');
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
});
