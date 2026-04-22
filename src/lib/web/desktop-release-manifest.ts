import { DESKTOP_LATEST_JSON_UPSTREAM_URL } from './desktop-artifacts-url.js';

const MAX_MANIFEST_BYTES = 512 * 1024;

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
