import { DESKTOP_LATEST_JSON_UPSTREAM_URL } from './desktop-artifacts-url.js';

const MAX_MANIFEST_BYTES = 512 * 1024;

export interface DesktopReleaseAsset {
  filename: string;
  url?: string;
  repo?: string;
  branch?: string;
  path?: string;
}

export interface DesktopReleaseManifest {
  version: string;
  pub_date: string;
  notes: string;
  platforms: Partial<
    Record<'windows-x86_64' | 'darwin-aarch64' | 'darwin-x86_64', DesktopReleaseAsset>
  >;
}

/**
 * 从上游拉取桌面端构件清单 JSON 文本（Node 侧 fetch，无浏览器 CORS 限制）。
 */
export async function fetchDesktopReleaseManifestText(): Promise<string | null> {
  try {
    const res = await fetch(DESKTOP_LATEST_JSON_UPSTREAM_URL, {
      redirect: 'follow',
      headers: {
        accept: 'application/json, text/plain, */*',
        'user-agent': 'Suit-Skills',
      },
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > MAX_MANIFEST_BYTES) return null;
    JSON.parse(text);
    return text;
  } catch {
    return null;
  }
}

export async function fetchDesktopReleaseManifest(): Promise<DesktopReleaseManifest | null> {
  const text = await fetchDesktopReleaseManifestText();
  if (!text) return null;
  try {
    return JSON.parse(text) as DesktopReleaseManifest;
  } catch {
    return null;
  }
}
