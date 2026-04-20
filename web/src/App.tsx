import {
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  addInstallTarget,
  addSource,
  copyInstalledSkillPackage,
  exportInstalledSkill,
  fetchInstalled,
  fetchInstallTargets,
  fetchSettings,
  fetchSkillDetail,
  fetchSkillFileContent,
  fetchSkillFiles,
  fetchSkills,
  fetchSources,
  fetchTranslationConfig,
  installSkill,
  linkInstalledSkillTargets,
  removeInstallTarget,
  removeSource,
  removeInstalledSkill,
  restoreBuiltinSources,
  translateText,
  updateSettings,
  updateInstallTarget,
  updateSource,
  updateTranslationConfig,
  type AppSettings,
  type InstalledSkill,
  type InstallTargetOption,
  type SkillFileContent,
  type SkillFileNode,
  type SkillLibraryTarget,
  type SkillDetail,
  type SkillSummary,
  type Source,
  type SourceWarning,
  type TranslationConfig,
} from './api/client';
import { RAW_API, translateApiError } from './i18n/apiErrors';
import { changeLanguageWithStorage, type AppLocale } from './i18n';
import {
  fetchLatestRelease,
  compareSemver,
  detectPlatform,
  GITEE_REPO_URL,
  PLATFORM_LABELS,
  type DesktopRelease,
  type DesktopPlatform,
} from './api/download';

type View = 'library' | 'installed' | 'sources' | 'settings' | 'download' | 'skill-detail';
type LocationScope = 'project' | 'global';
type ScopeFilter = 'all' | LocationScope;
type InstallStrategy = 'overwrite' | 'skip' | 'rename';

const SEARCH_DEBOUNCE_MS = 300;
const SKILL_CARD_HEIGHT = 180;
const SKILL_GRID_GAP = 12;
const VIRTUAL_OVERSCAN_ROWS = 4;
const DEFAULT_SETTINGS: AppSettings = {
  sourceRefreshIntervalMinutes: 5,
  minimizeToTray: false,
};

const icons = {
  download: (
    <>
      <path d="M12 2v13" />
      <path d="m7 11 5 5 5-5" />
      <path d="M4 18h16" />
    </>
  ),
  terminal: (
    <>
      <path d="M4 5h16v14H4z" />
      <path d="m7 9 3 3-3 3" />
      <path d="M12 15h5" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m7.5 12 3 3L17 8" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 4 4" />
    </>
  ),
  copy: (
    <>
      <path d="M8 8h11v11H8z" />
      <path d="M5 16H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v1" />
    </>
  ),
  package: (
    <>
      <path d="m12 2 8 4.5v9L12 20l-8-4.5v-9L12 2z" />
      <path d="m4.5 7 7.5 4.2L19.5 7" />
      <path d="M12 20v-8.8" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
      <path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M7 7l1 14h8l1-14" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 12a8 8 0 0 1-14.6 4.5" />
      <path d="M4 12A8 8 0 0 1 18.6 7.5" />
      <path d="M18 3v5h-5" />
      <path d="M6 21v-5h5" />
    </>
  ),
  settings: (
    <>
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2 3.4-.2-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V22h-4v-.4a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.2.1-2-3.4.1-.1A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3 14H2v-4h1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7l2-3.4.2.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V2h4v.4a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.2-.1 2 3.4-.1.1A1.7 1.7 0 0 0 19.4 9 1.7 1.7 0 0 0 21 10h1v4h-1a1.7 1.7 0 0 0-1.6 1z" />
    </>
  ),
  x: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </>
  ),
  translate: (
    <>
      <path d="M3 5h8" />
      <path d="M7 3v2" />
      <path d="M4 12c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="m7 12 2 2" />
      <path d="M12 17h9" />
      <path d="M16 13v8" />
      <path d="m13 20 3-3 3 3" />
    </>
  ),
  folder: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </>
  ),
  file: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </>
  ),
  'chevron-right': (
    <path d="M9 18l6-6-6-6" />
  ),
  'chevron-down': (
    <path d="M6 9l6 6 6-6" />
  ),
  'arrow-left': (
    <>
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </>
  ),
};

function Icon({ name }: { name: keyof typeof icons }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      {icons[name]}
    </svg>
  );
}

function npxCommand(
  skill: SkillSummary | SkillDetail | null,
  placeholder: string,
): string {
  if (!skill?.name) return placeholder;
  const source = skill.sourceName ? ` --source ${skill.sourceName}` : '';
  return `npx suit-skills@latest install ${skill.name}${source}`;
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.append(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

async function windowCommand(
  action: 'minimize' | 'toggleMaximize' | 'close' | 'hide',
): Promise<void> {
  if (typeof window === 'undefined' || !('__TAURI__' in window)) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const appWindow = getCurrentWindow();
    await appWindow[action]();
  } catch (error) {
    console.error('Window command failed', error);
  }
}

async function startWindowDrag(event: MouseEvent<HTMLElement>): Promise<void> {
  if (event.button !== 0) return;
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (target?.closest('button, input, select, textarea, a, .window-chrome')) {
    return;
  }
  if (typeof window === 'undefined' || !('__TAURI__' in window)) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().startDragging();
  } catch (error) {
    console.error('Window drag failed', error);
  }
}

type MarkdownBlock =
  | { kind: 'h1' | 'h2' | 'p' | 'pre'; text: string }
  | { kind: 'ul'; items: string[] };

function parseMarkdown(markdown: string, emptyText: string): MarkdownBlock[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let code: string[] | null = null;

  function flushParagraph() {
    if (paragraph.length) {
      blocks.push({ kind: 'p', text: paragraph.join(' ') });
      paragraph = [];
    }
  }

  function flushList() {
    if (list.length) {
      blocks.push({ kind: 'ul', items: list });
      list = [];
    }
  }

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (code) {
        blocks.push({ kind: 'pre', text: code.join('\n') });
        code = null;
      } else {
        flushParagraph();
        flushList();
        code = [];
      }
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    if (line.startsWith('# ')) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'h1', text: line.slice(2).trim() });
      continue;
    }
    if (line.startsWith('## ')) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'h2', text: line.slice(3).trim() });
      continue;
    }
    if (line.startsWith('- ')) {
      flushParagraph();
      list.push(line.slice(2).trim());
      continue;
    }
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  if (code) blocks.push({ kind: 'pre', text: code.join('\n') });
  return blocks.length ? blocks : [{ kind: 'p', text: emptyText }];
}

function MarkdownView({ markdown }: { markdown: string }) {
  const { t } = useTranslation();
  const blocks = useMemo(
    () => parseMarkdown(markdown, t('markdown.empty')),
    [markdown, t],
  );
  return (
    <div className="markdown">
      {blocks.map((block, index) => {
        if (block.kind === 'h1') return <h1 key={index}>{block.text}</h1>;
        if (block.kind === 'h2') return <h2 key={index}>{block.text}</h2>;
        if (block.kind === 'pre') {
          return (
            <pre className="code-block" key={index}>
              <code>{block.text}</code>
            </pre>
          );
        }
        if (block.kind === 'ul') {
          return (
            <ul key={index}>
              {block.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{block.text}</p>;
      })}
    </div>
  );
}

function EmptyState({ children }: { children: string }) {
  return <div className="state">{children}</div>;
}

function ErrorState({ message }: { message: string }) {
  return <div className="state error">{message}</div>;
}

function SourceWarnings({ warnings }: { warnings: SourceWarning[] }) {
  const { t } = useTranslation();
  if (warnings.length === 0) return null;
  return (
    <div className="source-warnings" role="status">
      <strong>
        {warnings.some((warning) => !warning.usingCache)
          ? t('warnings.refreshFailed')
          : t('warnings.usingCache')}
      </strong>
      <span>{t('warnings.hint')}</span>
      <ul>
        {warnings.map((warning) => (
          <li key={`${warning.sourceName}:${warning.url}:${warning.message}`}>
            <b>{warning.sourceName}</b>
            <code>{warning.url}</code>
            <em>
              {warning.usingCache ? t('warnings.localCache') : t('warnings.unreachable')}
            </em>
            <span>{warning.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function installedSkillMatches(item: InstalledSkill, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const fields = [
    item.name,
    item.version,
    item.description,
    item.path,
    item.target,
    item.scope,
    item.sourceName,
    item.metadataSource,
    ...tags,
  ]
    .map((value) =>
      typeof value === 'string' ? value : value == null ? '' : String(value),
    )
    .filter(Boolean);
  return fields.some((value) => value.toLowerCase().includes(needle));
}

function highlightText(value: unknown, query: string): ReactNode {
  const safe =
    typeof value === 'string' ? value : value == null ? '' : String(value);
  const needle = query.trim();
  if (!needle) return safe;

  const lowerValue = safe.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;

  while (cursor < safe.length) {
    const index = lowerValue.indexOf(lowerNeedle, cursor);
    if (index === -1) {
      parts.push(safe.slice(cursor));
      break;
    }
    if (index > cursor) {
      parts.push(safe.slice(cursor, index));
    }
    const end = index + needle.length;
    parts.push(
      <mark className="search-hit" key={`${index}-${end}`}>
        {safe.slice(index, end)}
      </mark>,
    );
    cursor = end;
  }

  return parts;
}

function nextSelectableSource(sources: Source[], current: string): string {
  if (current === 'all') return current;
  return sources.some((item) => item.enabled && item.name === current)
    ? current
    : 'all';
}

const VIEW_KEYS: Record<View, string> = {
  library: 'skills',
  installed: 'installed',
  sources: 'sources',
  settings: 'settings',
  download: 'download',
  'skill-detail': 'skills',
};

function viewFromHash(): View {
  const hash = window.location.hash.slice(1);
  if (hash === 'agents') return 'settings';
  const key = Object.keys(VIEW_KEYS).find((v) => VIEW_KEYS[v as View] === hash);
  return (key as View) || 'library';
}

export default function App() {
  const { t, i18n } = useTranslation();
  const isDesktop = typeof window !== 'undefined' && '__TAURI__' in window;
  const [view, setView] = useState<View>(viewFromHash);
  const [sources, setSources] = useState<Source[]>([]);
  const [source, setSource] = useState('all');
  const [defaultSource, setDefaultSource] = useState('default');
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [installed, setInstalled] = useState<InstalledSkill[]>([]);
  const [installedQuery, setInstalledQuery] = useState('');
  const [debouncedInstalledQuery, setDebouncedInstalledQuery] = useState('');
  const [installedTarget, setInstalledTarget] = useState('');
  const [scope, setScope] = useState<ScopeFilter>('all');
  const [installTargets, setInstallTargets] = useState<string[]>([]);
  const [installTargetRows, setInstallTargetRows] = useState<InstallTargetOption[]>([]);
  const [skillLibrary, setSkillLibrary] = useState<SkillLibraryTarget | null>(null);
  const [installScope, setInstallScope] = useState<LocationScope>('global');
  const [installStrategy, setInstallStrategy] = useState<InstallStrategy>('skip');
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [toolbarRefreshing, setToolbarRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [installedLoading, setInstalledLoading] = useState(false);
  const [error, setError] = useState('');
  const [sourceWarnings, setSourceWarnings] = useState<SourceWarning[]>([]);
  const [toast, setToast] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [updateAvailable, setUpdateAvailable] = useState<DesktopRelease | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [currentAppVersion, setCurrentAppVersion] = useState<string | null>(null);
  const [detailSkillName, setDetailSkillName] = useState('');
  const [prevView, setPrevView] = useState<View>('library');
  const [translationConfig, setTranslationConfig] = useState<TranslationConfig>({ provider: 'none' });
  const skillRequestId = useRef(0);
  const detailRequestId = useRef(0);
  const installedRequestId = useRef(0);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 1800);
  }

  async function loadSkills(
    nextSource = source,
    q = debouncedQuery,
    nextTag = tag,
    refresh = false,
  ) {
    const requestId = skillRequestId.current + 1;
    skillRequestId.current = requestId;
    setLoading(true);
    setError('');
    setSourceWarnings([]);
    try {
      const data = await fetchSkills({
        source: nextSource,
        q,
        tag: nextTag,
        refresh,
      });
      if (skillRequestId.current === requestId) {
        setSkills(data.items);
        setSourceWarnings(data.warnings ?? []);
        setSelected((current) =>
          current && data.items.some((item) => item.name === current)
            ? current
            : data.items[0]?.name ?? '',
        );
      }
    } catch (err) {
      if (skillRequestId.current === requestId) {
        setError(err instanceof Error ? err.message : String(err));
        setSourceWarnings([]);
      }
    } finally {
      if (skillRequestId.current === requestId) {
        setLoading(false);
      }
    }
  }

  async function loadInstalled(
    nextScope = scope,
    target = installedTarget,
    q = debouncedInstalledQuery,
  ) {
    const requestId = installedRequestId.current + 1;
    installedRequestId.current = requestId;
    setInstalledLoading(true);
    try {
      const data = await fetchInstalled({
        scope: nextScope,
        target: target || undefined,
        q,
      });
      if (installedRequestId.current === requestId) {
        setInstalled(data.items);
      }
    } catch {
      if (installedRequestId.current === requestId) {
        setInstalled([]);
      }
    } finally {
      if (installedRequestId.current === requestId) {
        setInstalledLoading(false);
      }
    }
  }

  async function loadSources() {
    try {
      const data = await fetchSources();
      setSources(data.sources);
      setDefaultSource(data.defaultSource);
      setSource((current) => nextSelectableSource(data.sources, current));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function loadSettings() {
    try {
      setSettings(await fetchSettings());
    } catch {
      setSettings(DEFAULT_SETTINGS);
    }
  }

  async function saveSettings(nextSettings: Partial<AppSettings>) {
    try {
      const next = await updateSettings(nextSettings);
      setSettings(next);
      notify(t('toast.settingsSaved', { defaultValue: '设置已保存' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function loadTranslationConfig() {
    try {
      setTranslationConfig(await fetchTranslationConfig());
    } catch {
      setTranslationConfig({ provider: 'none' });
    }
  }

  async function saveTranslationConfig(next: TranslationConfig) {
    try {
      const updated = await updateTranslationConfig(next);
      setTranslationConfig(updated);
      notify(t('toast.translationSaved', { defaultValue: '翻译配置已保存' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function openSkillDetail(name: string) {
    setPrevView(view);
    setDetailSkillName(name);
    setView('skill-detail');
  }

  function openSettings() {
    setPrevView(view);
    setView('settings');
  }

  async function refreshInstallTargets() {
    try {
      const { library, targets } = await fetchInstallTargets();
      setSkillLibrary(library ?? null);
      setInstallTargetRows(targets);
      setInstallTargets((prev) => {
        const visibleTargets = targets.filter((row) => !row.hidden);
        const ids = new Set(visibleTargets.map((row) => row.id));
        const kept = prev.filter((id) => ids.has(id));
        if (kept.length > 0) {
          return kept;
        }
        return visibleTargets
          .filter((row) => row.globalExists || row.projectExists)
          .map((row) => row.id);
      });
    } catch {
      /* Web API 或桌面 CLI 不可用时保持当前列表 */
    }
  }

  async function submitCustomInstallTarget(
    id: string,
    globalDir: string,
    projectDir: string,
  ) {
    try {
      setError('');
      await addInstallTarget({ id, globalDir, projectDir });
      notify(t('toast.customTargetAdded'));
      await refreshInstallTargets();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function submitAgentUpdate(
    id: string,
    globalDir: string,
    projectDir: string,
  ) {
    try {
      setError('');
      await updateInstallTarget(id, { globalDir, projectDir });
      notify(t('toast.agentUpdated'));
      await refreshInstallTargets();
      await loadInstalled();
      await loadSkills();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function deleteAgent(id: string) {
    try {
      setError('');
      await removeInstallTarget(id);
      setInstallTargets((targets) => targets.filter((target) => target !== id));
      notify(t('toast.agentRemoved'));
      await refreshInstallTargets();
      await loadInstalled();
      await loadSkills();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void loadSources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadTranslationConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void refreshInstallTargets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.location.hash = VIEW_KEYS[view];
  }, [view]);

  useEffect(() => {
    const handler = () => setView(viewFromHash());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  // 桌面端自动检测新版本
  useEffect(() => {
    if (!isDesktop) return;
    let cancelled = false;
    async function checkUpdate() {
      try {
        // 读取当前桌面应用版本
        const { getVersion } = await import('@tauri-apps/api/app');
        const currentVersion = await getVersion();
        if (cancelled) return;
        setCurrentAppVersion(currentVersion);

        const release = await fetchLatestRelease();
        if (cancelled || !release) return;
        if (compareSemver(release.version, currentVersion) > 0) {
          setUpdateAvailable(release);
        }
      } catch {
        // 检测失败时静默处理
      }
    }
    void checkUpdate();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktop]);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedQuery(query),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedInstalledQuery(installedQuery),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [installedQuery]);

  useEffect(() => {
    void loadSkills();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, debouncedQuery, tag]);

  useEffect(() => {
    const requestId = detailRequestId.current + 1;
    detailRequestId.current = requestId;
    if (!selected) {
      setDetail(null);
      setError((current) =>
        current === RAW_API.SKILL_NOT_FOUND ? '' : current,
      );
      return;
    }
    fetchSkillDetail(selected, source)
      .then((nextDetail) => {
        if (detailRequestId.current === requestId) {
          setDetail(nextDetail);
          setError((current) =>
            current === RAW_API.SKILL_NOT_FOUND ? '' : current,
          );
        }
      })
      .catch((err: Error) => {
        if (detailRequestId.current === requestId) {
          setDetail(null);
          setError(err.message);
        }
      });
  }, [selected, source]);

  useEffect(() => {
    void loadInstalled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, installedTarget, debouncedInstalledQuery]);

  const tags = useMemo(() => {
    const all = new Set<string>();
    for (const skill of skills) {
      skill.tags?.forEach((item) => {
        if (typeof item === 'string' && item.trim()) {
          all.add(item.trim());
        }
      });
    }
    return Array.from(all).sort();
  }, [skills]);

  const enabledSources = useMemo(
    () => sources.filter((item) => item.enabled),
    [sources],
  );

  const visibleInstalled = useMemo(
    () => installed.filter((item) => installedSkillMatches(item, installedQuery)),
    [installed, installedQuery],
  );

  const selectedSummary =
    skills.find((skill) => skill.name === selected) ?? null;
  const activeSkill = detail ?? selectedSummary;

  async function copyCommand() {
    await copyText(npxCommand(activeSkill, t('install.npxPlaceholder')));
    notify(t('toast.commandCopied'));
  }

  async function shareCommand() {
    if (!activeSkill) return;
    const unknown = t('common.unknown');
    const text = [
      `${t('share.skill')}: ${activeSkill.name}`,
      `${t('share.version')}: ${activeSkill.version ?? unknown}`,
      `${t('share.source')}: ${activeSkill.sourceName}`,
      `${t('share.tags')}: ${activeSkill.tags?.join(', ') ?? '-'}`,
      '',
      `${t('share.install')}:`,
      npxCommand(activeSkill, t('install.npxPlaceholder')),
    ].join('\n');
    await copyText(text);
    notify(t('toast.shareCopied'));
  }

  async function installSelected() {
    if (!activeSkill) return;
    try {
      await installSkill({
        identifier: activeSkill.name,
        source: activeSkill.sourceName,
        targets: installTargets,
        global: installScope === 'global',
        strategy: installStrategy,
      });
      notify(t('toast.installed'));
      await loadSkills();
      await loadInstalled();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function removeSkill(item: InstalledSkill) {
    try {
      await removeInstalledSkill(item.name, {
        target: item.target,
        scope: item.scope,
      });
      setConfirmRemove(null);
      notify(t('toast.removed'));
      await loadInstalled();
      await loadSkills();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function exportSkill(item: InstalledSkill) {
    try {
      const result = await exportInstalledSkill({
        name: item.name,
        target: item.target,
        scope: item.scope,
      });
      if (result.status === 'cancelled') {
        notify(t('toast.exportCancelled'));
        return;
      }
      notify(
        result.path ? t('toast.exportedTo', { path: result.path }) : t('toast.exported'),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function copyPackage(item: InstalledSkill) {
    try {
      await copyInstalledSkillPackage({
        name: item.name,
        target: item.target,
        scope: item.scope,
      });
      notify(t('toast.packageCopied'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function linkToolTargets(item: InstalledSkill, targets: string[]) {
    if (targets.length === 0) {
      notify(t('toast.chooseTarget'));
      return;
    }
    try {
      const result = await linkInstalledSkillTargets({
        name: item.name,
        target: item.target,
        scope: item.scope,
        targets,
      });
      const linked = result.results.filter((entry) => entry.status === 'linked').length;
      notify(
        linked > 0
          ? linked === 1
            ? t('toast.linkedSingle')
            : t('toast.linkedMulti', { count: linked })
          : t('toast.alreadyAvailable'),
      );
      await loadInstalled();
      await loadSkills();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function addSourceFromForm() {
    const name = sourceName.trim();
    const url = sourceUrl.trim();
    if (!name) {
      setError('Source name is required');
      return;
    }
    if (!url) {
      setError('Source URL is required');
      return;
    }
    try {
      setError('');
      const result = await addSource({ name, url });
      setSources(result.sources);
      setDefaultSource(result.defaultSource);
      setSource((current) => nextSelectableSource(result.sources, current));
      setSourceName('');
      setSourceUrl('');
      notify(t('toast.sourceAdded'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function restoreBuiltinsFromCatalog() {
    try {
      const result = await restoreBuiltinSources();
      setSources(result.sources);
      setDefaultSource(result.defaultSource);
      setSource((current) => nextSelectableSource(result.sources, current));
      notify(
        result.added.length > 0
          ? t('toast.addedBuiltin', { count: result.added.length })
          : t('toast.builtinPresent'),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function toggleSource(item: Source) {
    try {
      const result = await updateSource(item.name, { enabled: !item.enabled });
      const nextSource = nextSelectableSource(result.sources, source);
      setSources(result.sources);
      setDefaultSource(result.defaultSource);
      setSource(nextSource);
      notify(item.enabled ? t('toast.sourceDisabled') : t('toast.sourceEnabled'));
      await loadSkills(nextSource);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function toggleSourceMirror(item: Source) {
    if (!item.domesticMirror) {
      return;
    }
    try {
      const result = await updateSource(item.name, {
        domesticMirror: { enabled: !item.domesticMirror.enabled },
      });
      setSources(result.sources);
      setDefaultSource(result.defaultSource);
      notify(
        item.domesticMirror.enabled
          ? t('toast.mirrorDisabled')
          : t('toast.mirrorEnabled'),
      );
      await loadSkills(source);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function toggleAllSourceMirrors() {
    const mirrorSources = sources.filter((item) => item.domesticMirror);
    if (mirrorSources.length === 0) {
      notify(t('toast.noMirrors'));
      return;
    }
    const nextEnabled = !mirrorSources.every(
      (item) => item.domesticMirror?.enabled,
    );
    try {
      let nextSources = sources;
      let nextDefaultSource = defaultSource;
      for (const item of mirrorSources) {
        if (item.domesticMirror?.enabled === nextEnabled) {
          continue;
        }
        const result = await updateSource(item.name, {
          domesticMirror: { enabled: nextEnabled },
        });
        nextSources = result.sources;
        nextDefaultSource = result.defaultSource;
      }
      setSources(nextSources);
      setDefaultSource(nextDefaultSource);
      notify(nextEnabled ? t('toast.mirrorsOn') : t('toast.mirrorsOff'));
      await loadSkills(source);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function deleteSource(name: string) {
    try {
      const result = await removeSource(name);
      const nextSource = nextSelectableSource(result.sources, source);
      setSources(result.sources);
      setDefaultSource(result.defaultSource);
      setSource(nextSource);
      notify(t('toast.sourceRemoved'));
      await loadSkills(nextSource);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function refreshFromToolbar() {
    if (toolbarRefreshing) return;
    setToolbarRefreshing(true);
    try {
      await Promise.all([
        loadSkills(source, debouncedQuery, tag, true),
        loadInstalled(scope, installedTarget, debouncedInstalledQuery),
      ]);
    } finally {
      setToolbarRefreshing(false);
    }
  }

  const shellNoRail = view === 'skill-detail' || view === 'settings';

  return (
    <div className={shellNoRail ? 'app-shell app-shell--no-rail' : 'app-shell'}>
      <header
        className="topbar"
        data-tauri-drag-region
        onMouseDown={(event) => void startWindowDrag(event)}
      >
        <div className="brand" data-tauri-drag-region>
          <span className="brand-mark">
            <Icon name="terminal" />
          </span>
          <span data-tauri-drag-region>
            <strong>{t('brand.title')}</strong>
            <small>{t('brand.subtitle')}</small>
          </span>
        </div>
        <div className="topbar-main" data-tauri-drag-region>
          <div className="crumb" data-tauri-drag-region>
            <strong>{t('brand.title')}</strong>
            <span>/</span>
            <em>
              {view === 'library'
                ? t('crumb.viewLibrary')
                : view === 'installed'
                  ? t('crumb.viewInstalled')
                  : view === 'sources'
                    ? t('crumb.viewSources')
                    : view === 'skill-detail'
                      ? t('crumb.viewSkillDetail', { defaultValue: '技能详情' })
                      : view === 'download'
                        ? t('crumb.viewDownload', { defaultValue: '下载' })
                        : t('crumb.viewSettings', { defaultValue: '设置' })}
            </em>
          </div>
          <div className="topbar-actions">
            <select
              id="app-locale-select"
              className="locale-select"
              value={i18n.language === 'en' ? 'en' : 'zh'}
              onChange={(event) =>
                changeLanguageWithStorage(event.target.value as AppLocale)
              }
              aria-label={t('language.label')}
            >
              <option value="zh">{t('language.zh')}</option>
              <option value="en">{t('language.en')}</option>
            </select>
            <button
              className="icon-button"
              aria-label={t('topbar.settings', { defaultValue: '设置' })}
              title={t('topbar.settings', { defaultValue: '设置' })}
              onClick={openSettings}
            >
              <Icon name="settings" />
            </button>
            <button
              className={toolbarRefreshing ? 'icon-button refreshing' : 'icon-button'}
              aria-label={t('topbar.refresh')}
              title={t('topbar.refresh')}
              aria-busy={toolbarRefreshing}
              disabled={toolbarRefreshing}
              onClick={() => void refreshFromToolbar()}
            >
              <Icon name="refresh" />
            </button>
            {isDesktop ? (
              <div className="window-chrome" aria-label={t('topbar.windowControls')}>
                <button title={t('topbar.minimize')} onClick={() => void windowCommand('minimize')}>
                  <span />
                </button>
                <button title={t('topbar.maximize')} onClick={() => void windowCommand('toggleMaximize')}>
                  <i />
                </button>
                <button
                  className="close"
                  title={
                    settings.minimizeToTray
                      ? t('topbar.hideToTray', { defaultValue: '隐藏到托盘' })
                      : t('topbar.close')
                  }
                  onClick={() =>
                    void windowCommand(settings.minimizeToTray ? 'hide' : 'close')
                  }
                >
                  <b />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {!shellNoRail ? (
        <aside className="rail">
          <nav className="nav" aria-label={t('nav.primary')}>
            <NavButton active={view === 'library'} onClick={() => setView('library')} icon="database" label={t('nav.skills')} />
            <NavButton active={view === 'installed'} onClick={() => setView('installed')} icon="check" label={t('nav.installed')} />
            <NavButton active={view === 'sources'} onClick={() => setView('sources')} icon="terminal" label={t('nav.sources')} />
            <NavButton
              active={view === 'download'}
              onClick={() => setView('download')}
              icon="download"
              label={t('nav.download', { defaultValue: '下载' })}
              badge={updateAvailable && !updateDismissed ? true : undefined}
            />
          </nav>
          <div className="rail-status">
            <span>{t('rail.indexLabel')}</span>
            <strong><i /> {t('rail.ready')}</strong>
          </div>
        </aside>
      ) : null}

      <main
        className={
          view === 'skill-detail' ? 'workspace workspace--skill-detail' : 'workspace'
        }
      >
        {updateAvailable && !updateDismissed && isDesktop ? (
          <UpdateBanner
            release={updateAvailable}
            currentVersion={currentAppVersion ?? ''}
            onDismiss={() => setUpdateDismissed(true)}
            onGoDownload={() => { setUpdateDismissed(true); setView('download'); }}
          />
        ) : null}
        {error ? <ErrorState message={translateApiError(t, error)} /> : null}
        {view === 'library' ? (
          <LibraryView
            detail={detail}
            installScope={installScope}
            installStrategy={installStrategy}
            installTargets={installTargets}
            installTargetRows={installTargetRows}
            loading={loading}
            onCopyCommand={copyCommand}
            onInstall={installSelected}
            onInstallScopeChange={setInstallScope}
            onInstallStrategyChange={setInstallStrategy}
            onInstallTargetsChange={setInstallTargets}
            onManageAgents={openSettings}
            onOpenDetail={openSkillDetail}
            onQueryChange={setQuery}
            onSelect={setSelected}
            onShare={shareCommand}
            onSourceChange={setSource}
            onTagChange={setTag}
            query={query}
            selected={selected}
            selectedSummary={selectedSummary}
            skills={skills}
            source={source}
            sourceWarnings={sourceWarnings}
            sources={enabledSources}
            tag={tag}
            tags={tags}
            translationConfig={translationConfig}
          />
        ) : null}

        {view === 'skill-detail' ? (
          <SkillDetailView
            skillName={detailSkillName}
            source={source}
            translationConfig={translationConfig}
            onBack={() => setView(prevView)}
          />
        ) : null}

        {view === 'installed' ? (
          <InstalledView
            confirmRemove={confirmRemove}
            installTargetRows={installTargetRows}
            installed={visibleInstalled}
            loading={installedLoading}
            onConfirmRemove={setConfirmRemove}
            onCopyPackage={copyPackage}
            onExport={exportSkill}
            onLinkTargets={linkToolTargets}
            onQueryChange={setInstalledQuery}
            onRemove={removeSkill}
            onScopeChange={setScope}
            onTargetChange={setInstalledTarget}
            query={installedQuery}
            scope={scope}
            target={installedTarget}
          />
        ) : null}

        {view === 'sources' ? (
          <SourcesView
            defaultSource={defaultSource}
            name={sourceName}
            onAdd={addSourceFromForm}
            onDelete={deleteSource}
            onNameChange={setSourceName}
            onRestore={restoreBuiltinsFromCatalog}
            onToggleAllMirrors={toggleAllSourceMirrors}
            onToggleMirror={toggleSourceMirror}
            onToggle={toggleSource}
            onUrlChange={setSourceUrl}
            refreshing={loading}
            sources={sources}
            url={sourceUrl}
          />
        ) : null}

        {view === 'settings' ? (
          <SettingsView
            installTargetRows={installTargetRows}
            library={skillLibrary}
            onAdd={submitCustomInstallTarget}
            onBack={() => setView(prevView)}
            onDelete={deleteAgent}
            onRefresh={refreshInstallTargets}
            onSettingsChange={saveSettings}
            onTranslationSave={saveTranslationConfig}
            onUpdate={submitAgentUpdate}
            settings={settings}
            translationConfig={translationConfig}
          />
        ) : null}

        {view === 'download' ? (
          <DownloadView
            currentVersion={currentAppVersion}
            isDesktop={isDesktop}
          />
        ) : null}
      </main>

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

function NavButton({
  active,
  badge,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  badge?: boolean;
  icon: keyof typeof icons;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={active ? 'active' : ''}
      onClick={onClick}
      type="button"
    >
      <span className="nav-icon-wrap">
        <Icon name={icon} />
        {badge ? <span className="nav-badge" aria-label="有更新" /> : null}
      </span>
      <span>{label}</span>
    </button>
  );
}

function useResponsiveSkillColumns(): number {
  const [columns, setColumns] = useState(3);

  useEffect(() => {
    function updateColumns() {
      if (window.innerWidth <= 760) {
        setColumns(1);
      } else if (window.innerWidth <= 1180) {
        setColumns(2);
      } else {
        setColumns(3);
      }
    }

    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, []);

  return columns;
}

function useVirtualRows(
  scrollRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  options: {
    columns: number;
    gap: number;
    itemCount: number;
    overscanRows?: number;
    resetKey: string;
    rowHeight: number;
  },
) {
  const {
    columns,
    gap,
    itemCount,
    overscanRows = VIRTUAL_OVERSCAN_ROWS,
    resetKey,
    rowHeight,
  } = options;
  const [viewport, setViewport] = useState({ height: 720, scrollTop: 0 });

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    function updateViewport() {
      const scrollStyle = window.getComputedStyle(scrollEl);
      const usesPageScroll = scrollStyle.overflowY === 'visible';
      const contentEl = contentRef.current;
      const next = usesPageScroll
        ? {
            height: window.innerHeight,
            scrollTop: Math.max(0, -(contentEl?.getBoundingClientRect().top ?? 0)),
          }
        : {
            height: scrollEl.clientHeight,
            scrollTop: Math.max(0, scrollEl.scrollTop - (contentEl?.offsetTop ?? 0)),
          };
      setViewport((current) =>
        current.height === next.height && current.scrollTop === next.scrollTop
          ? current
          : next,
      );
    }

    updateViewport();
    scrollEl.addEventListener('scroll', updateViewport, { passive: true });
    window.addEventListener('scroll', updateViewport, { passive: true });
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(updateViewport);
    observer?.observe(scrollEl);
    if (contentRef.current) {
      observer?.observe(contentRef.current);
    }
    window.addEventListener('resize', updateViewport);
    return () => {
      scrollEl.removeEventListener('scroll', updateViewport);
      window.removeEventListener('scroll', updateViewport);
      observer?.disconnect();
      window.removeEventListener('resize', updateViewport);
    };
  }, [contentRef, resetKey, scrollRef]);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    scrollEl.scrollTop = 0;
    setViewport((current) => ({ ...current, scrollTop: 0 }));
  }, [resetKey, scrollRef]);

  const totalRows = Math.ceil(itemCount / columns);
  const rowStride = rowHeight + gap;
  const totalHeight =
    totalRows === 0 ? 0 : totalRows * rowHeight + (totalRows - 1) * gap;
  const startRow =
    totalRows === 0
      ? 0
      : Math.max(0, Math.floor(viewport.scrollTop / rowStride) - overscanRows);
  const endRow =
    totalRows === 0
      ? 0
      : Math.min(
          totalRows,
          Math.ceil((viewport.scrollTop + viewport.height) / rowStride) +
            overscanRows,
        );

  return {
    endRow,
    startRow,
    totalHeight,
    translateY: startRow * rowStride,
  };
}

function LibraryView(props: {
  detail: SkillDetail | null;
  installScope: LocationScope;
  installStrategy: InstallStrategy;
  installTargets: string[];
  installTargetRows: InstallTargetOption[];
  loading: boolean;
  onCopyCommand: () => void;
  onInstall: () => void;
  onInstallScopeChange: (value: LocationScope) => void;
  onInstallStrategyChange: (value: InstallStrategy) => void;
  onInstallTargetsChange: (value: string[]) => void;
  onManageAgents: () => void;
  onOpenDetail: (name: string) => void;
  onQueryChange: (value: string) => void;
  onSelect: (value: string) => void;
  onShare: () => void;
  onSourceChange: (value: string) => void;
  onTagChange: (value: string) => void;
  query: string;
  selected: string;
  selectedSummary: SkillSummary | null;
  skills: SkillSummary[];
  source: string;
  sourceWarnings: SourceWarning[];
  sources: Source[];
  tag: string;
  tags: string[];
  translationConfig: TranslationConfig;
}) {
  const { t } = useTranslation();
  const activeSkill = props.detail ?? props.selectedSummary;
  const unknown = t('common.unknown');
  const visibleInstallTargets = props.installTargetRows.filter((row) => !row.hidden);
  const targetRows =
    visibleInstallTargets.length > 0
      ? visibleInstallTargets
      : [
          { id: 'claude', label: 'Claude Code' },
          { id: 'cursor', label: 'Cursor' },
          { id: 'codex', label: 'OpenAI Codex' },
        ];
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const virtualRef = useRef<HTMLDivElement | null>(null);
  const columnCount = useResponsiveSkillColumns();
  const virtual = useVirtualRows(scrollRef, virtualRef, {
    columns: columnCount,
    gap: SKILL_GRID_GAP,
    itemCount: props.skills.length,
    resetKey: `${props.query}\0${props.source}\0${props.tag}\0${props.skills.length}`,
    rowHeight: SKILL_CARD_HEIGHT,
  });
  const virtualRows: number[] = [];
  for (let row = virtual.startRow; row < virtual.endRow; row += 1) {
    virtualRows.push(row);
  }

  return (
    <section className="console-grid">
      <div className="library">
        <div className="library-controls">
          <div className="toolbar">
            <label className="search">
              <Icon name="search" />
              <input
                value={props.query}
                onChange={(event) => props.onQueryChange(event.target.value)}
                placeholder={t('library.searchPlaceholder')}
              />
            </label>
            <select
              value={props.source}
              onChange={(event) => props.onSourceChange(event.target.value)}
            >
              <option value="all">{t('library.allEnabled')}</option>
              {props.sources.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <TagRow active={props.tag} tags={props.tags} onChange={props.onTagChange} />
        </div>

        <div className="library-scroll" ref={scrollRef}>
          <SourceWarnings warnings={props.sourceWarnings} />
          {props.loading ? (
            <EmptyState>{t('library.loading')}</EmptyState>
          ) : null}
          {!props.loading && props.skills.length === 0 ? (
            <EmptyState>
              {props.sources.length === 0
                ? t('library.emptyNoSources')
                : props.sourceWarnings.length > 0
                  ? t('library.emptyUnreachable')
                  : t('library.emptyNoMatch')}
            </EmptyState>
          ) : null}

          <div
            className="skill-virtual-space"
            ref={virtualRef}
            style={{ height: virtual.totalHeight }}
          >
            <div
              className="skill-virtual-items"
              style={{ transform: `translateY(${virtual.translateY}px)` }}
            >
              {virtualRows.map((row) => {
                const rowSkills = props.skills.slice(
                  row * columnCount,
                  row * columnCount + columnCount,
                );
                return (
                  <div
                    className="skill-grid skill-virtual-row"
                    key={row}
                    style={{
                      gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                    }}
                  >
                    {rowSkills.map((skill) => {
                      const skillTags = Array.isArray(skill.tags)
                        ? skill.tags
                        : [];
                      return (
                        <button
                          className={`skill-card ${props.selected === skill.name ? 'selected' : ''}`}
                          key={`${skill.sourceName}:${skill.name}`}
                          onClick={() => props.onSelect(skill.name)}
                        >
                          <span className="skill-card-head">
                            <span className="skill-icon">
                              <Icon name={skill.installed ? 'check' : 'database'} />
                            </span>
                            <em>
                              {highlightText(
                                skill.installed
                                  ? t('library.installedBadge')
                                  : t('library.versionPrefix', {
                                      version: skill.version ?? unknown,
                                    }),
                                props.query,
                              )}
                            </em>
                          </span>
                          <strong>{highlightText(skill.name, props.query)}</strong>
                          <span>
                            {highlightText(
                              skill.description || t('library.noDescription'),
                              props.query,
                            )}
                          </span>
                          <span className="card-tags">
                            {skillTags.slice(0, 4).map((item) => (
                              <i key={item}>{highlightText(item, props.query)}</i>
                            ))}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <aside className="detail">
        <div className="detail-hero">
          <h1>{activeSkill?.name ?? t('library.detailTitle')}</h1>
          <p>{activeSkill?.description ?? t('library.selectSkill')}</p>
        </div>
        <div className="detail-body">
          <div className="action-row">
            <button className="button primary" onClick={props.onInstall} disabled={!activeSkill}>
              <Icon name="package" />
              {t('library.install')}
            </button>
            <button className="button" onClick={props.onCopyCommand} disabled={!activeSkill}>
              <Icon name="copy" />
              {t('library.copy')}
            </button>
            <button className="button" onClick={props.onShare} disabled={!activeSkill}>
              {t('library.share')}
            </button>
            <button
              className="button"
              onClick={() => activeSkill && props.onOpenDetail(activeSkill.name)}
              disabled={!activeSkill}
              title="查看完整详情（文件浏览器）"
            >
              <Icon name="folder" />
              详情
            </button>
          </div>
          <div className="install-options">
            <div className="target-checkboxes">
              {targetRows.map((row) => (
                <label key={row.id} className="target-checkbox">
                  <input
                    type="checkbox"
                    checked={props.installTargets.includes(row.id)}
                    onChange={(event) => {
                      if (event.target.checked) {
                        props.onInstallTargetsChange([...props.installTargets, row.id]);
                      } else {
                        props.onInstallTargetsChange(
                          props.installTargets.filter((x) => x !== row.id),
                        );
                      }
                    }}
                  />
                  <span>
                    {t(`installTarget.${row.id}`, { defaultValue: row.label })}
                  </span>
                </label>
              ))}
            </div>
            <button
              type="button"
              className="button block"
              onClick={props.onManageAgents}
            >
              <Icon name="settings" />
              {t('library.manageAgents')}
            </button>
            <p className="install-options-hint">{t('library.installTargetHint')}</p>
            <div className="install-options-selects">
              <select
                value={props.installScope}
                onChange={(event) =>
                  props.onInstallScopeChange(event.target.value as LocationScope)
                }
              >
                <option value="global">{t('library.scopeGlobal')}</option>
                <option value="project">{t('library.scopeProject')}</option>
              </select>
              <select
                value={props.installStrategy}
                onChange={(event) =>
                  props.onInstallStrategyChange(event.target.value as InstallStrategy)
                }
              >
                <option value="skip">{t('library.strategySkip')}</option>
                <option value="overwrite">{t('library.strategyOverwrite')}</option>
                <option value="rename">{t('library.strategyRename')}</option>
              </select>
            </div>
          </div>
          <div className="meta-table">
            <Info label={t('library.metaVersion')} value={activeSkill?.version} />
            <Info label={t('library.metaAuthor')} value={activeSkill?.author} />
            <Info label={t('library.metaSource')} value={activeSkill?.sourceName} />
            <Info
              label={t('library.metaTargets')}
              value={
                props.detail?.installedTargets.join(', ') || t('library.notInstalled')
              }
            />
            <Info
              label={t('library.metaMetadata')}
              value={
                activeSkill?.metadataSource
                  ? t(`metadataSource.${activeSkill.metadataSource}`, {
                      defaultValue: activeSkill.metadataSource,
                    })
                  : undefined
              }
            />
          </div>
          <TranslateMarkdownView
            markdown={props.detail?.markdown ?? ''}
            cacheKey={activeSkill ? `translate:skill:${activeSkill.name}:SKILL.md` : ''}
            translationConfig={props.translationConfig}
          />
        </div>
      </aside>
    </section>
  );
}

function TagRow({
  active,
  tags,
  onChange,
}: {
  active: string;
  tags: string[];
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const orderedTags =
    active && tags.includes(active)
      ? [active, ...tags.filter((item) => item !== active)]
      : tags;
  const visibleLimit = 4;
  const visibleTags = orderedTags.slice(0, visibleLimit);
  const overflowTags = orderedTags.slice(visibleLimit);
  const isCollapsible = overflowTags.length > 0;

  return (
    <div className={`tag-row-frame ${isCollapsible ? 'is-collapsible' : ''}`}>
      <div className="tag-row">
        <button className={active === '' ? 'active' : ''} onClick={() => onChange('')}>
          {t('common.all')}
        </button>
        {visibleTags.map((item) => (
          <button
            className={active === item ? 'active' : ''}
            key={item}
            onClick={() => onChange(item)}
          >
            {item}
          </button>
        ))}
        {isCollapsible ? (
          <button
            aria-haspopup="true"
            aria-label={t('tags.showMore', { count: overflowTags.length })}
            className="tag-overflow-trigger"
            type="button"
          >
            +{overflowTags.length}
          </button>
        ) : null}
      </div>
      {isCollapsible ? (
        <div className="tag-overflow-panel">
          {overflowTags.map((item) => (
            <button
              className={active === item ? 'active' : ''}
              key={item}
              onClick={() => onChange(item)}
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function InstalledView(props: {
  confirmRemove: string | null;
  installTargetRows: InstallTargetOption[];
  installed: InstalledSkill[];
  loading: boolean;
  onConfirmRemove: (value: string | null) => void;
  onCopyPackage: (item: InstalledSkill) => void;
  onExport: (item: InstalledSkill) => void;
  onLinkTargets: (item: InstalledSkill, targets: string[]) => void;
  onQueryChange: (value: string) => void;
  onRemove: (item: InstalledSkill) => void;
  onScopeChange: (value: ScopeFilter) => void;
  onTargetChange: (value: string) => void;
  query: string;
  scope: ScopeFilter;
  target: string;
}) {
  const { t } = useTranslation();
  const unknown = t('common.unknown');
  const [linkTargetKey, setLinkTargetKey] = useState<string | null>(null);
  const [linkSelections, setLinkSelections] = useState<Record<string, string[]>>({});
  const visibleInstallTargets = props.installTargetRows.filter((row) => !row.hidden);
  const linkTargetIds =
    visibleInstallTargets.length > 0
      ? visibleInstallTargets.map((row) => row.id)
      : ['claude', 'cursor', 'codex'];

  function linkOptionsFor(item: InstalledSkill): string[] {
    return linkTargetIds.filter((target) => target !== item.target);
  }

  function defaultLinkTargets(item: InstalledSkill): string[] {
    const preferred = ['cursor', 'codex'].filter(
      (target) => target !== item.target && linkTargetIds.includes(target),
    );
    return preferred.length > 0 ? preferred : linkOptionsFor(item).slice(0, 1);
  }

  function selectedLinkTargets(key: string, item: InstalledSkill): string[] {
    return linkSelections[key] ?? defaultLinkTargets(item);
  }

  function toggleLinkTarget(key: string, item: InstalledSkill, target: string): void {
    const selected = selectedLinkTargets(key, item);
    const next = selected.includes(target)
      ? selected.filter((entry) => entry !== target)
      : [...selected, target];
    setLinkSelections((current) => ({ ...current, [key]: next }));
  }

  function openLinkPicker(key: string, item: InstalledSkill): void {
    if (linkTargetKey === key) {
      setLinkTargetKey(null);
      return;
    }
    setLinkTargetKey(key);
    setLinkSelections((current) => ({
      ...current,
      [key]: current[key] ?? defaultLinkTargets(item),
    }));
    props.onConfirmRemove(null);
  }

  return (
    <section className="installed-page">
      <div className="page-head">
        <h1>{t('installed.title')}</h1>
      </div>
      <div className="toolbar installed-toolbar">
        <label className="search">
          <Icon name="search" />
          <input
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder={t('installed.searchPlaceholder')}
          />
        </label>
        <select
          value={props.target}
          onChange={(event) => props.onTargetChange(event.target.value)}
        >
          <option value="">{t('installed.allTargets')}</option>
          {linkTargetIds.map((targetId) => (
            <option key={targetId} value={targetId}>
              {t(`installTarget.${targetId}`, {
                defaultValue:
                  props.installTargetRows.find((r) => r.id === targetId)?.label ??
                  targetId,
              })}
            </option>
          ))}
        </select>
        <select
          value={props.scope}
          onChange={(event) => props.onScopeChange(event.target.value as ScopeFilter)}
        >
          <option value="all">{t('installed.allLocations')}</option>
          <option value="project">{t('installed.scopeWorkspace')}</option>
          <option value="global">{t('installed.scopeUser')}</option>
        </select>
      </div>

      {props.loading ? <EmptyState>{t('installed.scanning')}</EmptyState> : null}
      {!props.loading && props.installed.length === 0 ? (
        <EmptyState>{t('installed.empty')}</EmptyState>
      ) : null}

      <div className="installed-scroll">
        <div className="installed-list">
          {props.installed.map((item) => {
            const key = `${item.scope}:${item.target}:${item.name}`;
            const confirming = props.confirmRemove === key;
            const pickingTargets = linkTargetKey === key;
            const linkOptions = linkOptionsFor(item);
            const selectedTargets = selectedLinkTargets(key, item);
            return (
              <article key={key}>
                <div className="installed-main">
                  <strong>{highlightText(item.name, props.query)}</strong>
                  <span>
                    {highlightText(item.description || t('library.noDescription'), props.query)}
                  </span>
                  <code>{highlightText(item.path, props.query)}</code>
                </div>
                <div className="installed-meta">
                  <b>{highlightText(item.target, props.query)}</b>
                  <span>
                    {highlightText(
                      t(`installed.scope.${item.scope}` as 'installed.scope.global'),
                      props.query,
                    )}
                  </span>
                  <span>{highlightText(item.version ?? unknown, props.query)}</span>
                </div>
                <div className="installed-actions">
                  <button
                    className="icon-button"
                    title={t('installed.copyZipTitle')}
                    onClick={() => props.onCopyPackage(item)}
                  >
                    <Icon name="copy" />
                  </button>
                  <button
                    className="icon-button"
                    title={t('installed.linkTargetsTitle')}
                    onClick={() => openLinkPicker(key, item)}
                  >
                    <Icon name="link" />
                  </button>
                  <button
                    className="icon-button"
                    title={t('installed.exportZipTitle')}
                    onClick={() => props.onExport(item)}
                  >
                    <Icon name="package" />
                  </button>
                  <button
                    className="icon-button danger"
                    title={t('installed.confirmRemoveTitle')}
                    onClick={() => {
                      setLinkTargetKey(null);
                      props.onConfirmRemove(confirming ? null : key);
                    }}
                  >
                    <Icon name="trash" />
                  </button>
                </div>
                {pickingTargets ? (
                  <div className="choice-strip">
                    <span>{t('installed.enableIn')}</span>
                    <div className="choice-options">
                      {linkOptions.map((target) => (
                        <label key={target} className="target-checkbox">
                          <input
                            type="checkbox"
                            checked={selectedTargets.includes(target)}
                            onChange={() => toggleLinkTarget(key, item, target)}
                          />
                          <span>
                            {t(`installTarget.${target}`, {
                              defaultValue:
                                props.installTargetRows.find((r) => r.id === target)
                                  ?.label ?? target,
                            })}
                          </span>
                        </label>
                      ))}
                    </div>
                    <button
                      className="button primary"
                      disabled={selectedTargets.length === 0}
                      onClick={() => {
                        props.onLinkTargets(item, selectedTargets);
                        setLinkTargetKey(null);
                      }}
                    >
                      {t('installed.apply')}
                    </button>
                    <button className="button" onClick={() => setLinkTargetKey(null)}>
                      {t('installed.cancel')}
                    </button>
                  </div>
                ) : null}
                {confirming ? (
                  <div className="confirm-strip">
                    <span>
                      {t('installed.confirmDelete', {
                        name: item.name,
                        target: item.target,
                        scope: t(`installed.scope.${item.scope}` as 'installed.scope.global'),
                        path: item.path,
                      })}
                    </span>
                    <button className="button danger" onClick={() => props.onRemove(item)}>
                      {t('installed.delete')}
                    </button>
                    <button className="button" onClick={() => props.onConfirmRemove(null)}>
                      {t('installed.cancel')}
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function AgentsView({
  installTargetRows,
  library,
  onAdd,
  onDelete,
  onRefresh,
  onUpdate,
}: {
  installTargetRows: InstallTargetOption[];
  library: SkillLibraryTarget | null;
  onAdd: (id: string, globalDir: string, projectDir: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onUpdate: (id: string, globalDir: string, projectDir: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [newId, setNewId] = useState('');
  const [newGlobalDir, setNewGlobalDir] = useState('~/.my-agent/skills');
  const [newProjectDir, setNewProjectDir] = useState('./.my-agent/skills');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editGlobalDir, setEditGlobalDir] = useState('');
  const [editProjectDir, setEditProjectDir] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const visibleRows = installTargetRows.filter((row) => row.id !== 'agents');

  function beginEdit(row: InstallTargetOption) {
    setConfirmDelete(null);
    setEditingId(row.id);
    setEditGlobalDir(row.globalDir ?? '');
    setEditProjectDir(row.projectDir ?? '');
  }

  async function submitNewAgent() {
    await onAdd(newId.trim(), newGlobalDir.trim(), newProjectDir.trim());
    setNewId('');
  }

  async function submitEdit(id: string) {
    await onUpdate(id, editGlobalDir.trim(), editProjectDir.trim());
    setEditingId(null);
  }

  return (
    <section className="installed-page agents-page">
      <div className="page-head">
        <div>
          <h1>{t('agents.title')}</h1>
          <p>{t('agents.subtitle')}</p>
        </div>
        <button className="button" onClick={() => void onRefresh()}>
          <Icon name="refresh" />
          {t('agents.rescan')}
        </button>
      </div>

      <div className="library-location">
        <span className="library-location-icon">
          <Icon name="database" />
        </span>
        <div>
          <strong>{t('agents.libraryTitle')}</strong>
          <p>{t('agents.libraryHint')}</p>
        </div>
        <div className="agent-paths">
          <span>
            <b>{t('agents.globalDir')}</b>
            <code>{library?.globalDir ?? '~/.agents/skills'}</code>
            <i>{library?.globalExists ? t('agents.pathReady') : t('agents.pathMissing')}</i>
          </span>
          <span>
            <b>{t('agents.projectDir')}</b>
            <code>{library?.projectDir ?? './.agents/skills'}</code>
            <i>{library?.projectExists ? t('agents.pathReady') : t('agents.pathMissing')}</i>
          </span>
        </div>
      </div>

      <div className="source-form agent-form">
        <label>
          <span>{t('agents.idLabel')}</span>
          <input
            value={newId}
            onChange={(event) => setNewId(event.target.value)}
            placeholder={t('agents.idPlaceholder')}
          />
        </label>
        <label>
          <span>{t('agents.globalDir')}</span>
          <input
            value={newGlobalDir}
            onChange={(event) => setNewGlobalDir(event.target.value)}
            placeholder="~/.my-agent/skills"
          />
        </label>
        <label>
          <span>{t('agents.projectDir')}</span>
          <input
            value={newProjectDir}
            onChange={(event) => setNewProjectDir(event.target.value)}
            placeholder="./.my-agent/skills"
          />
        </label>
        <button
          className="button primary"
          disabled={!newId.trim()}
          onClick={() => void submitNewAgent()}
        >
          {t('agents.add')}
        </button>
      </div>

      <div className="source-list agent-list">
        {visibleRows.map((row) => {
          const editing = editingId === row.id;
          const deleting = confirmDelete === row.id;
          return (
            <article key={row.id}>
              <div className="source-main">
                <strong>
                  <span>{t(`installTarget.${row.id}`, { defaultValue: row.label })}</span>
                  <span className="source-tags">
                    <i>{row.builtin ? t('agents.builtin') : t('agents.custom')}</i>
                    {row.hidden ? <i>{t('agents.hidden')}</i> : null}
                    <i>
                      {row.globalExists || row.projectExists
                        ? t('agents.detected')
                        : t('agents.configured')}
                    </i>
                  </span>
                </strong>
                <span className="source-description">
                  {t('agents.agentHint', { id: row.id })}
                </span>
                <div className="agent-paths">
                  <span>
                    <b>{t('agents.globalDir')}</b>
                    <code>{row.globalDir ?? '-'}</code>
                    <i>{row.globalExists ? t('agents.pathReady') : t('agents.pathMissing')}</i>
                  </span>
                  <span>
                    <b>{t('agents.projectDir')}</b>
                    <code>{row.projectDir ?? '-'}</code>
                    <i>{row.projectExists ? t('agents.pathReady') : t('agents.pathMissing')}</i>
                  </span>
                </div>
                <span className="source-key">{row.id}</span>
              </div>
              <span className={row.globalExists || row.projectExists ? 'source-status on' : 'source-status'}>
                {row.globalExists || row.projectExists
                  ? t('agents.detected')
                  : t('agents.configured')}
              </span>
              <div className="source-actions">
                <button className="button" onClick={() => beginEdit(row)}>
                  {t('agents.edit')}
                </button>
                <button
                  className="button danger"
                  disabled={!row.removable}
                  onClick={() => {
                    setEditingId(null);
                    setConfirmDelete(deleting ? null : row.id);
                  }}
                  title={!row.removable ? t('agents.deleteDisabled') : undefined}
                >
                  {t('agents.delete')}
                </button>
              </div>

              {editing ? (
                <div className="agent-edit-strip">
                  <label>
                    <span>{t('agents.globalDir')}</span>
                    <input
                      value={editGlobalDir}
                      onChange={(event) => setEditGlobalDir(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>{t('agents.projectDir')}</span>
                    <input
                      value={editProjectDir}
                      onChange={(event) => setEditProjectDir(event.target.value)}
                    />
                  </label>
                  <button className="button primary" onClick={() => void submitEdit(row.id)}>
                    {t('agents.save')}
                  </button>
                  <button className="button" onClick={() => setEditingId(null)}>
                    {t('installed.cancel')}
                  </button>
                </div>
              ) : null}

              {deleting ? (
                <div className="confirm-strip source-confirm-strip">
                  <span>{t('agents.confirmDelete', { name: row.label })}</span>
                  <button
                    className="button danger"
                    onClick={async () => {
                      await onDelete(row.id);
                      setConfirmDelete(null);
                    }}
                  >
                    {t('agents.delete')}
                  </button>
                  <button className="button" onClick={() => setConfirmDelete(null)}>
                    {t('installed.cancel')}
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SettingsView({
  installTargetRows,
  library,
  onAdd,
  onBack,
  onDelete,
  onRefresh,
  onSettingsChange,
  onTranslationSave,
  onUpdate,
  settings,
  translationConfig,
}: {
  installTargetRows: InstallTargetOption[];
  library: SkillLibraryTarget | null;
  onAdd: (id: string, globalDir: string, projectDir: string) => Promise<void>;
  onBack: () => void;
  onDelete: (id: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onSettingsChange: (settings: Partial<AppSettings>) => Promise<void>;
  onTranslationSave: (config: TranslationConfig) => Promise<void>;
  onUpdate: (id: string, globalDir: string, projectDir: string) => Promise<void>;
  settings: AppSettings;
  translationConfig: TranslationConfig;
}) {
  const { t } = useTranslation();
  const tt = (key: string, defaultValue: string) => t(key, { defaultValue });
  const [translationDraft, setTranslationDraft] =
    useState<TranslationConfig>(translationConfig);
  const [translationSaving, setTranslationSaving] = useState(false);

  useEffect(() => {
    setTranslationDraft(translationConfig);
  }, [translationConfig]);

  return (
    <section className="settings-page" aria-label={tt('settings.title', '\u8bbe\u7f6e')}>
      <div className="settings-sheet">
        <div className="settings-head">
          <button type="button" className="button settings-back-btn" onClick={onBack}>
            <Icon name="arrow-left" />
            {tt('settings.back', '\u8fd4\u56de')}
          </button>
          <div className="settings-head-text">
            <h1>{tt('settings.title', '\u8bbe\u7f6e')}</h1>
            <p>
              {tt(
                'settings.subtitle',
                '\u7ba1\u7406\u6e90\u7f13\u5b58\u3001\u684c\u9762\u884c\u4e3a\u548c Agent \u76ee\u6807\u4f4d\u7f6e\u3002',
              )}
            </p>
          </div>
        </div>

        <div className="settings-group">
          <h2>{tt('settings.refreshTitle', '\u6e90\u7f13\u5b58')}</h2>
          <label className="settings-row">
            <span>
              <b>{tt('settings.refreshInterval', '\u68c0\u67e5\u95f4\u9694')}</b>
              <em>
                {tt(
                  'settings.refreshHint',
                  '\u641c\u7d22\u4f1a\u4f18\u5148\u4f7f\u7528\u672c\u5730\u7f13\u5b58\uff0c\u8d85\u8fc7\u95f4\u9694\u624d\u68c0\u67e5\u8fdc\u7aef\uff1b\u624b\u52a8\u5237\u65b0\u59cb\u7ec8\u7acb\u5373\u68c0\u67e5\u3002',
                )}
              </em>
            </span>
            <select
              value={settings.sourceRefreshIntervalMinutes}
              onChange={(event) =>
                void onSettingsChange({
                  sourceRefreshIntervalMinutes: Number(event.target.value),
                })
              }
            >
              <option value={0}>{tt('settings.refreshAlways', '\u6bcf\u6b21\u641c\u7d22')}</option>
              <option value={5}>{tt('settings.refresh5', '\u6bcf 5 \u5206\u949f')}</option>
              <option value={15}>{tt('settings.refresh15', '\u6bcf 15 \u5206\u949f')}</option>
              <option value={60}>{tt('settings.refresh60', '\u6bcf\u5c0f\u65f6')}</option>
            </select>
          </label>
        </div>

        <div className="settings-group">
          <h2>{tt('settings.desktopTitle', '\u684c\u9762\u7aef')}</h2>
          <label className="settings-row">
            <span>
              <b>{tt('settings.minimizeToTray', '\u5173\u95ed\u5230\u6258\u76d8')}</b>
              <em>
                {tt(
                  'settings.minimizeToTrayHint',
                  '\u70b9\u51fb\u5173\u95ed\u6309\u94ae\u65f6\u9690\u85cf\u7a97\u53e3\uff0c\u53ef\u4ece\u6258\u76d8\u56fe\u6807\u6062\u590d\u3002',
                )}
              </em>
            </span>
            <input
              type="checkbox"
              checked={settings.minimizeToTray}
              onChange={(event) =>
                void onSettingsChange({ minimizeToTray: event.target.checked })
              }
            />
          </label>
        </div>

        <div className="settings-group">
          <h2>{tt('settings.translationTitle', '翻译服务')}</h2>
          <p className="settings-hint">
            {tt(
              'settings.translationHint',
              '修改后请点击「保存翻译设置」写入配置文件，不会在输入时自动保存。',
            )}
          </p>
          <label className="settings-row">
            <span>
              <b>{tt('settings.translationProvider', '翻译提供商')}</b>
              <em>{tt('settings.translationProviderHint', '选择翻译英文 Skill 内容所使用的服务')}</em>
            </span>
            <select
              value={translationDraft.provider}
              onChange={(event) =>
                setTranslationDraft((d) => ({
                  ...d,
                  provider: event.target.value as TranslationConfig['provider'],
                }))
              }
            >
              <option value="none">{tt('settings.translationNone', '不启用')}</option>
              <option value="openai">{tt('settings.translationOpenai', 'OpenAI 兼容 API')}</option>
              <option value="cli">{tt('settings.translationCli', '本地 AI CLI 命令')}</option>
            </select>
          </label>

          {translationDraft.provider === 'openai' ? (
            <>
              <label className="settings-row">
                <span>
                  <b>{tt('settings.translationApiUrl', 'API 地址')}</b>
                  <em>{tt('settings.translationApiUrlHint', '留空使用 OpenAI 默认地址')}</em>
                </span>
                <input
                  type="text"
                  placeholder="https://api.openai.com/v1"
                  value={translationDraft.apiBaseUrl ?? ''}
                  onChange={(event) =>
                    setTranslationDraft((d) => ({ ...d, apiBaseUrl: event.target.value }))
                  }
                />
              </label>
              <label className="settings-row">
                <span><b>{tt('settings.translationApiKey', 'API Key')}</b></span>
                <input
                  type="password"
                  placeholder="sk-..."
                  value={translationDraft.apiKey ?? ''}
                  onChange={(event) =>
                    setTranslationDraft((d) => ({ ...d, apiKey: event.target.value }))
                  }
                />
              </label>
              <label className="settings-row">
                <span>
                  <b>{tt('settings.translationModel', '模型')}</b>
                  <em>{tt('settings.translationModelHint', '留空使用 gpt-4o-mini')}</em>
                </span>
                <input
                  type="text"
                  placeholder="gpt-4o-mini"
                  value={translationDraft.model ?? ''}
                  onChange={(event) =>
                    setTranslationDraft((d) => ({ ...d, model: event.target.value }))
                  }
                />
              </label>
            </>
          ) : null}

          {translationDraft.provider === 'cli' ? (
            <>
              <label className="settings-row">
                <span>
                  <b>{tt('settings.translationCliCmd', 'CLI 命令')}</b>
                  <em>
                    {tt(
                      'settings.translationCliCmdHint',
                      '如 claude、openai 等，内容通过 stdin 传入',
                    )}
                  </em>
                </span>
                <input
                  type="text"
                  placeholder="claude"
                  value={translationDraft.cliCommand ?? ''}
                  onChange={(event) =>
                    setTranslationDraft((d) => ({ ...d, cliCommand: event.target.value }))
                  }
                />
              </label>
              <label className="settings-row">
                <span>
                  <b>{tt('settings.translationCliArgs', '附加参数')}</b>
                  <em>{tt('settings.translationCliArgsHint', '空格分隔，如 --model claude-opus-4-5')}</em>
                </span>
                <input
                  type="text"
                  placeholder="--model claude-opus-4-5"
                  value={(translationDraft.cliArgs ?? []).join(' ')}
                  onChange={(event) =>
                    setTranslationDraft((d) => ({
                      ...d,
                      cliArgs: event.target.value.trim()
                        ? event.target.value.trim().split(/\s+/)
                        : [],
                    }))
                  }
                />
              </label>
            </>
          ) : null}

          <div className="settings-row settings-row-actions">
            <button
              type="button"
              className="button primary"
              disabled={translationSaving}
              onClick={() => {
                setTranslationSaving(true);
                void onTranslationSave(translationDraft).finally(() => {
                  setTranslationSaving(false);
                });
              }}
            >
              {translationSaving
                ? tt('settings.translationSaving', '保存中…')
                : tt('settings.translationSave', '保存翻译设置')}
            </button>
          </div>
        </div>

        <div className="settings-agents">
          <AgentsView
            installTargetRows={installTargetRows}
            library={library}
            onAdd={onAdd}
            onDelete={onDelete}
            onRefresh={onRefresh}
            onUpdate={onUpdate}
          />
        </div>
      </div>
    </section>
  );
}

function SettingsPanel({
  installTargetRows,
  library,
  onAdd,
  onClose,
  onDelete,
  onRefresh,
  onSettingsChange,
  onUpdate,
  settings,
}: {
  installTargetRows: InstallTargetOption[];
  library: SkillLibraryTarget | null;
  onAdd: (id: string, globalDir: string, projectDir: string) => Promise<void>;
  onClose: () => void;
  onDelete: (id: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onSettingsChange: (settings: Partial<AppSettings>) => Promise<void>;
  onUpdate: (id: string, globalDir: string, projectDir: string) => Promise<void>;
  settings: AppSettings;
}) {
  const { t } = useTranslation();
  const tt = (key: string, defaultValue: string) => t(key, { defaultValue });
  return (
    <aside className="settings-panel" aria-label={tt('settings.title', '设置')}>
      <div className="settings-backdrop" onClick={onClose} />
      <section className="settings-sheet">
        <div className="settings-head">
          <div>
            <h1>{tt('settings.title', '设置')}</h1>
            <p>{tt('settings.subtitle', '管理源缓存、桌面行为和 Agent 目标位置。')}</p>
          </div>
          <button className="icon-button" title={tt('settings.close', '关闭设置')} onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>

        <div className="settings-group">
          <h2>{tt('settings.refreshTitle', '源缓存')}</h2>
          <label className="settings-row">
            <span>
              <b>{tt('settings.refreshInterval', '检查间隔')}</b>
              <em>{tt('settings.refreshHint', '搜索会优先使用本地缓存，超过间隔才检查远端；手动刷新始终立即检查。')}</em>
            </span>
            <select
              value={settings.sourceRefreshIntervalMinutes}
              onChange={(event) =>
                void onSettingsChange({
                  sourceRefreshIntervalMinutes: Number(event.target.value),
                })
              }
            >
              <option value={0}>{tt('settings.refreshAlways', '每次搜索')}</option>
              <option value={5}>{tt('settings.refresh5', '每 5 分钟')}</option>
              <option value={15}>{tt('settings.refresh15', '每 15 分钟')}</option>
              <option value={60}>{tt('settings.refresh60', '每小时')}</option>
            </select>
          </label>
        </div>

        <div className="settings-group">
          <h2>{tt('settings.desktopTitle', '桌面端')}</h2>
          <label className="settings-row">
            <span>
              <b>{tt('settings.minimizeToTray', '关闭到托盘')}</b>
              <em>{tt('settings.minimizeToTrayHint', '点击关闭按钮时隐藏窗口，可从托盘图标恢复。')}</em>
            </span>
            <input
              type="checkbox"
              checked={settings.minimizeToTray}
              onChange={(event) =>
                void onSettingsChange({ minimizeToTray: event.target.checked })
              }
            />
          </label>
        </div>

        <div className="settings-agents">
          <AgentsView
            installTargetRows={installTargetRows}
            library={library}
            onAdd={onAdd}
            onDelete={onDelete}
            onRefresh={onRefresh}
            onUpdate={onUpdate}
          />
        </div>
      </section>
    </aside>
  );
}

function SourcesView({
  defaultSource,
  name,
  onAdd,
  onDelete,
  onNameChange,
  onRestore,
  onToggle,
  onToggleAllMirrors,
  onToggleMirror,
  onUrlChange,
  refreshing,
  sources,
  url,
}: {
  defaultSource: string;
  name: string;
  onAdd: () => void;
  onDelete: (name: string) => Promise<void> | void;
  onNameChange: (value: string) => void;
  onRestore: () => void;
  onToggle: (source: Source) => void;
  onToggleAllMirrors: () => void;
  onToggleMirror: (source: Source) => void;
  onUrlChange: (value: string) => void;
  refreshing: boolean;
  sources: Source[];
  url: string;
}) {
  const { t } = useTranslation();
  const [confirmDeleteSource, setConfirmDeleteSource] = useState<string | null>(
    null,
  );
  const enabledCount = sources.filter((source) => source.enabled).length;
  const mirrorSources = sources.filter((source) => source.domesticMirror);
  const allMirrorsEnabled =
    mirrorSources.length > 0 &&
    mirrorSources.every((source) => source.domesticMirror?.enabled);

  function sourceDisplayLabel(source: Source): string {
    return t(`builtinSources.${source.name}.label`, { defaultValue: source.label });
  }

  function sourceDisplayDescription(source: Source): string {
    return t(`builtinSources.${source.name}.description`, {
      defaultValue: source.description,
    });
  }

  return (
    <section className="installed-page">
      <div className="page-head">
        <h1>{t('sources.title')}</h1>
        <div className="source-head-actions">
          <button
            className={allMirrorsEnabled ? 'button source-mirror-global active' : 'button source-mirror-global'}
            disabled={refreshing || mirrorSources.length === 0}
            onClick={onToggleAllMirrors}
            title={
              mirrorSources.length === 0
                ? t('sources.mirrorAllTitleNone')
                : allMirrorsEnabled
                  ? t('sources.mirrorAllTitleOn')
                  : t('sources.mirrorAllTitleOff')
            }
          >
            {t('sources.mirrorAllButton')}
          </button>
          <button className="button" disabled={refreshing} onClick={onRestore}>
            <Icon name="database" />
            {t('sources.addBuiltin')}
          </button>
        </div>
      </div>
      <div className="source-form">
        <label>
          <span>{t('sources.nameLabel')}</span>
          <input
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder={t('sources.namePlaceholder')}
          />
        </label>
        <label>
          <span>{t('sources.urlLabel')}</span>
          <input
            value={url}
            onChange={(event) => onUrlChange(event.target.value)}
            placeholder={t('sources.urlPlaceholder')}
          />
        </label>
        <button className="button primary" disabled={refreshing} onClick={onAdd}>
          {t('sources.addSource')}
        </button>
      </div>
      <div className="source-list" aria-busy={refreshing}>
        {sources.map((source) => {
          const isLastEnabledSource = source.enabled && enabledCount <= 1;
          const cannotDelete =
            source.name === defaultSource ||
            source.name === 'default' ||
            isLastEnabledSource;
          const deleteTitle =
            source.name === defaultSource || source.name === 'default'
              ? t('sources.deleteTitleDefault')
              : isLastEnabledSource
                ? t('sources.deleteTitleLast')
                : undefined;
          const confirming = confirmDeleteSource === source.name;
          return (
            <article key={source.name}>
              <div className="source-main">
                <strong>
                  <span>{sourceDisplayLabel(source)}</span>
                  <span className="source-tags">
                    {source.name === defaultSource ? <i>{t('sources.tagDefault')}</i> : null}
                    <i>
                      {source.builtin ? t('sources.tagBuiltin') : t('sources.tagCustom')}
                    </i>
                    <i>
                      {t(`sourceCategory.${source.category}`, {
                        defaultValue: source.category,
                      })}
                    </i>
                    {source.domesticMirror ? (
                      <i>
                        {source.domesticMirror.enabled
                          ? t('sources.mirrorOn')
                          : t('sources.mirrorOff')}
                      </i>
                    ) : null}
                  </span>
                </strong>
                <span className="source-description">
                  {sourceDisplayDescription(source)}
                </span>
                <span className="source-url-row">
                  <b>{t('sources.upstream')}</b>
                  <code>{source.url}</code>
                </span>
                <span className="source-url-row">
                  <b>{t('sources.current')}</b>
                  <code>{source.effectiveUrl}</code>
                </span>
                <span className="source-key">{source.name}</span>
              </div>
              <span className={source.enabled ? 'source-status on' : 'source-status'}>
                {source.enabled ? t('sources.statusEnabled') : t('sources.statusDisabled')}
              </span>
              <div className="source-actions">
                <button
                  className="button"
                  disabled={refreshing || isLastEnabledSource}
                  onClick={() => onToggle(source)}
                  title={
                    isLastEnabledSource
                      ? t('sources.toggleTitleLast')
                      : undefined
                  }
                >
                  {source.enabled ? t('sources.disable') : t('sources.enable')}
                </button>
                {source.domesticMirror ? (
                  <button
                    className="button"
                    disabled={refreshing}
                    onClick={() => onToggleMirror(source)}
                    title={
                      source.domesticMirror.enabled
                        ? t('sources.mirrorRowTitleOn')
                        : t('sources.mirrorRowTitleOff')
                    }
                  >
                    {source.domesticMirror.enabled
                      ? t('sources.mirrorToggleOn')
                      : t('sources.mirrorToggleOff')}
                  </button>
                ) : null}
                <button
                  className="button danger"
                  disabled={refreshing || cannotDelete}
                  onClick={() =>
                    setConfirmDeleteSource(confirming ? null : source.name)
                  }
                  title={deleteTitle}
                >
                  {t('sources.delete')}
                </button>
              </div>
              {confirming ? (
                <div className="confirm-strip source-confirm-strip">
                  <span>
                    {t('sources.confirmDelete', {
                      name: source.name,
                      description: sourceDisplayDescription(source),
                    })}
                  </span>
                  <button
                    className="button danger"
                    onClick={async () => {
                      await onDelete(source.name);
                      setConfirmDeleteSource(null);
                    }}
                  >
                    {t('sources.delete')}
                  </button>
                  <button
                    className="button"
                    onClick={() => setConfirmDeleteSource(null)}
                  >
                    {t('installed.cancel')}
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      {refreshing ? (
        <div className="source-sync-status" role="status" aria-live="polite">
          <span className="source-sync-spinner" />
          <strong>{t('sources.syncingTitle')}</strong>
          <em>{t('sources.syncingHint')}</em>
        </div>
      ) : null}
    </section>
  );
}

function Info({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value || '-'}</strong>
    </div>
  );
}

// ─── 更新提示条 ────────────────────────────────────────────────────────────────

function UpdateBanner({
  currentVersion,
  onDismiss,
  onGoDownload,
  release,
}: {
  currentVersion: string;
  onDismiss: () => void;
  onGoDownload: () => void;
  release: DesktopRelease;
}) {
  return (
    <div className="update-banner" role="status">
      <span className="update-banner-dot" />
      <span className="update-banner-text">
        发现新版本 <strong>v{release.version}</strong>
        {currentVersion ? <>，当前版本 v{currentVersion}</> : null}
      </span>
      <button className="button primary update-banner-btn" onClick={onGoDownload}>
        查看下载
      </button>
      <button
        className="icon-button update-banner-close"
        aria-label="关闭提示"
        onClick={onDismiss}
      >
        <Icon name="x" />
      </button>
    </div>
  );
}

// ─── 下载页面 ──────────────────────────────────────────────────────────────────

// ─── 翻译 MarkdownView ──────────────────────────────────────────────────────

const TRANSLATE_CACHE_PREFIX = 'suit-skills-translate:';

function getTranslateCache(key: string): string | null {
  try {
    return localStorage.getItem(TRANSLATE_CACHE_PREFIX + key);
  } catch {
    return null;
  }
}

function setTranslateCache(key: string, value: string): void {
  try {
    localStorage.setItem(TRANSLATE_CACHE_PREFIX + key, value);
  } catch {
    // ignore
  }
}

function TranslateMarkdownView({
  markdown,
  cacheKey,
  translationConfig,
}: {
  markdown: string;
  cacheKey: string;
  translationConfig: TranslationConfig;
}) {
  const [state, setState] = useState<'original' | 'loading' | 'translated'>('original');
  const [translated, setTranslated] = useState('');
  const [error, setError] = useState('');
  const canTranslate = translationConfig.provider !== 'none';

  const handleToggle = useCallback(async () => {
    if (state === 'translated') {
      setState('original');
      return;
    }
    if (!markdown.trim()) return;

    const cached = cacheKey ? getTranslateCache(cacheKey) : null;
    if (cached) {
      setTranslated(cached);
      setState('translated');
      return;
    }

    setState('loading');
    setError('');
    try {
      const result = await translateText(markdown);
      if (cacheKey) setTranslateCache(cacheKey, result.translated);
      setTranslated(result.translated);
      setState('translated');
    } catch (err) {
      setError(err instanceof Error ? err.message : '翻译失败');
      setState('original');
    }
  }, [state, markdown, cacheKey]);

  // 当 markdown 变化时重置状态
  useEffect(() => {
    setState('original');
    setError('');
  }, [markdown]);

  return (
    <div className="translate-markdown-view">
      {canTranslate ? (
        <div className="translate-toolbar">
          <button
            className={`button translate-btn ${state === 'translated' ? 'active' : ''}`}
            onClick={() => void handleToggle()}
            disabled={state === 'loading' || !markdown.trim()}
            title={state === 'translated' ? '显示原文' : '翻译为中文'}
          >
            <Icon name="translate" />
            {state === 'loading' ? '翻译中…' : state === 'translated' ? '原文' : '中文'}
          </button>
          {error ? <span className="translate-error">{error}</span> : null}
        </div>
      ) : null}
      <MarkdownView markdown={state === 'translated' ? translated : markdown} />
    </div>
  );
}

function FileContentViewer({
  content,
  translationConfig,
  skillName,
}: {
  content: SkillFileContent | null;
  translationConfig: TranslationConfig;
  skillName: string;
}) {
  if (!content) {
    return <div className="file-content-empty">暂无内容</div>;
  }
  if (!content.previewable) {
    return (
      <div className="file-content-empty">
        <Icon name="file" />
        <span>无法预览此文件（{content.ext || '二进制'}，{(content.size / 1024).toFixed(1)} KB）</span>
      </div>
    );
  }
  if (content.encoding === 'base64' && content.contentBase64) {
    const mimeMap: Record<string, string> = {
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    };
    const mime = mimeMap[content.ext] ?? 'image/png';
    return (
      <div className="file-content-image">
        <img src={`data:${mime};base64,${content.contentBase64}`} alt={content.path} />
      </div>
    );
  }
  const text = content.content ?? '';
  if (content.ext === '.md') {
    return (
      <div className="file-content-markdown">
        <TranslateMarkdownView
          markdown={text}
          cacheKey={`translate:skill:${skillName}:${content.path}`}
          translationConfig={translationConfig}
        />
      </div>
    );
  }
  return (
    <div className="file-content-code">
      <pre className="code-block"><code>{text}</code></pre>
    </div>
  );
}

/** 将 API / 缓存等来源的树数据规整为数组，避免 `files` 或 `children` 非数组导致 for…of / .map 抛错 */
function normalizeSkillFileList(raw: unknown): SkillFileNode[] {
  if (!Array.isArray(raw)) return [];
  const out: SkillFileNode[] = [];
  for (const item of raw) {
    const node = normalizeSkillFileNode(item);
    if (node) out.push(node);
  }
  return out;
}

function normalizeSkillFileNode(item: unknown): SkillFileNode | null {
  if (!item || typeof item !== 'object') return null;
  const o = item as Record<string, unknown>;
  const name = typeof o.name === 'string' ? o.name : String(o.name ?? '');
  const path = typeof o.path === 'string' ? o.path : String(o.path ?? '');
  if (o.type === 'dir') {
    return {
      name,
      path,
      type: 'dir',
      children: normalizeSkillFileList(o.children),
    };
  }
  if (o.type === 'file') {
    return { name, path, type: 'file' };
  }
  return null;
}

function findSkillMdInTree(nodes: SkillFileNode[] | undefined): SkillFileNode | undefined {
  if (!Array.isArray(nodes)) return undefined;
  for (const node of nodes) {
    if (node.type === 'file' && node.name.toUpperCase() === 'SKILL.MD') {
      return node;
    }
    if (node.type === 'dir') {
      const kids = node.children;
      if (Array.isArray(kids) && kids.length > 0) {
        const found = findSkillMdInTree(kids);
        if (found) return found;
      }
    }
  }
  return undefined;
}

/** 文件路径的所有祖先目录路径（用于默认展开，便于看到子目录中的 SKILL.md） */
function ancestorDirPaths(filePath: string): string[] {
  const parts = filePath.split('/').filter(Boolean);
  if (parts.length <= 1) return [];
  const dirs: string[] = [];
  for (let i = 0; i < parts.length - 1; i++) {
    dirs.push(parts.slice(0, i + 1).join('/'));
  }
  return dirs;
}

function FileTreeNode({
  node,
  depth,
  selectedPath,
  expandedDirs,
  onSelectFile,
  onToggleDir,
}: {
  node: SkillFileNode;
  depth: number;
  selectedPath: string;
  expandedDirs: Set<string>;
  onSelectFile: (path: string) => void;
  onToggleDir: (path: string) => void;
}) {
  const isSelected = node.type === 'file' && node.path === selectedPath;

  if (node.type === 'dir') {
    const open = expandedDirs.has(node.path);
    const children = Array.isArray(node.children) ? node.children : [];
    return (
      <div className="file-tree-dir">
        <button
          type="button"
          className="file-tree-item file-tree-dir-btn"
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onClick={() => onToggleDir(node.path)}
        >
          <Icon name={open ? 'chevron-down' : 'chevron-right'} />
          <Icon name="folder" />
          <span>{node.name}</span>
        </button>
        {open && children.length > 0 ? (
          <div className="file-tree-children">
            {children.map((child) => (
              <FileTreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                expandedDirs={expandedDirs}
                onSelectFile={onSelectFile}
                onToggleDir={onToggleDir}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`file-tree-item file-tree-file-btn ${isSelected ? 'selected' : ''}`}
      style={{ paddingLeft: `${8 + depth * 14}px` }}
      onClick={() => onSelectFile(node.path)}
    >
      <Icon name="file" />
      <span>{node.name}</span>
    </button>
  );
}

function SkillDetailView({
  skillName,
  source,
  translationConfig,
  onBack,
}: {
  skillName: string;
  source: string;
  translationConfig: TranslationConfig;
  onBack: () => void;
}) {
  const [files, setFiles] = useState<SkillFileNode[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [filesError, setFilesError] = useState('');
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => new Set());
  const [selectedPath, setSelectedPath] = useState('');
  const [fileContent, setFileContent] = useState<SkillFileContent | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);

  const toggleDir = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!skillName) return;
    setLoadingFiles(true);
    setFilesError('');
    setFiles([]);
    setSelectedPath('');
    setExpandedDirs(new Set());
    fetchSkillFiles(skillName, source !== 'all' ? source : undefined)
      .then((data) => {
        const files = normalizeSkillFileList(data?.files);
        setFiles(files);
        const skillMd = findSkillMdInTree(files);
        if (skillMd) {
          setExpandedDirs(new Set(ancestorDirPaths(skillMd.path)));
          setSelectedPath(skillMd.path);
        }
      })
      .catch((err: unknown) => {
        setFilesError(err instanceof Error ? err.message : '加载文件列表失败');
      })
      .finally(() => setLoadingFiles(false));
  }, [skillName, source]);

  useEffect(() => {
    if (!selectedPath || !skillName) return;
    setLoadingContent(true);
    setFileContent(null);
    fetchSkillFileContent(skillName, selectedPath, source !== 'all' ? source : undefined)
      .then(setFileContent)
      .catch((err: unknown) => {
        setFileContent({
          path: selectedPath,
          encoding: 'binary',
          previewable: false,
          ext: '',
          size: 0,
          content: err instanceof Error ? err.message : '加载失败',
        });
      })
      .finally(() => setLoadingContent(false));
  }, [selectedPath, skillName, source]);

  return (
    <section className="skill-detail-page">
      <div className="skill-detail-topbar">
        <button type="button" className="button" onClick={onBack}>
          <Icon name="arrow-left" />
          返回
        </button>
        <span className="skill-detail-breadcrumb">
          <Icon name="database" />
          {skillName}
        </span>
      </div>
      <div className="skill-detail-body">
        <aside className="skill-detail-tree">
          {loadingFiles ? (
            <div className="state">加载文件树…</div>
          ) : filesError ? (
            <div className="state error">{filesError}</div>
          ) : (
            <div className="file-tree-root">
              {files.map((node) => (
                <FileTreeNode
                  key={node.path}
                  node={node}
                  depth={0}
                  selectedPath={selectedPath}
                  expandedDirs={expandedDirs}
                  onSelectFile={setSelectedPath}
                  onToggleDir={toggleDir}
                />
              ))}
            </div>
          )}
        </aside>
        <main className="skill-detail-content">
          {loadingFiles ? (
            <div className="state">加载中…</div>
          ) : filesError ? (
            <div className="state error">{filesError}</div>
          ) : !selectedPath ? (
            <div className="file-content-empty">← 从左侧选择文件查看内容</div>
          ) : loadingContent ? (
            <div className="state">加载文件内容…</div>
          ) : (
            <FileContentViewer
              content={fileContent}
              translationConfig={translationConfig}
              skillName={skillName}
            />
          )}
        </main>
      </div>
    </section>
  );
}

function DownloadView({
  currentVersion,
  isDesktop,
}: {
  currentVersion: string | null;
  isDesktop: boolean;
}) {
  const [release, setRelease] = useState<DesktopRelease | null | 'loading'>('loading');
  const detectedPlatform = useMemo(() => detectPlatform(), []);

  useEffect(() => {
    let cancelled = false;
    fetchLatestRelease().then((data) => {
      if (!cancelled) setRelease(data);
    });
    return () => { cancelled = true; };
  }, []);

  const platformOrder: DesktopPlatform[] = [
    'windows-x86_64',
    'darwin-aarch64',
    'darwin-x86_64',
  ];

  return (
    <section className="download-page">
      <div className="download-hero">
        <span className="download-hero-icon">
          <Icon name="download" />
        </span>
        <div>
          <h1>
            {isDesktop ? '检查更新' : '下载桌面版'}
          </h1>
          <p>
            {isDesktop
              ? `当前版本 v${currentVersion ?? '—'}，以下是 Gitee 上的最新构建。`
              : '下载 Suit Skills 桌面应用，获得更流畅的本地体验。'}
          </p>
        </div>
      </div>

      {release === 'loading' ? (
        <div className="state">正在获取最新版本信息…</div>
      ) : release === null ? (
        <div className="download-error">
          <p>无法获取版本信息，请稍后重试或直接前往 Gitee 仓库查看。</p>
          <a
            href={GITEE_REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="button"
          >
            前往 Gitee 仓库
          </a>
        </div>
      ) : (
        <>
          <div className="download-version-badge">
            最新版本 <strong>v{release.version}</strong>
            <span className="download-date">
              {new Date(release.pub_date).toLocaleDateString('zh-CN')}
            </span>
          </div>

          <div className="download-platforms">
            {platformOrder.map((key) => {
              const asset = release.platforms[key];
              const meta = PLATFORM_LABELS[key];
              const isCurrent = key === detectedPlatform;
              return (
                <div
                  key={key}
                  className={`download-card ${isCurrent ? 'recommended' : ''}`}
                >
                  {isCurrent ? (
                    <span className="download-card-badge">推荐</span>
                  ) : null}
                  <div className="download-card-info">
                    <strong>{meta.os}</strong>
                    <span>{meta.arch}</span>
                    <code>{asset?.filename ?? meta.ext}</code>
                  </div>
                  {asset ? (
                    <a
                      href={asset.url}
                      className="button primary"
                      download={asset.filename}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Icon name="download" />
                      下载
                    </a>
                  ) : (
                    <span className="download-card-na">暂未提供</span>
                  )}
                </div>
              );
            })}
          </div>

          {release.notes ? (
            <div className="download-notes">
              <strong>构建说明</strong>
              <span>{release.notes}</span>
            </div>
          ) : null}

          <div className="download-footer">
            <a
              href={`${GITEE_REPO_URL}/tree/desktop-artifacts`}
              target="_blank"
              rel="noreferrer"
              className="button"
            >
              查看 Gitee 仓库
            </a>
            <p className="download-hint">
              下载后直接运行安装包即可完成升级，无需卸载旧版本。
            </p>
          </div>
        </>
      )}
    </section>
  );
}
