import { homedir } from 'node:os';
import type { Config, Source } from '../types/index.js';
import {
  getSourceRefreshMaxAgeMs,
  loadConfig,
  saveConfig,
  type ConfigLocationOptions,
} from '@suit-skills/core';
import { refreshCache, type RefreshCacheOptions } from '@suit-skills/core';

/** 无自动检测到的安装目标时，由测试或宿主注入的选择逻辑（替代交互多选） */
export type PickInstallTargetsWhenEmpty = (
  config: Config,
  context: { cwd: string; userHome: string; isGlobal: boolean },
) => Promise<string[]>;

export interface CliContext {
  cwd: string;
  userHome: string;
  configOptions: ConfigLocationOptions;
  /**传给 `refreshCache` 的额外选项（测试可注入 `cloneOrPullRepo`） */
  refreshExtra?: RefreshCacheOptions;
  /**
   * 当 `getEffectiveInstallTargets` 为空且未传 `--agent` / `--env` 时调用。
   * 未设置且为交互式终端：`install` 会弹出多选；非 TTY 则报错并提示使用 `--env`。
   */
  pickInstallTargetsWhenEmpty?: PickInstallTargetsWhenEmpty;
  loadConfig(): Config;
  saveConfig(cfg: Config): void;
  refreshForSource(
    sourceOrUrl: string | Source,
    options?: { force?: boolean },
  ): ReturnType<typeof refreshCache>;
}

export function createDefaultCliContext(): CliContext {
  const cwd = process.cwd();
  const userHome = homedir();
  const configOptions: ConfigLocationOptions = {};
  return {
    cwd,
    userHome,
    configOptions,
    loadConfig: () => loadConfig(configOptions),
    saveConfig: (cfg) => saveConfig(cfg, configOptions),
    refreshForSource: (sourceOrUrl: string | Source, options) => {
      const cfg = loadConfig(configOptions);
      return refreshCache(sourceOrUrl, {
        ...configOptions,
        force: options?.force,
        maxAgeMs: getSourceRefreshMaxAgeMs(cfg),
      });
    },
  };
}

/** 测试或脚本使用：可覆盖 homedir、`refreshExtra` */
export function createCliContext(
  opts: {
    cwd: string;
    userHome: string;
    configOptions?: ConfigLocationOptions;
    refreshExtra?: RefreshCacheOptions;
    pickInstallTargetsWhenEmpty?: PickInstallTargetsWhenEmpty;
  },
): CliContext {
  const configOptions = opts.configOptions ?? {};
  const refreshExtra = opts.refreshExtra;
  const injectedRefresh = refreshExtra?.cloneOrPullRepo !== undefined;
  return {
    cwd: opts.cwd,
    userHome: opts.userHome,
    configOptions,
    refreshExtra,
    pickInstallTargetsWhenEmpty: opts.pickInstallTargetsWhenEmpty,
    loadConfig: () => loadConfig(configOptions),
    saveConfig: (cfg) => saveConfig(cfg, configOptions),
    refreshForSource: (sourceOrUrl: string | Source, options) =>
      refreshCache(sourceOrUrl, {
        ...configOptions,
        ...(refreshExtra ?? {}),
        force: options?.force,
        maxAgeMs:
          refreshExtra?.maxAgeMs ??
          (injectedRefresh
            ? undefined
            : getSourceRefreshMaxAgeMs(loadConfig(configOptions))),
      }),
  };
}
