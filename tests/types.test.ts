import { describe, it, expect } from 'vitest';
import type { SkillMeta, Source, Config, AgentMapping, InstallTarget } from '@suit-skills/core';

describe('类型定义', () => {
  it('能够构造合法的 SkillMeta', () => {
    const meta: SkillMeta = {
      name: 'code-review',
      version: '1.0.0',
      description: 'Code review helper',
      author: 'test',
      tags: ['review'],
    };
    expect(meta.name).toBe('code-review');
    expect(meta.version).toBe('1.0.0');
  });

  it('SkillMeta 允许额外字段', () => {
    const meta: SkillMeta = {
      name: 'test',
      version: '0.1.0',
      customField: 'value',
    };
    expect((meta as Record<string, unknown>).customField).toBe('value');
  });

  it('能够构造合法的 Source', () => {
    const source: Source = {
      name: 'team',
      url: 'https://example.com/team-skills.git',
      enabled: true,
    };
    expect(source.enabled).toBe(true);
  });

  it('能够构造合法的 AgentMapping', () => {
    const mapping: AgentMapping = {
      globalDir: '~/.claude/skills',
      projectDir: './.claude/skills',
    };
    expect(mapping.globalDir).toContain('.claude/skills');
  });

  it('能够构造合法的 Config', () => {
    const config: Config = {
      sources: [{ name: 'team', url: 'https://example.com', enabled: true }],
      defaultSource: 'team',
      agents: {
        claude: { globalDir: '~/.claude/skills', projectDir: './.claude/skills' },
      },
    };
    expect(config.defaultSource).toBe('team');
    expect(config.agents.claude.globalDir).toBeTruthy();
  });

  it('能够构造各种合法的 InstallTarget', () => {
    const project: InstallTarget = { type: 'project', path: './.skills/' };
    const global: InstallTarget = { type: 'global', path: '~/.suit-skills/skills/' };
    const agent: InstallTarget = { type: 'agent', path: './.claude/skills/' };

    expect(project.type).toBe('project');
    expect(global.type).toBe('global');
    expect(agent.type).toBe('agent');
  });
});
