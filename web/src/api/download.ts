/**
 * 桌面应用下载 & 版本检测
 * 数据源：Gitee desktop-artifacts 分支的 latest.json
 */

export const GITEE_REPO_URL = 'https://gitee.com/zhujun12/suit-skills-cli';
export const LATEST_JSON_URL = `${GITEE_REPO_URL}/raw/desktop-artifacts/latest.json`;

export interface PlatformAsset {
  filename: string;
  url: string;
}

export interface DesktopRelease {
  version: string;
  pub_date: string;
  notes: string;
  platforms: {
    'windows-x86_64'?: PlatformAsset;
    'darwin-aarch64'?: PlatformAsset;
    'darwin-x86_64'?: PlatformAsset;
  };
}

export type DesktopPlatform = keyof DesktopRelease['platforms'];

export async function fetchLatestRelease(): Promise<DesktopRelease | null> {
  try {
    const res = await fetch(`${LATEST_JSON_URL}?_t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as DesktopRelease;
  } catch {
    return null;
  }
}

/**
 * 比较语义化版本，返回正数表示 a > b，负数表示 a < b，0 表示相等
 */
export function compareSemver(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .replace(/^v/, '')
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * 检测当前浏览器/系统平台，用于高亮推荐下载项
 */
export function detectPlatform(): DesktopPlatform | null {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'windows-x86_64';
  if (ua.includes('mac') || ua.includes('darwin')) {
    // Apple Silicon 的 WebKit UA 中通常仍写 Intel，无法精确区分
    // 优先检测 userAgentData（仅 Chrome 系浏览器支持）
    const uaData = (navigator as { userAgentData?: { platform?: string } })
      .userAgentData;
    if (uaData?.platform?.toLowerCase().includes('mac')) {
      return 'darwin-aarch64'; // 倾向推荐 ARM 版，用户可自行切换
    }
    return 'darwin-aarch64';
  }
  return null;
}

export const PLATFORM_LABELS: Record<DesktopPlatform, { os: string; arch: string; ext: string }> = {
  'windows-x86_64': { os: 'Windows', arch: 'x64', ext: '.msi' },
  'darwin-aarch64': { os: 'macOS', arch: 'Apple Silicon (M1+)', ext: '.dmg' },
  'darwin-x86_64':  { os: 'macOS', arch: 'Intel (x64)', ext: '.dmg' },
};
