/**
 * Tauri IPC API 封装
 * 仅在 Tauri 桌面应用环境中可用
 */

import { invoke } from '@tauri-apps/api/core';

// 检测是否在 Tauri 环境中运行
export function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

// IPC 命令结果类型
interface TauriResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  stdout?: string;
}

// 执行 IPC 命令
async function runCommand<T>(
  command: string,
  args: Record<string, unknown>,
): Promise<T> {
  const result = await invoke<TauriResult<T>>(command, args);
  if (!result.success) {
    throw new Error(result.error ?? 'Command failed');
  }
  if (result.data !== undefined && result.data !== null) {
    return result.data;
  }
  const stdout = result.stdout?.trim();
  if (stdout?.startsWith('{') || stdout?.startsWith('[')) {
    return JSON.parse(stdout) as T;
  }
  return undefined as T;
}

// Sources API
export async function tauriGetSources(): Promise<{
  sources: Array<{
    name: string;
    url: string;
    enabled: boolean;
    builtin?: boolean;
    label?: string;
    category?: string;
    description?: string;
  }>;
  defaultSource: string;
}> {
  return runCommand('get_sources', {});
}

export async function tauriAddSource(name: string, url: string): Promise<void> {
  await runCommand('add_source', { name, url });
}

export async function tauriRemoveSource(name: string): Promise<void> {
  await runCommand('remove_source', { name });
}

export async function tauriUpdateSource(
  name: string,
  enabled: boolean,
): Promise<void> {
  await runCommand('update_source', { name, enabled });
}

// Skills API
export async function tauriGetSkillsList(options?: {
  source?: string;
  query?: string;
  tag?: string;
}): Promise<{ items: Array<{
  name: string;
  version?: string;
  description?: string;
  author?: string;
  tags?: string[];
  sourceName: string;
}> }> {
  return runCommand('get_skills_list', options ?? {});
}

export async function tauriGetSkillDetail(
  name: string,
  source?: string,
): Promise<{
  name: string;
  version?: string;
  description?: string;
  author?: string;
  tags?: string[];
  sourceName: string;
  markdown?: string;
}> {
  return runCommand('get_skill_detail', { name, source });
}

// Installed API
export async function tauriGetInstalledSkills(options?: {
  scope?: string;
  target?: string;
}): Promise<{ items: Array<{
  name: string;
  target: string;
  scope: string;
  path: string;
  description?: string;
  version?: string;
  sourceName?: string;
}> }> {
  return runCommand('get_installed_skills', options ?? {});
}

// Install/Remove API
export async function tauriInstallSkill(options: {
  identifier: string;
  source?: string;
  targets?: string[];
  global?: boolean;
}): Promise<void> {
  await runCommand('install_skill', options);
}

export async function tauriRemoveSkill(options: {
  name: string;
  target?: string;
  scope?: string;
}): Promise<void> {
  await runCommand('remove_skill', options);
}

export async function tauriExportSkill(options: {
  name: string;
  target: string;
  scope: string;
}): Promise<void> {
  await runCommand('export_skill', options);
}

// 通用命令执行
export async function tauriRunCommand(args: string[]): Promise<string> {
  const result = await invoke<TauriResult<string>>('run_skill_command', { args });
  if (!result.success) {
    throw new Error(result.error ?? 'Command failed');
  }
  return result.stdout ?? '';
}
