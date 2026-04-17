import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDefaultConfig } from '../../src/lib/config.js';
import { getSourceCacheDir } from '../../src/lib/cache.js';
import { createCliContext } from '../../src/cli/context.js';
import {
  createProgramForTest,
  runCliUserArgs,
} from '../../src/cli/run.js';
import type { SkillMeta } from '../../src/types/index.js';

function writeSkill(
  cacheRoot: string,
  name: string,
  extra: Partial<SkillMeta> & { version: string },
): void {
  const dir = join(cacheRoot, name);
  mkdirSync(dir, { recursive: true });
  const meta: Record<string, unknown> = {
    name,
    version: extra.version,
    ...extra,
  };
  writeFileSync(join(dir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
  writeFileSync(join(dir, 'SKILL.md'), '# skill\n');
}

describe('阶段 9 CLI', () => {
  let tmp: string;
  let projectDir: string;
  let suitHome: string;
  let userHome: string;
  let defaultUrl: string;
  let extraUrl: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'skills-cli-cli-'));
    projectDir = join(tmp, 'proj');
    suitHome = join(tmp, 'suit');
    userHome = join(tmp, 'user');
    mkdirSync(projectDir, { recursive: true });
    process.env.SUIT_SKILLS_HOME = suitHome;

    const base = getDefaultConfig();
    defaultUrl = base.sources[0]!.url;
    extraUrl = 'https://github.com/extra/skills-repo.git';

    const cfg = structuredClone(base);
    cfg.sources.push({
      name: 'my-source',
      url: extraUrl,
      enabled: true,
    });
    mkdirSync(suitHome, { recursive: true });
    writeFileSync(
      join(suitHome, 'config.json'),
      `${JSON.stringify(cfg, null, 2)}\n`,
    );

    const cacheDefault = getSourceCacheDir(defaultUrl);
    const cacheExtra = getSourceCacheDir(extraUrl);
    writeSkill(cacheDefault, 'code-review', {
      version: '1.0.0',
      description: '代码审查',
      tags: ['review', 'audit'],
      author: 'a',
    });
    writeSkill(cacheDefault, 'commit-helper', {
      version: '1.0.0',
      tags: ['commit'],
    });
    writeSkill(cacheDefault, 'react-helper', {
      version: '2.0.0',
      description: 'react 助手',
    });
    writeSkill(cacheExtra, 'extra-skill', { version: '1.0.0' });

    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SUIT_SKILLS_HOME;
    rmSync(tmp, { recursive: true, force: true });
  });

  function ctx() {
    return createCliContext({
      cwd: projectDir,
      userHome,
      refreshExtra: {
        cloneOrPullRepo: (_url, path) => ({
          path,
          freshlyCloned: true,
        }),
      },
    });
  }

  describe('9.1入口', () => {
    it('--help 包含各子命令', async () => {
      const chunks: string[] = [];
      const spy = vi
        .spyOn(process.stdout, 'write')
        .mockImplementation((c: string | Uint8Array) => {
          chunks.push(String(c));
          return true;
        });
      const prog = createProgramForTest(ctx());
      await expect(runCliUserArgs(prog, ['--help'])).rejects.toThrow();
      const text = chunks.join('');
      expect(text).toMatch(/list/);
      expect(text).toMatch(/search/);
      expect(text).toMatch(/info/);
      expect(text).toMatch(/install/);
      expect(text).toMatch(/installed/);
      expect(text).toMatch(/update/);
      expect(text).toMatch(/remove/);
      expect(text).toMatch(/source/);
      expect(text).toMatch(/config/);
      expect(text).toMatch(/env/);
      expect(text).toMatch(/web/);
      spy.mockRestore();
    });

    it('--version 输出版本号', async () => {
      const chunks: string[] = [];
      const spy = vi
        .spyOn(process.stdout, 'write')
        .mockImplementation((c: string | Uint8Array) => {
          chunks.push(String(c));
          return true;
        });
      const prog = createProgramForTest(ctx());
      await expect(runCliUserArgs(prog, ['--version'])).rejects.toThrow();
      const pkg = JSON.parse(
        readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
      ) as { version: string };
      expect(chunks.join('').trim()).toBe(pkg.version);
      spy.mockRestore();
    });

    it('未知子命令会失败并给出提示', async () => {
      const spy = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true);
      const prog = createProgramForTest(ctx());
      await expect(runCliUserArgs(prog, ['not-a-command'])).rejects.toThrow();
      spy.mockRestore();
    });
  });

  describe('9.2 list', () => {
    it('列出 code-review、commit-helper、react-helper', async () => {
      const lines: string[] = [];
      vi.mocked(console.log).mockImplementation((msg: unknown) => {
        lines.push(String(msg));
      });
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, ['list']);
      expect(lines).toContain('code-review');
      expect(lines).toContain('commit-helper');
      expect(lines).toContain('react-helper');
    });

    it('--tag review 只输出含该标签的 skill', async () => {
      const lines: string[] = [];
      vi.mocked(console.log).mockImplementation((msg: unknown) => {
        lines.push(String(msg));
      });
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, ['list', '--tag', 'review']);
      expect(lines).toContain('code-review');
      expect(lines).not.toContain('react-helper');
    });

    it('--source all 聚合启用源', async () => {
      const lines: string[] = [];
      vi.mocked(console.log).mockImplementation((msg: unknown) => {
        lines.push(String(msg));
      });
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, ['list', '--source', 'all']);
      expect(lines).toContain('extra-skill');
      expect(lines).toContain('code-review');
    });

    it('--source 不存在 → Source not found', async () => {
      const prog = createProgramForTest(ctx());
      await expect(
        runCliUserArgs(prog, ['list', '--source', 'nonexistent']),
      ).rejects.toThrow('Source not found');
    });
  });

  describe('9.3 search', () => {
    it('search react → react-helper', async () => {
      const lines: string[] = [];
      vi.mocked(console.log).mockImplementation((msg: unknown) => {
        lines.push(String(msg));
      });
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, ['search', 'react']);
      expect(lines).toContain('react-helper');
    });

    it('search zzzz → No skills found', async () => {
      const lines: string[] = [];
      vi.mocked(console.log).mockImplementation((msg: unknown) => {
        lines.push(String(msg));
      });
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, ['search', 'zzzz']);
      expect(lines.some((l) => l.includes('No skills found'))).toBe(true);
    });
  });

  describe('9.4 info', () => {
    it('输出各字段', async () => {
      const lines: string[] = [];
      vi.mocked(console.log).mockImplementation((msg: unknown) => {
        lines.push(String(msg));
      });
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, ['info', 'code-review']);
      const t = lines.join('\n');
      expect(t).toMatch(/name: code-review/);
      expect(t).toMatch(/version: 1\.0\.0/);
      expect(t).toMatch(/description:/);
      expect(t).toMatch(/author:/);
      expect(t).toMatch(/tags:/);
      expect(t).toMatch(/source:/);
    });

    it('Skill not found', async () => {
      const prog = createProgramForTest(ctx());
      await expect(
        runCliUserArgs(prog, ['info', 'nonexistent']),
      ).rejects.toThrow('Skill not found');
    });
  });

  describe('9.5 install', () => {
    it('无 Agent 目录时默认 install 在非交互环境报错', async () => {
      const prog = createProgramForTest(ctx());
      await expect(
        runCliUserArgs(prog, ['install', 'code-review']),
      ).rejects.toThrow('No install target');
    });

    it('无 Agent 目录时注入 pick 可多选安装到多个目标', async () => {
      const prog = createProgramForTest(
        createCliContext({
          cwd: projectDir,
          userHome,
          refreshExtra: {
            cloneOrPullRepo: (_url, path) => ({
              path,
              freshlyCloned: true,
            }),
          },
          pickInstallTargetsWhenEmpty: async () => ['skills', 'claude'],
        }),
      );
      await runCliUserArgs(prog, ['install', 'code-review']);
      expect(
        existsSync(
          join(projectDir, '.skills', 'code-review', 'meta.json'),
        ),
      ).toBe(true);
      expect(
        existsSync(
          join(projectDir, '.claude', 'skills', 'code-review', 'meta.json'),
        ),
      ).toBe(true);
    });

    it('存在 .claude 时默认 install 仅写入 .claude/skills（不写 .skills）', async () => {
      mkdirSync(join(projectDir, '.claude'), { recursive: true });
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, ['install', 'code-review']);
      expect(existsSync(join(projectDir, '.skills', 'code-review'))).toBe(
        false,
      );
      expect(
        existsSync(
          join(projectDir, '.claude', 'skills', 'code-review', 'meta.json'),
        ),
      ).toBe(true);
    });

    it('显式 --env skills 时可装到 .skills/code-review', async () => {
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, [
        'install',
        'code-review',
        '--env',
        'skills',
      ]);
      expect(
        existsSync(join(projectDir, '.skills', 'code-review', 'meta.json')),
      ).toBe(true);
    });

    it('-g 安装到用户目录 .suit-skills/skills', async () => {
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, [
        'install',
        'code-review',
        '-g',
        '--env',
        'skills',
      ]);
      expect(
        existsSync(
          join(userHome, '.suit-skills', 'skills', 'code-review', 'meta.json'),
        ),
      ).toBe(true);
    });

    it('--agent claude → .claude/skills', async () => {
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, ['install', 'code-review', '--agent', 'claude']);
      expect(
        existsSync(
          join(projectDir, '.claude', 'skills', 'code-review', 'meta.json'),
        ),
      ).toBe(true);
    });

    it('--agent codex → .codex/skills', async () => {
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, [
        'install',
        'code-review@1.0.0',
        '--agent',
        'codex',
      ]);
      expect(
        existsSync(
          join(projectDir, '.codex', 'skills', 'code-review', 'meta.json'),
        ),
      ).toBe(true);
    });

    it('--source my-source 从指定源安装', async () => {
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, [
        'install',
        'extra-skill',
        '--source',
        'my-source',
        '--env',
        'skills',
      ]);
      expect(
        existsSync(join(projectDir, '.skills', 'extra-skill', 'meta.json')),
      ).toBe(true);
    });

    it('Skill not found', async () => {
      mkdirSync(join(projectDir, '.claude'), { recursive: true });
      const prog = createProgramForTest(ctx());
      await expect(
        runCliUserArgs(prog, ['install', 'nonexistent']),
      ).rejects.toThrow('Skill not found');
    });

    it('name@version 安装', async () => {
      const isolated = join(tmp, 'proj-ver');
      mkdirSync(isolated, { recursive: true });
      mkdirSync(join(isolated, '.claude'), { recursive: true });
      const c = createCliContext({
        cwd: isolated,
        userHome,
        refreshExtra: {
          cloneOrPullRepo: (_url, path) => ({
            path,
            freshlyCloned: true,
          }),
        },
      });
      const prog = createProgramForTest(c);
      await runCliUserArgs(prog, ['install', 'code-review@1.0.0']);
      expect(
        existsSync(
          join(isolated, '.claude', 'skills', 'code-review', 'meta.json'),
        ),
      ).toBe(true);
    });

    it('Invalid skill name', async () => {
      mkdirSync(join(projectDir, '.claude'), { recursive: true });
      const prog = createProgramForTest(ctx());
      await expect(
        runCliUserArgs(prog, ['install', 'Code-Review']),
      ).rejects.toThrow('Invalid skill name');
    });
  });

  describe('9.6 installed', () => {
    it('列出 .skills 下 skill', async () => {
      mkdirSync(join(projectDir, '.skills', 'code-review'), { recursive: true });
      writeFileSync(
        join(projectDir, '.skills', 'code-review', 'meta.json'),
        '{"name":"code-review","version":"1.0.0"}',
      );
      const lines: string[] = [];
      vi.mocked(console.log).mockImplementation((m: unknown) => {
        lines.push(String(m));
      });
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, ['installed', '--env', 'skills']);
      expect(lines.some((l) => l.includes('code-review'))).toBe(true);
    });

    it('-g', async () => {
      const g = join(userHome, '.suit-skills', 'skills', 'a');
      mkdirSync(g, { recursive: true });
      writeFileSync(join(g, 'meta.json'), '{"name":"a","version":"1.0.0"}');
      const lines: string[] = [];
      vi.mocked(console.log).mockImplementation((m: unknown) => {
        lines.push(String(m));
      });
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, ['installed', '-g', '--env', 'skills']);
      expect(lines.some((l) => l.includes('\ta'))).toBe(true);
    });

    it('--agent claude', async () => {
      const g = join(projectDir, '.claude', 'skills', 'b');
      mkdirSync(g, { recursive: true });
      writeFileSync(join(g, 'meta.json'), '{"name":"b","version":"1.0.0"}');
      const lines: string[] = [];
      vi.mocked(console.log).mockImplementation((m: unknown) => {
        lines.push(String(m));
      });
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, ['installed', '--agent', 'claude']);
      expect(lines.some((l) => l.includes('\tb'))).toBe(true);
    });

    it('无 skill → No skills installed', async () => {
      const lines: string[] = [];
      vi.mocked(console.log).mockImplementation((m: unknown) => {
        lines.push(String(m));
      });
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, ['installed']);
      expect(lines.some((l) => l.includes('No skills installed'))).toBe(true);
    });
  });

  describe('9.7 update', () => {
    it('指定 skill 且未安装 → Skill not installed', async () => {
      const prog = createProgramForTest(ctx());
      await expect(
        runCliUserArgs(prog, ['update', 'code-review']),
      ).rejects.toThrow('Skill not installed');
    });

    it('版本一致 → Already up to date', async () => {
      const d = join(projectDir, '.skills', 'code-review');
      mkdirSync(d, { recursive: true });
      writeFileSync(
        join(d, 'meta.json'),
        '{"name":"code-review","version":"1.0.0"}',
      );
      const lines: string[] = [];
      vi.mocked(console.log).mockImplementation((m: unknown) => {
        lines.push(String(m));
      });
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, ['update', 'code-review', '--env', 'skills']);
      expect(lines.some((l) => l.includes('Already up to date'))).toBe(true);
    });

    it('update code-review@1.0.0 按目录名 code-review 查找（与 install 一致）', async () => {
      const d = join(projectDir, '.cursor', 'skills', 'code-review');
      mkdirSync(d, { recursive: true });
      writeFileSync(
        join(d, 'meta.json'),
        '{"name":"code-review","version":"1.0.0"}',
      );
      const lines: string[] = [];
      vi.mocked(console.log).mockImplementation((m: unknown) => {
        lines.push(String(m));
      });
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, [
        'update',
        'code-review@1.0.0',
        '--agent',
        'cursor',
      ]);
      expect(lines.some((l) => l.includes('Already up to date'))).toBe(true);
    });

    it('远程较新 → updated', async () => {
      const d = join(projectDir, '.skills', 'react-helper');
      mkdirSync(d, { recursive: true });
      writeFileSync(
        join(d, 'meta.json'),
        '{"name":"react-helper","version":"1.0.0"}',
      );
      const lines: string[] = [];
      vi.mocked(console.log).mockImplementation((m: unknown) => {
        lines.push(String(m));
      });
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, [
        'update',
        'react-helper',
        '--env',
        'skills',
      ]);
      expect(lines.some((l) => l.includes('updated'))).toBe(true);
      const v = (
        JSON.parse(readFileSync(join(d, 'meta.json'), 'utf8')) as {
          version: string;
        }
      ).version;
      expect(v).toBe('2.0.0');
    });

    it('update 全部已安装', async () => {
      const d = join(projectDir, '.skills', 'commit-helper');
      mkdirSync(d, { recursive: true });
      writeFileSync(
        join(d, 'meta.json'),
        '{"name":"commit-helper","version":"1.0.0"}',
      );
      const lines: string[] = [];
      vi.mocked(console.log).mockImplementation((m: unknown) => {
        lines.push(String(m));
      });
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, ['update', '--env', 'skills']);
      expect(lines.some((l) => l.includes('commit-helper'))).toBe(true);
    });
  });

  describe('9.8 remove', () => {
    it('删除 .skills 下目录', async () => {
      const d = join(projectDir, '.skills', 'code-review');
      mkdirSync(d, { recursive: true });
      writeFileSync(
        join(d, 'meta.json'),
        '{"name":"code-review","version":"1.0.0"}',
      );
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, ['remove', 'code-review', '--env', 'skills']);
      expect(existsSync(d)).toBe(false);
    });

    it('-g', async () => {
      const d = join(userHome, '.suit-skills', 'skills', 'x');
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, 'meta.json'), '{"name":"x","version":"1.0.0"}');
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, ['remove', 'x', '-g', '--env', 'skills']);
      expect(existsSync(d)).toBe(false);
    });

    it('--agent claude', async () => {
      const d = join(projectDir, '.claude', 'skills', 'y');
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, 'meta.json'), '{"name":"y","version":"1.0.0"}');
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, ['remove', 'y', '--agent', 'claude']);
      expect(existsSync(d)).toBe(false);
    });

    it('Skill not installed', async () => {
      const prog = createProgramForTest(ctx());
      await expect(
        runCliUserArgs(prog, ['remove', 'nonexistent', '--env', 'skills']),
      ).rejects.toThrow('Skill not installed');
    });
  });

  describe('9.9 source', () => {
    it('add增加源', async () => {
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, [
        'source',
        'add',
        'xsrc',
        'https://github.com/x/y.git',
      ]);
      const cfg = JSON.parse(
        readFileSync(join(suitHome, 'config.json'), 'utf8'),
      ) as { sources: { name: string }[] };
      expect(cfg.sources.some((s) => s.name === 'xsrc')).toBe(true);
    });

    it('重复 URL → Source already exists', async () => {
      const prog = createProgramForTest(ctx());
      await expect(
        runCliUserArgs(prog, ['source', 'add', 'dup', defaultUrl]),
      ).rejects.toThrow('Source already exists');
    });

    it('不能删除 default', async () => {
      const prog = createProgramForTest(ctx());
      await expect(
        runCliUserArgs(prog, ['source', 'remove', 'default']),
      ).rejects.toThrow('Cannot remove default source');
    });

    it('list含 enabled/disabled', async () => {
      const lines: string[] = [];
      vi.mocked(console.log).mockImplementation((m: unknown) => {
        lines.push(String(m));
      });
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, ['source', 'list']);
      const t = lines.join('\n');
      expect(t).toMatch(/enabled|disabled/);
    });

    it('enable / disable', async () => {
      let prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, ['source', 'disable', 'my-source']);
      let cfg = JSON.parse(
        readFileSync(join(suitHome, 'config.json'), 'utf8'),
      ) as { sources: { name: string; enabled: boolean }[] };
      expect(cfg.sources.find((s) => s.name === 'my-source')?.enabled).toBe(
        false,
      );
      prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, ['source', 'enable', 'my-source']);
      cfg = JSON.parse(readFileSync(join(suitHome, 'config.json'), 'utf8'));
      expect(cfg.sources.find((s) => s.name === 'my-source')?.enabled).toBe(
        true,
      );
    });

    it('default 切换', async () => {
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, ['source', 'default', 'my-source']);
      const cfg = JSON.parse(
        readFileSync(join(suitHome, 'config.json'), 'utf8'),
      ) as { defaultSource: string };
      expect(cfg.defaultSource).toBe('my-source');
    });

    it('default 不存在 → Source not found', async () => {
      const prog = createProgramForTest(ctx());
      await expect(
        runCliUserArgs(prog, ['source', 'default', 'nope']),
      ).rejects.toThrow('Source not found');
    });

    it('remove 删除自定义源', async () => {
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, ['source', 'remove', 'my-source']);
      const cfg = JSON.parse(
        readFileSync(join(suitHome, 'config.json'), 'utf8'),
      ) as { sources: { name: string }[] };
      expect(cfg.sources.some((s) => s.name === 'my-source')).toBe(false);
    });
  });

  describe('9.10 config', () => {
    it('config list 输出 JSON', async () => {
      const lines: string[] = [];
      vi.mocked(console.log).mockImplementation((m: unknown) => {
        lines.push(String(m));
      });
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, ['config', 'list']);
      expect(() => JSON.parse(lines.join('\n'))).not.toThrow();
    });

    it('config get defaultSource', async () => {
      const lines: string[] = [];
      vi.mocked(console.log).mockImplementation((m: unknown) => {
        lines.push(String(m));
      });
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, ['config', 'get', 'defaultSource']);
      expect(lines.some((l) => l.includes('default'))).toBe(true);
    });

    it('config set 后可读回', async () => {
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, [
        'config',
        'set',
        'defaultSource',
        'my-source',
      ]);
      const cfg = JSON.parse(
        readFileSync(join(suitHome, 'config.json'), 'utf8'),
      ) as { defaultSource: string };
      expect(cfg.defaultSource).toBe('my-source');
    });

    it('config get 不存在路径 → undefined', async () => {
      const lines: string[] = [];
      vi.mocked(console.log).mockImplementation((m: unknown) => {
        lines.push(String(m));
      });
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, ['config', 'get', 'nonexistent.path']);
      expect(lines.some((l) => l === 'undefined')).toBe(true);
    });
  });

  describe('多环境 installTargets', () => {
    it('项目下已有 .cursor 时默认 install 仅写入 cursor', async () => {
      mkdirSync(join(projectDir, '.cursor'), { recursive: true });
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, ['install', 'code-review']);
      expect(existsSync(join(projectDir, '.skills', 'code-review'))).toBe(
        false,
      );
      expect(
        existsSync(
          join(projectDir, '.cursor', 'skills', 'code-review', 'meta.json'),
        ),
      ).toBe(true);
    });

    it('项目下已有 .agents 时默认 install 仅写入 .agents/skills', async () => {
      mkdirSync(join(projectDir, '.agents'), { recursive: true });
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, ['install', 'code-review']);
      expect(existsSync(join(projectDir, '.skills', 'code-review'))).toBe(
        false,
      );
      expect(
        existsSync(
          join(projectDir, '.agents', 'skills', 'code-review', 'meta.json'),
        ),
      ).toBe(true);
    });

    it('env set 后 install 写入多个目录', async () => {
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, ['env', 'set', 'skills,claude']);
      await runCliUserArgs(prog, ['install', 'code-review']);
      expect(
        existsSync(join(projectDir, '.skills', 'code-review', 'meta.json')),
      ).toBe(true);
      expect(
        existsSync(
          join(projectDir, '.claude', 'skills', 'code-review', 'meta.json'),
        ),
      ).toBe(true);
    });

    it('env list 输出 installTargets', async () => {
      const lines: string[] = [];
      vi.mocked(console.log).mockImplementation((m: unknown) => {
        lines.push(String(m));
      });
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, ['env', 'list']);
      const t = lines.join('\n');
      expect(t).toMatch(/installTargets/);
    });
  });

  describe('阶段 10 别名', () => {
    it('i 等同 install', async () => {
      mkdirSync(join(projectDir, '.claude'), { recursive: true });
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, ['i', 'code-review']);
      expect(
        existsSync(
          join(projectDir, '.claude', 'skills', 'code-review', 'meta.json'),
        ),
      ).toBe(true);
    });

    it('ls 等同 list', async () => {
      const lines: string[] = [];
      vi.mocked(console.log).mockImplementation((m: unknown) => {
        lines.push(String(m));
      });
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, ['ls']);
      expect(lines).toContain('react-helper');
    });

    it('rm 等同 remove', async () => {
      mkdirSync(join(projectDir, '.skills', 'code-review'), {
        recursive: true,
      });
      writeFileSync(
        join(projectDir, '.skills', 'code-review', 'meta.json'),
        '{"name":"code-review","version":"1.0.0"}',
      );
      const prog = createProgramForTest(ctx());
      await runCliUserArgs(prog, ['rm', 'code-review', '--env', 'skills']);
      expect(existsSync(join(projectDir, '.skills', 'code-review'))).toBe(
        false,
      );
    });
  });
});
