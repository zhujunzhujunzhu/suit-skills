import {
  Suspense,
  type MouseEvent,
  lazy,
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
  fetchAiEditConfig,
  fetchDesktopBootstrap,
  exportInstalledSkill,
  fetchInstalled,
  fetchInstallTargets,
  fetchSettings,
  fetchSkillDetail,
  fetchSkills,
  fetchSources,
  fetchTranslationConfig,
  installSkill,
  linkInstalledSkillTargets,
  removeInstallTarget,
  removeSource,
  removeInstalledSkill,
  restoreBuiltinSources,
  selectProjectDirectory,
  updateSettings,
  updateAiEditConfig,
  updateInstallTarget,
  updateSource,
  updateTranslationConfig,
  type AiEditConfig,
  type AppSettings,
  type InstalledSkill,
  type InstallTargetOption,
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
  fetchLatestWebRelease,
  compareSemver,
  type DesktopRelease,
} from './api/download';
import { Icon, type IconName } from './ui/Icon';

type View =
  | 'library'
  | 'installed'
  | 'sources'
  | 'settings'
  | 'download'
  | 'skill-detail'
  | 'installed-editor';
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
  themeMode: 'default',
  themeColor: '#b7e05a',
};
const INSTALL_SCOPE_STORAGE_KEY = 'suit-skills.install.scope';
const INSTALL_STRATEGY_STORAGE_KEY = 'suit-skills.install.strategy';
const INSTALL_TARGETS_STORAGE_KEY = 'suit-skills.install.targets';
const INSTALL_PROJECT_DIR_STORAGE_KEY = 'suit-skills.install.projectDir';

const THEME_VARIABLE_NAMES = [
  '--surface',
  '--surface-lowest',
  '--surface-low',
  '--surface-mid',
  '--surface-high',
  '--surface-bright',
  '--surface-hover',
  '--text',
  '--foreground',
  '--muted',
  '--text-secondary',
  '--faint',
  '--outline',
  '--outline-soft',
  '--primary',
  '--primary-strong',
  '--primary-ink',
  '--secondary',
  '--tertiary',
  '--accent',
  '--accent-muted',
  '--warning',
  '--error',
  '--danger',
  '--shadow-soft',
  '--shadow-strong',
  '--panel-glow',
] as const;

function npxCommand(
  skill: SkillSummary | SkillDetail | null,
  placeholder: string,
): string {
  if (!skill?.name) return placeholder;
  const source = skill.sourceName ? ` --source ${skill.sourceName}` : '';
  return `npx suit-skills@latest install ${skill.name}${source}`;
}

function skillListSignature(items: SkillSummary[]): string {
  return JSON.stringify(
    items.map((item) => [
      item.name,
      item.version ?? '',
      item.description ?? '',
      item.author ?? '',
      item.sourceName,
      item.installed === true,
      item.installedTargets?.join('\u001f') ?? '',
      item.tags?.join('\u001f') ?? '',
      item.metadataSource ?? '',
    ]),
  );
}

function readStoredInstallScope(): LocationScope {
  if (typeof window === 'undefined') return 'project';
  return localStorage.getItem(INSTALL_SCOPE_STORAGE_KEY) === 'global'
    ? 'global'
    : 'project';
}

function readStoredInstallStrategy(): InstallStrategy {
  if (typeof window === 'undefined') return 'skip';
  const value = localStorage.getItem(INSTALL_STRATEGY_STORAGE_KEY);
  return value === 'overwrite' || value === 'rename' || value === 'skip'
    ? value
    : 'skip';
}

function readStoredInstallTargets(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(
      localStorage.getItem(INSTALL_TARGETS_STORAGE_KEY) ?? '[]',
    );
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function readStoredProjectDir(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(INSTALL_PROJECT_DIR_STORAGE_KEY) ?? '';
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

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
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

function ErrorState({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className="state error">
      <span>{message}</span>
      <button
        aria-label="关闭错误提示"
        className="state-error-close"
        type="button"
        onClick={onDismiss}
      >
        ×
      </button>
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

function nextSelectableSource(sources: Source[], current: string): string {
  if (current === 'all') return current;
  return sources.some((item) => item.enabled && item.name === current)
    ? current
    : 'all';
}

function skillsRequestKey(source: string, query: string, tag: string): string {
  return [source, query.trim(), tag.trim()].join('\0');
}

function installedRequestKey(
  scope: ScopeFilter,
  target: string,
  query: string,
): string {
  return [scope, target.trim(), query.trim()].join('\0');
}

const VIEW_KEYS: Record<View, string> = {
  library: 'skills',
  installed: 'installed',
  sources: 'sources',
  settings: 'settings',
  download: 'download',
  'skill-detail': 'skills',
  'installed-editor': 'installed',
};

function viewFromHash(): View {
  const hash = window.location.hash.slice(1);
  if (hash === 'agents') return 'settings';
  const key = Object.keys(VIEW_KEYS).find((v) => VIEW_KEYS[v as View] === hash);
  return (key as View) || 'library';
}

const WEB_APP_VERSION = __APP_VERSION__;
const LazyDownloadView = lazy(() => import('./views/DownloadView'));
const LazyInstalledView = lazy(() => import('./views/InstalledView'));
const LazyLibraryView = lazy(() => import('./views/LibraryView'));
const LazySettingsView = lazy(() => import('./views/SettingsView'));
const LazySkillDetailView = lazy(() => import('./views/SkillDetailView'));
const LazyInstalledSkillEditorView = lazy(() => import('./views/InstalledSkillEditorView'));
const LazySourcesView = lazy(() => import('./views/SourcesView'));

export default function App() {
  const { t, i18n } = useTranslation();
  const isDesktop = typeof window !== 'undefined' && '__TAURI__' in window;
  const [view, setView] = useState<View>(viewFromHash);
  const [sources, setSources] = useState<Source[]>([]);
  const [source, setSource] = useState('all');
  const [defaultSource, setDefaultSource] = useState('');
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
  const [installTargets, setInstallTargets] = useState<string[]>(readStoredInstallTargets);
  const [installTargetRows, setInstallTargetRows] = useState<InstallTargetOption[]>([]);
  const [skillLibrary, setSkillLibrary] = useState<SkillLibraryTarget | null>(null);
  const [installScope, setInstallScope] = useState<LocationScope>(readStoredInstallScope);
  const [installStrategy, setInstallStrategy] = useState<InstallStrategy>(readStoredInstallStrategy);
  const [installProjectDir, setInstallProjectDir] = useState(readStoredProjectDir);
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
  const [sourceConflict, setSourceConflict] = useState<{
    name: string;
    url: string;
    existing: Source;
  } | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState<DesktopRelease | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [currentAppVersion, setCurrentAppVersion] = useState<string | null>(null);
  const [latestDesktopRelease, setLatestDesktopRelease] =
    useState<DesktopRelease | null | 'loading'>('loading');
  const [latestWebVersion, setLatestWebVersion] = useState<string | null | 'loading'>('loading');
  const [detailSkillName, setDetailSkillName] = useState('');
  const [installedEditorSkill, setInstalledEditorSkill] = useState<InstalledSkill | null>(null);
  const [prevView, setPrevView] = useState<View>('library');
  const [translationConfig, setTranslationConfig] = useState<TranslationConfig>({ provider: 'none' });
  const [aiEditConfig, setAiEditConfig] = useState<AiEditConfig>({ provider: 'none' });
  const [bootstrapReady, setBootstrapReady] = useState(false);
  const skillRequestId = useRef(0);
  const detailRequestId = useRef(0);
  const installedRequestId = useRef(0);
  const backgroundSkillRefreshId = useRef(0);
  const backgroundSkillRefreshInFlight = useRef(false);
  const skillAbortController = useRef<AbortController | null>(null);
  const detailAbortController = useRef<AbortController | null>(null);
  const installedAbortController = useRef<AbortController | null>(null);
  const lastLoadedSkillsKey = useRef('');
  const lastLoadedInstalledKey = useRef('');
  const currentSkillsKey = useRef('');
  const currentSkillListSignature = useRef('');
  const skillsSignature = useMemo(() => skillListSignature(skills), [skills]);

  currentSkillsKey.current = skillsRequestKey(source, debouncedQuery, tag);
  currentSkillListSignature.current = skillsSignature;

  function applySourcesData(data: { sources: Source[]; defaultSource: string }) {
    setSources(data.sources);
    setDefaultSource(data.defaultSource);
    setSource((current) => nextSelectableSource(data.sources, current));
  }

  function applyInstallTargetsData(data: {
    library?: SkillLibraryTarget | null;
    targets: InstallTargetOption[];
  }) {
    setSkillLibrary(data.library ?? null);
    setInstallTargetRows(data.targets);
    setInstallTargets((prev) => {
      const visibleTargets = data.targets.filter((row) => !row.hidden);
      const ids = new Set(visibleTargets.map((row) => row.id));
      const kept = prev.filter((id) => ids.has(id));
      if (kept.length > 0) {
        return kept;
      }
      return visibleTargets
        .filter((row) => row.globalExists || row.projectExists)
        .map((row) => row.id);
    });
  }

  useEffect(() => {
    localStorage.setItem(INSTALL_SCOPE_STORAGE_KEY, installScope);
  }, [installScope]);

  useEffect(() => {
    localStorage.setItem(INSTALL_STRATEGY_STORAGE_KEY, installStrategy);
  }, [installStrategy]);

  useEffect(() => {
    localStorage.setItem(INSTALL_TARGETS_STORAGE_KEY, JSON.stringify(installTargets));
  }, [installTargets]);

  useEffect(() => {
    const trimmed = installProjectDir.trim();
    if (trimmed) {
      localStorage.setItem(INSTALL_PROJECT_DIR_STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(INSTALL_PROJECT_DIR_STORAGE_KEY);
    }
  }, [installProjectDir]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const rootStyle = document.documentElement.style;
    let disposed = false;

    for (const name of THEME_VARIABLE_NAMES) {
      rootStyle.removeProperty(name);
    }

    if (settings.themeMode !== 'custom') {
      return;
    }

    void import('./theme/customTheme').then(({ buildCustomThemeVariables }) => {
      if (disposed) {
        return;
      }
      const themeVariables = buildCustomThemeVariables(settings.themeColor);
      for (const [name, value] of Object.entries(themeVariables)) {
        rootStyle.setProperty(name, value);
      }
    });

    return () => {
      disposed = true;
      for (const name of THEME_VARIABLE_NAMES) {
        rootStyle.removeProperty(name);
      }
    };
  }, [settings.themeColor, settings.themeMode]);

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
    skillAbortController.current?.abort();
    const controller = new AbortController();
    skillAbortController.current = controller;
    setLoading(true);
    setError('');
    setSourceWarnings([]);
    try {
      const data = await fetchSkills({
        source: nextSource,
        q,
        tag: nextTag,
        refresh,
      }, { signal: controller.signal });
      if (skillRequestId.current === requestId) {
        setSkills(data.items);
        setSourceWarnings(data.warnings ?? []);
        lastLoadedSkillsKey.current = skillsRequestKey(nextSource, q, nextTag);
        setSelected((current) =>
          current && data.items.some((item) => item.name === current)
            ? current
            : data.items[0]?.name ?? '',
        );
      }
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      if (skillRequestId.current === requestId) {
        setError(err instanceof Error ? err.message : String(err));
        setSourceWarnings([]);
      }
    } finally {
      if (skillAbortController.current === controller) {
        skillAbortController.current = null;
      }
      if (skillRequestId.current === requestId) {
        setLoading(false);
      }
    }
  }

  async function refreshSkillsInBackground(
    nextSource = source,
    q = debouncedQuery,
    nextTag = tag,
  ) {
    if (backgroundSkillRefreshInFlight.current) {
      return;
    }
    backgroundSkillRefreshInFlight.current = true;
    const refreshId = backgroundSkillRefreshId.current + 1;
    backgroundSkillRefreshId.current = refreshId;
    const requestKey = skillsRequestKey(nextSource, q, nextTag);
    try {
      const data = await fetchSkills({
        source: nextSource,
        q,
        tag: nextTag,
        refresh: true,
      });
      if (
        backgroundSkillRefreshId.current !== refreshId ||
        currentSkillsKey.current !== requestKey
      ) {
        return;
      }
      if (skillListSignature(data.items) === currentSkillListSignature.current) {
        return;
      }
      setSkills(data.items);
      setSourceWarnings(data.warnings ?? []);
      lastLoadedSkillsKey.current = requestKey;
      setSelected((current) =>
        current && data.items.some((item) => item.name === current)
          ? current
          : data.items[0]?.name ?? '',
      );
    } catch {
      /* 后台刷新失败时保留当前缓存结果，避免打断浏览。 */
    } finally {
      if (backgroundSkillRefreshId.current === refreshId) {
        backgroundSkillRefreshInFlight.current = false;
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
    installedAbortController.current?.abort();
    const controller = new AbortController();
    installedAbortController.current = controller;
    setInstalledLoading(true);
    try {
      const data = await fetchInstalled({
        scope: nextScope,
        target: target || undefined,
        q,
      }, { signal: controller.signal });
      if (installedRequestId.current === requestId) {
        setInstalled(data.items);
        lastLoadedInstalledKey.current = installedRequestKey(nextScope, target, q);
      }
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      if (installedRequestId.current === requestId) {
        setInstalled([]);
      }
    } finally {
      if (installedAbortController.current === controller) {
        installedAbortController.current = null;
      }
      if (installedRequestId.current === requestId) {
        setInstalledLoading(false);
      }
    }
  }

  async function loadSources() {
    try {
      const data = await fetchSources();
      applySourcesData(data);
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

  async function loadAiEditConfig() {
    try {
      setAiEditConfig(await fetchAiEditConfig());
    } catch {
      setAiEditConfig({ provider: 'none' });
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

  async function saveAiEditConfig(next: AiEditConfig) {
    try {
      const updated = await updateAiEditConfig(next);
      setAiEditConfig(updated);
      notify(t('toast.aiEditSaved', { defaultValue: 'AI 修改配置已保存' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function openSkillDetail(name: string) {
    setPrevView(view);
    setDetailSkillName(name);
    setView('skill-detail');
  }

  function openInstalledEditor(item: InstalledSkill) {
    setPrevView(view);
    setInstalledEditorSkill(item);
    setView('installed-editor');
  }

  function openSettings() {
    setPrevView(view);
    setView('settings');
  }

  function openDownload() {
    setPrevView(view);
    setView('download');
  }

  async function refreshInstallTargets() {
    try {
      const data = await fetchInstallTargets();
      applyInstallTargetsData(data);
    } catch {
      /* Web API 或桌面端 CLI 不可用时保持当前列表 */
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

  useEffect(() => () => {
    skillAbortController.current?.abort();
    detailAbortController.current?.abort();
    installedAbortController.current?.abort();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initializeApp() {
      try {
        const bootstrap = await fetchDesktopBootstrap();
        if (cancelled) {
          return;
        }
        if (bootstrap) {
          applySourcesData(bootstrap.sources);
          setSettings(bootstrap.settings);
          setTranslationConfig(bootstrap.translationConfig);
          setAiEditConfig(bootstrap.aiEditConfig);
          applyInstallTargetsData(bootstrap.installTargets);
          if (bootstrap.skills) {
            setSkills(bootstrap.skills.items);
            setSourceWarnings(bootstrap.skills.warnings);
            setSelected(bootstrap.skills.items[0]?.name ?? '');
            lastLoadedSkillsKey.current = skillsRequestKey('all', '', '');
          }
          if (bootstrap.installed) {
            setInstalled(bootstrap.installed.items);
            lastLoadedInstalledKey.current = installedRequestKey('all', '', '');
          }
          setBootstrapReady(true);
          void refreshSkillsInBackground('all', '', '');
          return;
        }
      } catch {
        /* Tauri bootstrap failed; fall back to independent reads. */
      }

      if (cancelled) {
        return;
      }

      void loadSources();
      void loadSettings();
      void loadTranslationConfig();
      void loadAiEditConfig();
      void refreshInstallTargets();
      setBootstrapReady(true);
    }

    void initializeApp();
    return () => {
      cancelled = true;
    };
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

  useEffect(() => {
    let cancelled = false;
    fetchLatestWebRelease().then((data) => {
      if (!cancelled) {
        setLatestWebVersion(data?.version ?? null);
      }
    }).catch(() => {
      if (!cancelled) {
        setLatestWebVersion(null);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // 桌面端自动检测新版本
  useEffect(() => {
    let cancelled = false;
    async function checkUpdate() {
      try {
        const release = await fetchLatestRelease();
        if (cancelled) return;
        setLatestDesktopRelease(release);

        if (!isDesktop) {
          setUpdateAvailable(null);
          return;
        }

        // 读取当前桌面应用版本
        const { getVersion } = await import('@tauri-apps/api/app');
        const currentVersion = await getVersion();
        if (cancelled) return;
        setCurrentAppVersion(currentVersion);

        if (release && compareSemver(release.version, currentVersion) > 0) {
          setUpdateAvailable(release);
        } else {
          setUpdateAvailable(null);
        }
      } catch {
        // 检测失败时静默处理
        if (!cancelled) {
          setLatestDesktopRelease(null);
          setUpdateAvailable(null);
        }
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
    if (!bootstrapReady) {
      return;
    }
    const nextKey = skillsRequestKey(source, debouncedQuery, tag);
    if (lastLoadedSkillsKey.current === nextKey) {
      return;
    }
    void loadSkills().then(() => {
      void refreshSkillsInBackground(source, debouncedQuery, tag);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrapReady, source, debouncedQuery, tag]);

  useEffect(() => {
    if (!bootstrapReady || settings.sourceRefreshIntervalMinutes <= 0) {
      return;
    }
    if (view !== 'library' && view !== 'skill-detail') {
      return;
    }
    const intervalMs = Math.max(
      60_000,
      settings.sourceRefreshIntervalMinutes * 60_000,
    );
    const timer = window.setInterval(() => {
      void refreshSkillsInBackground(source, debouncedQuery, tag);
    }, intervalMs);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    bootstrapReady,
    settings.sourceRefreshIntervalMinutes,
    view,
    source,
    debouncedQuery,
    tag,
  ]);

  useEffect(() => {
    if (view !== 'library' && view !== 'skill-detail') {
      return;
    }
    const requestId = detailRequestId.current + 1;
    detailRequestId.current = requestId;
    detailAbortController.current?.abort();
    const controller = new AbortController();
    detailAbortController.current = controller;
    if (!selected) {
      setDetail(null);
      setError((current) =>
        current === RAW_API.SKILL_NOT_FOUND ? '' : current,
      );
      detailAbortController.current = null;
      return;
    }
    fetchSkillDetail(selected, source, { signal: controller.signal })
      .then((nextDetail) => {
        if (detailRequestId.current === requestId) {
          setDetail(nextDetail);
          setError((current) =>
            current === RAW_API.SKILL_NOT_FOUND ? '' : current,
          );
        }
      })
      .catch((err: Error) => {
        if (isAbortError(err)) {
          return;
        }
        if (detailRequestId.current === requestId) {
          setDetail(null);
          setError(err.message);
        }
      });
    return () => {
      if (detailAbortController.current === controller) {
        detailAbortController.current = null;
      }
      controller.abort();
    };
  }, [selected, source, view]);

  useEffect(() => {
    if (!bootstrapReady) {
      return;
    }
    if (view !== 'installed' && view !== 'installed-editor') {
      return;
    }
    const nextKey = installedRequestKey(scope, installedTarget, debouncedInstalledQuery);
    if (lastLoadedInstalledKey.current === nextKey) {
      return;
    }
    void loadInstalled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrapReady, view, scope, installedTarget, debouncedInstalledQuery]);

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

  const webUpdateAvailable =
    latestWebVersion !== null && latestWebVersion !== 'loading'
      ? compareSemver(latestWebVersion, WEB_APP_VERSION) > 0
      : false;
  const runtimeCurrentVersion = isDesktop ? currentAppVersion : WEB_APP_VERSION;
  const runtimeLatestVersion = isDesktop
    ? latestDesktopRelease && latestDesktopRelease !== 'loading'
      ? latestDesktopRelease.version
      : null
    : latestWebVersion === 'loading'
      ? null
      : latestWebVersion;
  const runtimeChannelLabel = isDesktop
    ? t('topbar.runtimeDesktop', { defaultValue: '桌面端' })
    : t('topbar.runtimeWeb', { defaultValue: 'Web 端' });
  const runtimeUpdateAvailable = isDesktop ? updateAvailable !== null : webUpdateAvailable;

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

  async function chooseInstallProjectDir() {
    try {
      const selectedDir = await selectProjectDirectory();
      if (selectedDir) {
        setInstallProjectDir(selectedDir);
        notify(t('toast.projectDirSelected', { defaultValue: '项目目录已选择' }));
        return;
      }
      if (!isDesktop) {
        const manualDir = window.prompt(
          t('install.projectDirPrompt', {
            defaultValue: '请输入项目根目录路径',
          }),
          installProjectDir,
        );
        if (manualDir?.trim()) {
          setInstallProjectDir(manualDir.trim());
          notify(t('toast.projectDirSelected', { defaultValue: '项目目录已选择' }));
          return;
        }
        notify(t('toast.projectDirManual', {
          defaultValue: '当前浏览器不支持目录选择，请手动输入项目目录',
        }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function installSelected() {
    if (!activeSkill) return;
    let projectDir = installProjectDir.trim();
    if (installScope === 'project' && !projectDir) {
      const selectedDir = await selectProjectDirectory();
      if (selectedDir) {
        projectDir = selectedDir;
        setInstallProjectDir(selectedDir);
      } else if (!isDesktop) {
        const manualDir = window.prompt(
          t('install.projectDirPrompt', {
            defaultValue: '请输入项目根目录路径',
          }),
          installProjectDir,
        );
        if (manualDir?.trim()) {
          projectDir = manualDir.trim();
          setInstallProjectDir(projectDir);
        }
      } else {
        setError(
          t('install.projectDirRequired', {
            defaultValue: '项目级安装需要先选择或填写项目目录',
          }),
        );
        return;
      }
      if (!projectDir) {
        setError(
          t('install.projectDirRequired', {
            defaultValue: '项目级安装需要先选择或填写项目目录',
          }),
        );
        return;
      }
    }
    try {
      await installSkill({
        identifier: activeSkill.name,
        source: activeSkill.sourceName,
        targets: installTargets,
        global: installScope === 'global',
        projectDir: installScope === 'project' ? projectDir : undefined,
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
    const existing = sources.find((item) => item.name === name);
    if (existing) {
      if (existing.url === url || existing.effectiveUrl === url) {
        setError('Source already exists');
        return;
      }
      setSourceConflict({ name, url, existing });
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

  function editSourceFromRow(item: Source) {
    setSourceName(item.name);
    setSourceUrl(item.url);
    setError('');
    setSourceConflict(null);
  }

  function suggestSourceName(baseName: string): string {
    const used = new Set(sources.map((item) => item.name));
    for (let index = 2; index < 1000; index += 1) {
      const candidate = `${baseName}-${index}`;
      if (!used.has(candidate)) {
        return candidate;
      }
    }
    return `${baseName}-${Date.now()}`;
  }

  function renameConflictingSource() {
    if (!sourceConflict) return;
    setSourceName(suggestSourceName(sourceConflict.name));
    setSourceConflict(null);
  }

  async function overwriteConflictingSource() {
    if (!sourceConflict) return;
    try {
      setError('');
      const result = await updateSource(sourceConflict.name, {
        url: sourceConflict.url,
        clearCache: true,
        enabled: sourceConflict.existing.enabled,
      });
      const nextSource = nextSelectableSource(result.sources, source);
      setSources(result.sources);
      setDefaultSource(result.defaultSource);
      setSource(nextSource);
      setSourceName('');
      setSourceUrl('');
      setSourceConflict(null);
      notify(t('toast.sourceUpdated'));
      await loadSkills(nextSource);
      void refreshSkillsInBackground(nextSource);
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
      void refreshSkillsInBackground(nextSource);
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
      void refreshSkillsInBackground(source);
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
      void refreshSkillsInBackground(source);
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
      void refreshSkillsInBackground(nextSource);
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

  const shellNoRail =
    view === 'skill-detail' ||
    view === 'installed-editor' ||
    view === 'settings' ||
    view === 'download';

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
                      : view === 'installed-editor'
                        ? t('crumb.viewInstalledEditor', { defaultValue: '本地技能编辑' })
                      : view === 'download'
                        ? t('crumb.viewDownload', { defaultValue: '下载' })
                        : t('crumb.viewSettings', { defaultValue: '设置' })}
            </em>
          </div>
          <div className="topbar-actions">
            <TopbarDownloadEntry
              active={view === 'download'}
              currentVersion={runtimeCurrentVersion}
              label={t('topbar.download', { defaultValue: '下载' })}
              latestVersion={runtimeLatestVersion}
              runtimeLabel={runtimeChannelLabel}
              updateAvailable={runtimeUpdateAvailable}
              onClick={openDownload}
            />
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
            onGoDownload={() => {
              setUpdateDismissed(true);
              openDownload();
            }}
          />
        ) : null}
        {error ? (
          <ErrorState
            message={translateApiError(t, error)}
            onDismiss={() => setError('')}
          />
        ) : null}
        {view === 'library' ? (
          <Suspense fallback={<div className="state">加载技能库中…</div>}>
            <LazyLibraryView
              detail={detail}
              installProjectDir={installProjectDir}
              installScope={installScope}
              installStrategy={installStrategy}
              installTargets={installTargets}
              installTargetRows={installTargetRows}
              loading={loading}
              onCopyCommand={copyCommand}
              onInstall={installSelected}
              onInstallProjectDirChange={setInstallProjectDir}
              onInstallScopeChange={setInstallScope}
              onInstallStrategyChange={setInstallStrategy}
              onInstallTargetsChange={setInstallTargets}
              onManageAgents={openSettings}
              onSelectProjectDir={chooseInstallProjectDir}
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
          </Suspense>
        ) : null}

        {view === 'skill-detail' ? (
          <Suspense fallback={<div className="state">加载技能详情中…</div>}>
            <LazySkillDetailView
              skillName={detailSkillName}
              source={source}
              translationConfig={translationConfig}
              onBack={() => setView(prevView)}
            />
          </Suspense>
        ) : null}

        {view === 'installed' ? (
          <Suspense fallback={<div className="state">加载已安装列表中…</div>}>
            <LazyInstalledView
              confirmRemove={confirmRemove}
              installTargetRows={installTargetRows}
              installed={visibleInstalled}
              loading={installedLoading}
              onConfirmRemove={setConfirmRemove}
              onCopyPackage={copyPackage}
              onOpenEditor={openInstalledEditor}
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
          </Suspense>
        ) : null}

        {view === 'installed-editor' && installedEditorSkill ? (
          <Suspense fallback={<div className="state">加载本地技能编辑器中…</div>}>
            <LazyInstalledSkillEditorView
              aiEditConfig={aiEditConfig}
              item={installedEditorSkill}
              onBack={() => setView(prevView)}
            />
          </Suspense>
        ) : null}

        {view === 'sources' ? (
          <Suspense fallback={<div className="state">加载来源配置中…</div>}>
            <LazySourcesView
              defaultSource={defaultSource}
              name={sourceName}
              onAdd={addSourceFromForm}
              onDelete={deleteSource}
              onEdit={editSourceFromRow}
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
          </Suspense>
        ) : null}

        {view === 'settings' ? (
          <Suspense fallback={<div className="state">加载设置中…</div>}>
            <LazySettingsView
              installTargetRows={installTargetRows}
              library={skillLibrary}
              onAdd={submitCustomInstallTarget}
              onBack={() => setView(prevView)}
              onDelete={deleteAgent}
              onRefresh={refreshInstallTargets}
              onAiEditSave={saveAiEditConfig}
              onSettingsChange={saveSettings}
              onTranslationSave={saveTranslationConfig}
              onUpdate={submitAgentUpdate}
              aiEditConfig={aiEditConfig}
              settings={settings}
              translationConfig={translationConfig}
            />
          </Suspense>
        ) : null}

        {view === 'download' ? (
          <Suspense fallback={<div className="state">加载下载信息中…</div>}>
            <LazyDownloadView
              currentVersion={currentAppVersion}
              isDesktop={isDesktop}
              latestDesktopRelease={latestDesktopRelease}
              latestWebVersion={latestWebVersion}
              onBack={() => setView(prevView)}
              webVersion={WEB_APP_VERSION}
            />
          </Suspense>
        ) : null}
      </main>

      {toast ? <div className="toast">{toast}</div> : null}
      {sourceConflict ? (
        <div className="confirm-dialog-layer" role="presentation">
          <button
            aria-label={t('sources.conflictCancel')}
            className="confirm-dialog-scrim"
            type="button"
            onClick={() => setSourceConflict(null)}
          />
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="source-conflict-title"
            aria-describedby="source-conflict-description"
          >
            <div className="confirm-dialog-mark" aria-hidden="true">i</div>
            <div className="confirm-dialog-copy">
              <p className="eyebrow">{t('sources.conflictEyebrow')}</p>
              <h2 id="source-conflict-title">{t('sources.conflictTitle')}</h2>
              <p id="source-conflict-description">
                {t('sources.conflictDescription', {
                  name: sourceConflict.name,
                  currentUrl: sourceConflict.existing.url,
                  nextUrl: sourceConflict.url,
                })}
              </p>
            </div>
            <div className="confirm-dialog-actions">
              <button type="button" onClick={() => setSourceConflict(null)}>
                {t('sources.conflictCancel')}
              </button>
              <button type="button" onClick={renameConflictingSource}>
                {t('sources.conflictRename')}
              </button>
              <button className="danger solid" type="button" onClick={() => { void overwriteConflictingSource(); }}>
                {t('sources.conflictOverwrite')}
              </button>
            </div>
          </section>
        </div>
      ) : null}
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
  icon: IconName;
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

function TopbarDownloadEntry({
  active,
  currentVersion,
  label,
  latestVersion,
  onClick,
  runtimeLabel,
  updateAvailable,
}: {
  active: boolean;
  currentVersion: string | null;
  label: string;
  latestVersion: string | null;
  onClick: () => void;
  runtimeLabel: string;
  updateAvailable: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className={`topbar-download ${active ? 'active' : ''}`}>
      <button
        type="button"
        className={`topbar-download-button ${active ? 'active' : ''}`}
        aria-label={label}
        title={label}
        onClick={onClick}
      >
        <span className="topbar-download-icon-wrap">
          <Icon name="download" />
          {updateAvailable ? <span className="topbar-download-dot" aria-hidden="true" /> : null}
        </span>
        <span>{label}</span>
      </button>
      <span
        className={`topbar-version-chip ${updateAvailable ? 'topbar-version-chip--warn' : ''}`}
        title={`${runtimeLabel} v${currentVersion ?? '-'}`}
      >
        <em>{runtimeLabel}</em>
        <strong>v{currentVersion ?? '-'}</strong>
      </span>
      {updateAvailable && latestVersion ? (
        <span
          className="topbar-version-chip topbar-version-chip--update"
          title={t('topbar.updateAvailableTitle', {
            defaultValue: '可更新到 v{{version}}',
            version: latestVersion,
          })}
        >
          <i />
          <span>
            {t('topbar.latestShort', { defaultValue: '最新' })} v{latestVersion}
          </span>
        </span>
      ) : null}
    </div>
  );
}
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

