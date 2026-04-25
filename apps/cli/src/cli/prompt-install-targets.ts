import { checkbox, Separator } from '@inquirer/prompts';
import { makeTheme, type Status } from '@inquirer/core';
import { styleText } from 'node:util';
import type { Config } from '@suit-skills/core';
import { resolveDisplayPathForToken } from '@suit-skills/core';
import type { CliContext } from './context.js';

/** 列表展示用名称（路径仍来自配置） */
function agentDisplayName(key: string): string {
  const map: Record<string, string> = {
    claude: 'Claude Code',
    cursor: 'Cursor',
    codex: 'OpenAI Codex',
    copilot: 'GitHub Copilot',
    agents: 'Open Agents',
    gemini: 'Gemini CLI',
    opencode: 'OpenCode',
    openclaw: 'OpenClaw',
  };
  return map[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

const installTargetsCheckboxTheme = makeTheme({
  prefix: {
    idle: styleText(['bold', 'magenta'], ' \u25C6 '),
    done: styleText(['bold', 'green'], ' \u2713 '),
  },
  icon: {
    checked: styleText(['bold', 'green'], ' \u2713 '),
    unchecked: styleText('dim', ' \u25CB '),
    cursor: styleText(['bold', 'cyan'], ' \u276F '),
    disabledChecked: ' \u2713 ',
    disabledUnchecked: ' \u00B7 ',
  },
  style: {
    message: (text: string, status: Status) =>
      status === 'done'
        ? styleText('dim', text)
        : styleText('bold', text),
    help: (text: string) => styleText('dim', text),
    highlight: (text: string) => styleText(['bold', 'cyan'], text),
    key: (text: string) => styleText('cyan', styleText('bold', ` ${text} `)),
    error: (text: string) => styleText('red', `  \u26A0 ${text}`),
    disabled: (text: string) => styleText('dim', text),
    renderSelectedChoices: (selected: readonly { short: string }[]) =>
      selected
        .map((c) => styleText(['bold', 'green'], c.short))
        .join(styleText('dim', ', ')),
    description: (text: string) =>
      styleText('dim', `      ${text.replace(/\n/g, '\n      ')}`),
    keysHelpTip: (keys: [string, string][]) =>
      '\n  ' +
      keys
        .map(([k, a]: [string, string]) =>
          `${styleText('cyan', k)} ${styleText('dim', a)}`,
        )
        .join(styleText('dim', '    \u00B7    ')),
  },
});

export function buildInstallTargetChoices(
  config: Config,
  isGlobal: boolean,
): { value: string; name: string; description: string }[] {
  const scope = isGlobal ? '全局' : '项目';
  const out: { value: string; name: string; description: string }[] = [];
  for (const key of Object.keys(config.agents).sort()) {
    const path = resolveDisplayPathForToken(config, key, isGlobal).trim();
    out.push({
      value: key,
      name: `${agentDisplayName(key)} · ${scope}`,
      description: path,
    });
  }
  return out;
}

const NON_INTERACTIVE_HINT =
  'No install target: no agent folders (.claude, .cursor, .agents, …) found in this project. In scripts or CI use --agent <name> or --env <csv>; in a normal terminal you can choose targets interactively.';

/**
 * 当自动解析的安装目标为空时：交互式多选，或由 `ctx.pickInstallTargetsWhenEmpty` 注入。
 */
export async function resolveInstallTargetsOrPrompt(
  ctx: CliContext,
  config: Config,
  isGlobal: boolean,
): Promise<string[]> {
  if (ctx.pickInstallTargetsWhenEmpty) {
    return ctx.pickInstallTargetsWhenEmpty(config, {
      cwd: ctx.cwd,
      userHome: ctx.userHome,
      isGlobal,
    });
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(NON_INTERACTIVE_HINT);
  }
  const choices = buildInstallTargetChoices(config, isGlobal);
  if (choices.length === 0) {
    throw new Error(
      'No install targets available: config has no agents. Add agents in config or use --env.',
    );
  }
  const header = new Separator(
    styleText('dim', ' ── 智能体环境（多选） ── '),
  );
  const selected = await checkbox({
    message: [
      '当前项目未检测到 Agent 目录。',
      '请选择安装目标（空格切换 · 回车确认）。',
      '如需安装到通用 ./.skills，请使用：--env skills',
    ].join('\n'),
    choices: [header, ...choices],
    theme: installTargetsCheckboxTheme,
    required: true,
    validate: (sel) => (sel.length > 0 ? true : '请至少选择一项'),
  });
  return selected;
}
