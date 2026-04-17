import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  addSource,
  exportInstalledSkill,
  fetchInstalled,
  fetchSkillDetail,
  fetchSkills,
  fetchSources,
  installSkill,
  removeSource,
  removeInstalledSkill,
  updateSource,
  type InstalledSkill,
  type SkillDetail,
  type SkillSummary,
  type Source,
} from './api/client';

type View = 'library' | 'installed' | 'sources' | 'tags';
type LocationScope = 'project' | 'global';
type ScopeFilter = 'all' | LocationScope;
type InstallStrategy = 'overwrite' | 'skip' | 'rename';

const TARGETS = ['skills', 'claude', 'cursor', 'codex', 'agents', 'copilot'];

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
  tag: (
    <>
      <path d="M20 13 13 20 4 11V4h7l9 9z" />
      <path d="M8 8h.01" />
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

function npxCommand(skill: SkillSummary | SkillDetail | null): string {
  if (!skill?.name) return 'npx suit-skills@latest install <skill>';
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

type MarkdownBlock =
  | { kind: 'h1' | 'h2' | 'p' | 'pre'; text: string }
  | { kind: 'ul'; items: string[] };

function parseMarkdown(markdown: string): MarkdownBlock[] {
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
  return blocks.length ? blocks : [{ kind: 'p', text: 'No SKILL.md content.' }];
}

function MarkdownView({ markdown }: { markdown: string }) {
  const blocks = useMemo(() => parseMarkdown(markdown), [markdown]);
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

function highlightText(value: string, query: string): ReactNode {
  const needle = query.trim();
  if (!needle) return value;

  const lowerValue = value.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;

  while (cursor < value.length) {
    const index = lowerValue.indexOf(lowerNeedle, cursor);
    if (index === -1) {
      parts.push(value.slice(cursor));
      break;
    }
    if (index > cursor) {
      parts.push(value.slice(cursor, index));
    }
    const end = index + needle.length;
    parts.push(
      <mark className="search-hit" key={`${index}-${end}`}>
        {value.slice(index, end)}
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

export default function App() {
  const [view, setView] = useState<View>('library');
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
  const [installTarget, setInstallTarget] = useState('skills');
  const [installScope, setInstallScope] = useState<LocationScope>('project');
  const [installStrategy, setInstallStrategy] = useState<InstallStrategy>('skip');
  const [loading, setLoading] = useState(false);
  const [installedLoading, setInstalledLoading] = useState(false);
  const [error, setError] = useState('');
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
    try {
      const data = await fetchSkills({
        source: nextSource,
        q,
        tag: nextTag,
        refresh,
      });
      if (skillRequestId.current === requestId) {
        setSkills(data.items);
        setSelected((current) =>
          current && data.items.some((item) => item.name === current)
            ? current
            : data.items[0]?.name ?? '',
        );
      }
    } catch (err) {
      if (skillRequestId.current === requestId) {
        setError(err instanceof Error ? err.message : String(err));
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
      setError((current) => (current === 'Skill not found' ? '' : current));
      return;
    }
    fetchSkillDetail(selected, source)
      .then((nextDetail) => {
        if (detailRequestId.current === requestId) {
          setDetail(nextDetail);
          setError((current) => (current === 'Skill not found' ? '' : current));
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
      skill.tags?.forEach((item) => all.add(item));
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
    await copyText(npxCommand(activeSkill));
    notify('Command copied');
  }

  async function shareCommand() {
    if (!activeSkill) return;
    const text = [
      `Skill: ${activeSkill.name}`,
      `Version: ${activeSkill.version ?? 'unknown'}`,
      `Source: ${activeSkill.sourceName}`,
      `Tags: ${activeSkill.tags?.join(', ') ?? '-'}`,
      '',
      'Install:',
      npxCommand(activeSkill),
    ].join('\n');
    await copyText(text);
    notify('Share text copied');
  }

  async function installSelected() {
    if (!activeSkill) return;
    try {
      await installSkill({
        identifier: activeSkill.name,
        source: activeSkill.sourceName,
        targets: [installTarget],
        global: installScope === 'global',
        strategy: installStrategy,
      });
      notify('Installed');
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
      notify('Removed');
      await loadInstalled();
      await loadSkills();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function exportSkill(item: InstalledSkill) {
    try {
      await exportInstalledSkill({
        name: item.name,
        target: item.target,
        scope: item.scope,
      });
      notify('Export started');
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
      notify('Source added');
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
      notify(item.enabled ? 'Source disabled' : 'Source enabled');
      await loadSkills(nextSource);
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
      notify('Source removed');
      await loadSkills(nextSource);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="app-shell">
      <aside className="rail">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="terminal" />
          </span>
          <span>
            <strong>Suit Skills</strong>
            <small>web console</small>
          </span>
        </div>
        <nav className="nav" aria-label="Primary">
          <NavButton active={view === 'library'} onClick={() => setView('library')} icon="database" label="Skills" />
          <NavButton active={view === 'installed'} onClick={() => setView('installed')} icon="check" label="Installed" />
          <NavButton active={view === 'sources'} onClick={() => setView('sources')} icon="terminal" label="Sources" />
          <NavButton active={view === 'tags'} onClick={() => setView('tags')} icon="tag" label="Tags" />
        </nav>
        <div className="rail-status">
          <span>local index</span>
          <strong><i /> ready</strong>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="crumb">
            <strong>Suit Skills</strong>
            <span>/</span>
            <em>{view}</em>
          </div>
          <button className="icon-button" title="Refresh" onClick={() => {
            void loadSkills(source, debouncedQuery, tag, true);
            void loadInstalled();
          }}>
            <Icon name="refresh" />
          </button>
        </header>

        {error ? <ErrorState message={error} /> : null}
        {view === 'library' ? (
          <LibraryView
            detail={detail}
            installScope={installScope}
            installStrategy={installStrategy}
            installTarget={installTarget}
            loading={loading}
            onCopyCommand={copyCommand}
            onInstall={installSelected}
            onInstallScopeChange={setInstallScope}
            onInstallStrategyChange={setInstallStrategy}
            onInstallTargetChange={setInstallTarget}
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
            onExport={exportSkill}
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
            onToggle={toggleSource}
            onUrlChange={setSourceUrl}
            sources={sources}
            url={sourceUrl}
          />
        ) : null}
        {view === 'tags' ? <TagsView tags={tags} onSelectTag={(next) => {
          setTag(next);
          setView('library');
        }} /> : null}
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
  installTarget: string;
  loading: boolean;
  onCopyCommand: () => void;
  onInstall: () => void;
  onInstallScopeChange: (value: LocationScope) => void;
  onInstallStrategyChange: (value: InstallStrategy) => void;
  onInstallTargetChange: (value: string) => void;
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
  sources: Source[];
  tag: string;
  tags: string[];
}) {
  const activeSkill = props.detail ?? props.selectedSummary;
  return (
    <section className="console-grid">
      <div className="library">
        <div className="toolbar">
          <label className="search">
            <Icon name="search" />
            <input
              value={props.query}
              onChange={(event) => props.onQueryChange(event.target.value)}
              placeholder="Search skills, tags, descriptions"
            />
          </label>
          <select
            value={props.source}
            onChange={(event) => props.onSourceChange(event.target.value)}
          >
            <option value="all">all enabled</option>
            {props.sources.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
        </div>

        <TagRow active={props.tag} tags={props.tags} onChange={props.onTagChange} />

        {props.loading ? <EmptyState>Scanning source cache...</EmptyState> : null}
        {!props.loading && props.skills.length === 0 ? (
          <EmptyState>
            {props.sources.length === 0
              ? 'No enabled sources.'
              : 'No matching skills.'}
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
                    skill.installed ? 'installed' : `v${skill.version ?? 'unknown'}`,
                    props.query,
                  )}
                </em>
              </span>
              <strong>{highlightText(skill.name, props.query)}</strong>
              <span>{highlightText(skill.description || 'No description', props.query)}</span>
              <span className="card-tags">
                {skill.tags?.slice(0, 4).map((item) => (
                  <i key={item}>{highlightText(item, props.query)}</i>
                ))}
              </span>
            </button>
          ))}
        </div>
      </div>

      <aside className="detail">
        <div className="detail-hero">
          <h1>{activeSkill?.name ?? 'Skill detail'}</h1>
          <p>{activeSkill?.description ?? 'Select a skill.'}</p>
        </div>
        <div className="detail-body">
          <div className="action-row">
            <button className="button primary" onClick={props.onInstall} disabled={!activeSkill}>
              <Icon name="package" />
              Install
            </button>
            <button className="button" onClick={props.onCopyCommand} disabled={!activeSkill}>
              <Icon name="copy" />
              Copy
            </button>
            <button className="button" onClick={props.onShare} disabled={!activeSkill}>
              Share
            </button>
          </div>
          <div className="install-options">
            <select
              value={props.installTarget}
              onChange={(event) => props.onInstallTargetChange(event.target.value)}
            >
              {TARGETS.map((target) => (
                <option key={target} value={target}>
                  {target}
                </option>
              ))}
            </select>
            <select
              value={props.installScope}
              onChange={(event) => props.onInstallScopeChange(event.target.value as LocationScope)}
            >
              <option value="project">project</option>
              <option value="global">global</option>
            </select>
            <select
              value={props.installStrategy}
              onChange={(event) =>
                props.onInstallStrategyChange(event.target.value as InstallStrategy)
              }
            >
              <option value="skip">skip</option>
              <option value="overwrite">overwrite</option>
              <option value="rename">rename</option>
            </select>
          </div>
          <div className="meta-table">
            <Info label="Version" value={activeSkill?.version} />
            <Info label="Author" value={activeSkill?.author} />
            <Info label="Source" value={activeSkill?.sourceName} />
            <Info
              label="Targets"
              value={props.detail?.installedTargets.join(', ') || 'not installed'}
            />
            <Info label="Metadata" value={activeSkill?.metadataSource} />
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
  return (
    <div className="tag-row">
      <button className={active === '' ? 'active' : ''} onClick={() => onChange('')}>
        all
      </button>
      {tags.map((item) => (
        <button className={active === item ? 'active' : ''} key={item} onClick={() => onChange(item)}>
          {item}
        </button>
      ))}
    </div>
  );
}

function InstalledView(props: {
  confirmRemove: string | null;
  installed: InstalledSkill[];
  loading: boolean;
  onConfirmRemove: (value: string | null) => void;
  onExport: (item: InstalledSkill) => void;
  onQueryChange: (value: string) => void;
  onRemove: (item: InstalledSkill) => void;
  onScopeChange: (value: ScopeFilter) => void;
  onTargetChange: (value: string) => void;
  query: string;
  scope: ScopeFilter;
  target: string;
}) {
  return (
    <section className="installed-page">
      <div className="page-head">
        <h1>Installed Skills</h1>
      </div>
      <div className="toolbar installed-toolbar">
        <label className="search">
          <Icon name="search" />
          <input
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder="Search installed skills"
          />
        </label>
        <select
          value={props.target}
          onChange={(event) => props.onTargetChange(event.target.value)}
        >
          <option value="">all targets</option>
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
          <option value="all">all locations</option>
          <option value="project">workspace</option>
          <option value="global">user</option>
        </select>
      </div>

      {props.loading ? <EmptyState>Scanning installed directories...</EmptyState> : null}
      {!props.loading && props.installed.length === 0 ? (
        <EmptyState>No installed skills found.</EmptyState>
      ) : null}

      <div className="installed-list">
        {props.installed.map((item) => {
          const key = `${item.scope}:${item.target}:${item.name}`;
          const confirming = props.confirmRemove === key;
          return (
            <article key={key}>
              <div className="installed-main">
                <strong>{highlightText(item.name, props.query)}</strong>
                <span>{highlightText(item.description || 'No description', props.query)}</span>
                <code>{highlightText(item.path, props.query)}</code>
              </div>
              <div className="installed-meta">
                <b>{highlightText(item.target, props.query)}</b>
                <span>{highlightText(item.scope, props.query)}</span>
                <span>{highlightText(item.version ?? 'unknown', props.query)}</span>
              </div>
              <div className="installed-actions">
                <button className="icon-button" title="Export zip" onClick={() => props.onExport(item)}>
                  <Icon name="package" />
                </button>
                <button className="icon-button danger" title="Remove" onClick={() => props.onConfirmRemove(confirming ? null : key)}>
                  <Icon name="trash" />
                </button>
              </div>
              {confirming ? (
                <div className="confirm-strip">
                  <span>{item.path}</span>
                  <button className="button danger" onClick={() => props.onRemove(item)}>
                    Remove
                  </button>
                  <button className="button" onClick={() => props.onConfirmRemove(null)}>
                    Cancel
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

function SourcesView({
  defaultSource,
  name,
  onAdd,
  onDelete,
  onNameChange,
  onToggle,
  onUrlChange,
  sources,
  url,
}: {
  defaultSource: string;
  name: string;
  onAdd: () => void;
  onDelete: (name: string) => void;
  onNameChange: (value: string) => void;
  onToggle: (source: Source) => void;
  onUrlChange: (value: string) => void;
  sources: Source[];
  url: string;
}) {
  const enabledCount = sources.filter((source) => source.enabled).length;

  return (
    <section className="installed-page">
      <div className="page-head">
        <h1>Sources</h1>
      </div>
      <div className="source-form">
        <label>
          <span>Name</span>
          <input
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="team-skills"
          />
        </label>
        <label>
          <span>Git URL</span>
          <input
            value={url}
            onChange={(event) => onUrlChange(event.target.value)}
            placeholder="https://github.com/acme/skills.git"
          />
        </label>
        <button className="button primary" onClick={onAdd}>
          Add source
        </button>
      </div>
      <div className="source-list">
        {sources.map((source) => {
          const isLastEnabledSource = source.enabled && enabledCount <= 1;
          return (
            <article key={source.name}>
              <div className="source-main">
                <strong>
                  {source.name}
                  {source.name === defaultSource ? <i>default</i> : null}
                </strong>
                <code>{source.url}</code>
              </div>
              <span className={source.enabled ? 'source-status on' : 'source-status'}>
                {source.enabled ? 'enabled' : 'disabled'}
              </span>
              <div className="source-actions">
                <button
                  className="button"
                  disabled={isLastEnabledSource}
                  onClick={() => onToggle(source)}
                  title={
                    isLastEnabledSource
                      ? 'At least one source must stay enabled'
                      : undefined
                  }
                >
                  {source.enabled ? 'Disable' : 'Enable'}
                </button>
                <button
                  className="button danger"
                  disabled={
                    source.name === defaultSource ||
                    source.name === 'default' ||
                    isLastEnabledSource
                  }
                  onClick={() => onDelete(source.name)}
                  title={
                    isLastEnabledSource
                      ? 'At least one source must stay enabled'
                      : undefined
                  }
                >
                  Delete
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function TagsView({
  tags,
  onSelectTag,
}: {
  tags: string[];
  onSelectTag: (value: string) => void;
}) {
  return (
    <section className="installed-page">
      <div className="page-head">
        <h1>Tags</h1>
      </div>
      <div className="tag-cloud">
        {tags.map((tag) => (
          <button key={tag} onClick={() => onSelectTag(tag)}>
            {tag}
          </button>
        ))}
        {tags.length === 0 ? <EmptyState>No tags in the current result set.</EmptyState> : null}
      </div>
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
