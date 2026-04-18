import { type MouseEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  addSource,
  copyInstalledSkillPackage,
  exportInstalledSkill,
  fetchInstalled,
  fetchSkillDetail,
  fetchSkills,
  fetchSources,
  installSkill,
  linkInstalledSkillTargets,
  removeSource,
  removeInstalledSkill,
  restoreBuiltinSources,
  updateSource,
  type InstalledSkill,
  type SkillDetail,
  type SkillSummary,
  type Source,
  type SourceWarning,
} from './api/client';
import { RAW_API, translateApiError } from './i18n/apiErrors';
import { changeLanguageWithStorage, type AppLocale } from './i18n';

type View = 'library' | 'installed' | 'sources';
type LocationScope = 'project' | 'global';
type ScopeFilter = 'all' | LocationScope;
type InstallStrategy = 'overwrite' | 'skip' | 'rename';

const TARGETS = ['claude', 'cursor', 'codex', 'agents', 'copilot'];

const icons = {
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

async function windowCommand(action: 'minimize' | 'toggleMaximize' | 'close'): Promise<void> {
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
  const fields = [
    item.name,
    item.version,
    item.description,
    item.path,
    item.target,
    item.scope,
    item.sourceName,
    item.metadataSource,
    ...(item.tags ?? []),
  ].filter((value): value is string => typeof value === 'string');
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
};

function viewFromHash(): View {
  const hash = window.location.hash.slice(1);
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
  const [installedTarget, setInstalledTarget] = useState('');
  const [scope, setScope] = useState<ScopeFilter>('all');
  const [installTargets, setInstallTargets] = useState<string[]>(['claude', 'cursor', 'codex']);
  const [installScope, setInstallScope] = useState<LocationScope>('global');
  const [installStrategy, setInstallStrategy] = useState<InstallStrategy>('skip');
  const [loading, setLoading] = useState(false);
  const [installedLoading, setInstalledLoading] = useState(false);
  const [error, setError] = useState('');
  const [sourceWarnings, setSourceWarnings] = useState<SourceWarning[]>([]);
  const [toast, setToast] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
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
    q = installedQuery,
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

  useEffect(() => {
    void loadSources();
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
    const timer = window.setTimeout(() => setDebouncedQuery(query), 200);
    return () => window.clearTimeout(timer);
  }, [query]);

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
  }, [scope, installedTarget, installedQuery]);

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
    try {
      const result = await addSource({ name: sourceName, url: sourceUrl });
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

  return (
    <div className="app-shell">
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
                  : t('crumb.viewSources')}
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
              title={t('topbar.refresh')}
              onClick={() => {
                void loadSkills(source, debouncedQuery, tag, true);
                void loadInstalled();
              }}
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
                <button className="close" title={t('topbar.close')} onClick={() => void windowCommand('close')}>
                  <b />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

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

      <main className="workspace">
        {error ? <ErrorState message={translateApiError(t, error)} /> : null}
        {view === 'library' ? (
          <LibraryView
            detail={detail}
            installScope={installScope}
            installStrategy={installStrategy}
            installTargets={installTargets}
            loading={loading}
            onCopyCommand={copyCommand}
            onInstall={installSelected}
            onInstallScopeChange={setInstallScope}
            onInstallStrategyChange={setInstallStrategy}
            onInstallTargetsChange={setInstallTargets}
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
          />
        ) : null}

        {view === 'installed' ? (
          <InstalledView
            confirmRemove={confirmRemove}
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
      </main>

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

function NavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: keyof typeof icons;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={active ? 'active' : ''} onClick={onClick}>
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
}

function LibraryView(props: {
  detail: SkillDetail | null;
  installScope: LocationScope;
  installStrategy: InstallStrategy;
  installTargets: string[];
  loading: boolean;
  onCopyCommand: () => void;
  onInstall: () => void;
  onInstallScopeChange: (value: LocationScope) => void;
  onInstallStrategyChange: (value: InstallStrategy) => void;
  onInstallTargetsChange: (value: string[]) => void;
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
}) {
  const { t } = useTranslation();
  const activeSkill = props.detail ?? props.selectedSummary;
  const unknown = t('common.unknown');
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

        <div className="library-scroll">
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

          <div className="skill-grid">
            {props.skills.map((skill) => (
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
                  {highlightText(skill.description || t('library.noDescription'), props.query)}
                </span>
                <span className="card-tags">
                  {skill.tags?.slice(0, 4).map((item) => (
                    <i key={item}>{highlightText(item, props.query)}</i>
                  ))}
                </span>
              </button>
            ))}
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
          </div>
          <div className="install-options">
            <div className="target-checkboxes">
              {TARGETS.map((target) => (
                <label key={target} className="target-checkbox">
                  <input
                    type="checkbox"
                    checked={props.installTargets.includes(target)}
                    onChange={(event) => {
                      if (event.target.checked) {
                        props.onInstallTargetsChange([...props.installTargets, target]);
                      } else {
                        props.onInstallTargetsChange(
                          props.installTargets.filter((t) => t !== target),
                        );
                      }
                    }}
                  />
                  <span>{target}</span>
                </label>
              ))}
            </div>
            <select
              value={props.installScope}
              onChange={(event) => props.onInstallScopeChange(event.target.value as LocationScope)}
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
          <MarkdownView markdown={props.detail?.markdown ?? ''} />
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

  function linkOptionsFor(item: InstalledSkill): string[] {
    return TARGETS.filter((target) => target !== item.target);
  }

  function defaultLinkTargets(item: InstalledSkill): string[] {
    const preferred = ['cursor', 'codex'].filter((target) => target !== item.target);
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
          {TARGETS.map((target) => (
            <option key={target} value={target}>
              {target}
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
                          <span>{target}</span>
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
