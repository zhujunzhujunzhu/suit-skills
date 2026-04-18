import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseMetaJson,
  scanSkillsFromCache,
  findSkillInCache,
  searchSkills,
  getSkillSourceDir,
} from '../../src/lib/skills.js';
import type { SkillMeta } from '../../src/types/index.js';

describe('parseMetaJson', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'skills-cli-parse-meta-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('测试用例 1：合法 meta.json → 返回完整的 SkillMeta 对象', () => {
    const skillDir = join(root, 'code-review');
    mkdirSync(skillDir);
    writeFileSync(
      join(skillDir, 'meta.json'),
      JSON.stringify({
        name: 'code-review',
        version: '1.0.0',
        description: '审查代码',
        author: 'tester',
        tags: ['review', 'quality'],
      }),
      'utf8',
    );
    const meta = parseMetaJson(skillDir);
    expect(meta).toEqual({
      name: 'code-review',
      version: '1.0.0',
      description: '审查代码',
      author: 'tester',
      tags: ['review', 'quality'],
    });
  });

  it('测试用例 2：缺少 name 字段 → 抛出校验错误', () => {
    const skillDir = join(root, 'some-skill');
    mkdirSync(skillDir);
    writeFileSync(
      join(skillDir, 'meta.json'),
      JSON.stringify({ version: '1.0.0' }),
      'utf8',
    );
    expect(() => parseMetaJson(skillDir)).toThrow(/missing required field "name"/);
  });

  it('测试用例 3：缺少 version 字段 → 抛出校验错误', () => {
    const skillDir = join(root, 'code-review');
    mkdirSync(skillDir);
    writeFileSync(
      join(skillDir, 'meta.json'),
      JSON.stringify({ name: 'code-review' }),
      'utf8',
    );
    expect(() => parseMetaJson(skillDir)).toThrow(/missing required field "version"/);
  });

  it('测试用例 4：name 与文件夹名不一致 → 抛出校验错误', () => {
    const skillDir = join(root, 'code-review');
    mkdirSync(skillDir);
    writeFileSync(
      join(skillDir, 'meta.json'),
      JSON.stringify({ name: 'wrong-name', version: '1.0.0' }),
      'utf8',
    );
    expect(() => parseMetaJson(skillDir)).toThrow(/must match folder name/);
  });

  it('测试用例 5：多余字段 → 不报错，保留在对象中', () => {
    const skillDir = join(root, 'code-review');
    mkdirSync(skillDir);
    writeFileSync(
      join(skillDir, 'meta.json'),
      JSON.stringify({
        name: 'code-review',
        version: '1.0.0',
        extraKey: 'kept',
        nested: { a: 1 },
      }),
      'utf8',
    );
    const meta = parseMetaJson(skillDir) as SkillMeta & {
      extraKey?: string;
      nested?: { a: number };
    };
    expect(meta.name).toBe('code-review');
    expect(meta.version).toBe('1.0.0');
    expect(meta.extraKey).toBe('kept');
    expect(meta.nested).toEqual({ a: 1 });
  });
});

describe('scanSkillsFromCache', () => {
  let cacheRoot: string;

  beforeEach(() => {
    cacheRoot = mkdtempSync(join(tmpdir(), 'skills-cli-scan-cache-'));
  });

  afterEach(() => {
    rmSync(cacheRoot, { recursive: true, force: true });
  });

  function writeSkill(name: string, meta: Record<string, unknown>): void {
    const dir = join(cacheRoot, name);
    mkdirSync(dir);
    writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta), 'utf8');
  }

  it('测试用例 1：缓存有 3 个合法 skill → 返回长度为 3 的数组', () => {
    writeSkill('a-one', { name: 'a-one', version: '1.0.0' });
    writeSkill('b-two', { name: 'b-two', version: '2.0.0' });
    writeSkill('c-three', { name: 'c-three', version: '3.0.0' });
    const list = scanSkillsFromCache(cacheRoot);
    expect(list).toHaveLength(3);
    expect(new Set(list.map((m) => m.name))).toEqual(
      new Set(['a-one', 'b-two', 'c-three']),
    );
  });

  it('测试用例 2：某个 skill 的 meta.json 不合法 → 跳过该 skill，其余正常返回', () => {
    writeSkill('good-one', { name: 'good-one', version: '1.0.0' });
    writeSkill('bad-missing-version', { name: 'bad-missing-version' });
    writeSkill('good-two', { name: 'good-two', version: '2.0.0' });
    const list = scanSkillsFromCache(cacheRoot);
    expect(list).toHaveLength(2);
    expect(list.map((m) => m.name).sort()).toEqual(['good-one', 'good-two']);
  });

  it('测试用例 3：缓存目录为空 → 返回空数组', () => {
    expect(scanSkillsFromCache(cacheRoot)).toEqual([]);
  });

  it('skills/ 子目录下的 skill 也会被扫描（远程仓库常见布局）', () => {
    const nested = join(cacheRoot, 'skills', 'nested-skill');
    mkdirSync(nested, { recursive: true });
    writeFileSync(
      join(nested, 'meta.json'),
      JSON.stringify({ name: 'nested-skill', version: '1.0.0' }),
      'utf8',
    );
    const list = scanSkillsFromCache(cacheRoot);
    expect(list.map((m) => m.name)).toContain('nested-skill');
  });
});

describe('getSkillSourceDir', () => {
  let cacheRoot: string;

  beforeEach(() => {
    cacheRoot = mkdtempSync(join(tmpdir(), 'skills-cli-srcdir-'));
  });

  afterEach(() => {
    rmSync(cacheRoot, { recursive: true, force: true });
  });

  it('根目录优先，其次 skills/<name>', () => {
    const nested = join(cacheRoot, 'skills', 'x');
    mkdirSync(nested, { recursive: true });
    writeFileSync(
      join(nested, 'meta.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' }),
      'utf8',
    );
    expect(getSkillSourceDir(cacheRoot, 'x')).toBe(nested);
  });
});

describe('findSkillInCache', () => {
  let cacheRoot: string;

  beforeEach(() => {
    cacheRoot = mkdtempSync(join(tmpdir(), 'skills-cli-find-cache-'));
    const cr = join(cacheRoot, 'code-review');
    mkdirSync(cr);
    writeFileSync(
      join(cr, 'meta.json'),
      JSON.stringify({
        name: 'code-review',
        version: '1.0.0',
        description: '代码审查',
      }),
      'utf8',
    );
  });

  afterEach(() => {
    rmSync(cacheRoot, { recursive: true, force: true });
  });

  it('测试用例 1："code-review" → 找到并返回 SkillMeta', () => {
    const meta = findSkillInCache(cacheRoot, 'code-review');
    expect(meta).not.toBeNull();
    expect(meta!.name).toBe('code-review');
    expect(meta!.version).toBe('1.0.0');
  });

  it('测试用例 2："nonexistent" → 返回 null', () => {
    expect(findSkillInCache(cacheRoot, 'nonexistent')).toBeNull();
  });

  it('测试用例 3："code-review@1.0.0" → 版本匹配，返回', () => {
    const meta = findSkillInCache(cacheRoot, 'code-review@1.0.0');
    expect(meta).not.toBeNull();
    expect(meta!.version).toBe('1.0.0');
  });

  it('测试用例 4："code-review@9.9.9" → 版本不匹配，返回 null', () => {
    expect(findSkillInCache(cacheRoot, 'code-review@9.9.9')).toBeNull();
  });
});

describe('searchSkills', () => {
  const metas: SkillMeta[] = [
    {
      name: 'react-helper',
      version: '1.0.0',
      description: 'React 辅助',
      tags: ['react', 'ui'],
    },
    {
      name: 'code-review',
      version: '1.0.0',
      description: '用于代码审查与质量检查',
      tags: ['review'],
    },
    {
      name: 'commit-helper',
      version: '0.1.0',
      description: '提交信息',
      tags: ['git', 'commit-msg'],
    },
  ];

  it('测试用例 1："react" → 匹配 react-helper（name 含 react）', () => {
    const hits = searchSkills(metas, 'react');
    expect(hits.map((m) => m.name)).toEqual(['react-helper']);
  });

  it('测试用例 2："代码审查" → 匹配 code-review（description 含该词）', () => {
    const hits = searchSkills(metas, '代码审查');
    expect(hits.map((m) => m.name)).toEqual(['code-review']);
  });

  it('测试用例 3："commit" → 匹配 commit-helper（tag 含 commit）', () => {
    const hits = searchSkills(metas, 'commit');
    expect(hits.map((m) => m.name)).toEqual(['commit-helper']);
  });

  it('测试用例 4："zzzzz" → 返回空数组', () => {
    expect(searchSkills(metas, 'zzzzz')).toEqual([]);
  });

  it('测试用例 5：description / tags 为非字符串时不抛错，且仍可按 name 命中', () => {
    const dirty: SkillMeta[] = [
      {
        name: 'safe-skill',
        version: '1.0.0',
        description: { en: 'nested' } as unknown as string,
        tags: [42, 'findme'] as unknown as string[],
      },
      {
        name: 'other',
        version: '1.0.0',
        description: 'plain',
      },
    ];
    expect(() => searchSkills(dirty, 'test')).not.toThrow();
    const byTag = searchSkills(dirty, 'findme');
    expect(byTag.map((m) => m.name)).toEqual(['safe-skill']);
  });
});
