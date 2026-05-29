import {
  type ReactNode,
  Suspense,
  lazy,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import type {
  InstallTargetOption,
  SkillDetail,
  SkillSummary,
  Source,
  SourceWarning,
  TranslationConfig,
} from '../api/client';
import { Icon } from '../ui/Icon';

type LocationScope = 'project' | 'global';
type InstallStrategy = 'overwrite' | 'skip' | 'rename';

const SKILL_CARD_HEIGHT = 180;
const SKILL_GRID_GAP = 12;
const VIRTUAL_OVERSCAN_ROWS = 4;
const LazyTranslateMarkdownView = lazy(() =>
  import('./SkillDetailView').then((module) => ({
    default: module.TranslateMarkdownView,
  })),
);

function EmptyState({ children }: { children: string }) {
  return <div className="state">{children}</div>;
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
    const currentScrollElement = scrollRef.current;
    if (currentScrollElement === null) return;
    const scrollElement: HTMLElement = currentScrollElement;

    function updateViewport() {
      const scrollStyle = window.getComputedStyle(scrollElement);
      const usesPageScroll = scrollStyle.overflowY === 'visible';
      const contentEl = contentRef.current;
      const next = usesPageScroll
        ? {
            height: window.innerHeight,
            scrollTop: Math.max(0, -(contentEl?.getBoundingClientRect().top ?? 0)),
          }
        : {
            height: scrollElement.clientHeight,
            scrollTop: Math.max(0, scrollElement.scrollTop - (contentEl?.offsetTop ?? 0)),
          };
      setViewport((current) =>
        current.height === next.height && current.scrollTop === next.scrollTop
          ? current
          : next,
      );
    }

    updateViewport();
    scrollElement.addEventListener('scroll', updateViewport, { passive: true });
    window.addEventListener('scroll', updateViewport, { passive: true });
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(updateViewport);
    observer?.observe(scrollElement);
    if (contentRef.current) {
      observer?.observe(contentRef.current);
    }
    window.addEventListener('resize', updateViewport);
    return () => {
      scrollElement.removeEventListener('scroll', updateViewport);
      window.removeEventListener('scroll', updateViewport);
      observer?.disconnect();
      window.removeEventListener('resize', updateViewport);
    };
  }, [contentRef, resetKey, scrollRef]);

  useEffect(() => {
    const currentScrollElement = scrollRef.current;
    if (currentScrollElement === null) return;
    const scrollElement: HTMLElement = currentScrollElement;
    scrollElement.scrollTop = 0;
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
        <button type="button" className={active === '' ? 'active' : ''} onClick={() => onChange('')}>
          {t('common.all')}
        </button>
        {visibleTags.map((item) => (
          <button
            type="button"
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
              type="button"
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

function Info({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value || '-'}</strong>
    </div>
  );
}

export default function LibraryView(props: {
  detail: SkillDetail | null;
  installProjectDir: string;
  installScope: LocationScope;
  installStrategy: InstallStrategy;
  installTargets: string[];
  installTargetRows: InstallTargetOption[];
  loading: boolean;
  onCopyCommand: () => void;
  onInstall: () => void;
  onInstallProjectDirChange: (value: string) => void;
  onInstallScopeChange: (value: LocationScope) => void;
  onInstallStrategyChange: (value: InstallStrategy) => void;
  onInstallTargetsChange: (value: string[]) => void;
  onManageAgents: () => void;
  onOpenDetail: (name: string) => void;
  onQueryChange: (value: string) => void;
  onSelect: (value: string) => void;
  onShare: () => void;
  onSourceChange: (value: string) => void;
  onSelectProjectDir: () => void;
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
          {props.loading ? <EmptyState>{t('library.loading')}</EmptyState> : null}
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
                      const skillTags = Array.isArray(skill.tags) ? skill.tags : [];
                      return (
                        <button
                          type="button"
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
            <button type="button" className="button primary" onClick={props.onInstall} disabled={!activeSkill}>
              <Icon name="package" />
              {t('library.install')}
            </button>
            <button type="button" className="button" onClick={props.onCopyCommand} disabled={!activeSkill}>
              <Icon name="copy" />
              {t('library.copy')}
            </button>
            <button type="button" className="button" onClick={props.onShare} disabled={!activeSkill}>
              {t('library.share')}
            </button>
            <button
              type="button"
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
                          props.installTargets.filter((item) => item !== row.id),
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
            {props.installScope === 'project' ? (
              <div className="project-dir-field">
                <label>
                  <span>{t('library.projectDirLabel')}</span>
                  <input
                    value={props.installProjectDir}
                    onChange={(event) =>
                      props.onInstallProjectDirChange(event.target.value)
                    }
                    placeholder={t('library.projectDirPlaceholder')}
                  />
                </label>
                <button
                  type="button"
                  className="button"
                  onClick={props.onSelectProjectDir}
                >
                  <Icon name="folder" />
                  {t('library.projectDirChoose')}
                </button>
                <p>{t('library.projectDirHint')}</p>
              </div>
            ) : null}
          </div>
          <div className="meta-table">
            <Info label={t('library.metaVersion')} value={activeSkill?.version} />
            <Info label={t('library.metaAuthor')} value={activeSkill?.author} />
            <Info label={t('library.metaSource')} value={activeSkill?.sourceName} />
            <Info
              label={t('library.metaTargets')}
              value={props.detail?.installedTargets.join(', ') || t('library.notInstalled')}
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
          <Suspense fallback={<div className="state">加载预览中…</div>}>
            <LazyTranslateMarkdownView
              markdown={props.detail?.markdown ?? ''}
              cacheKey={activeSkill ? `translate:skill:${activeSkill.name}:SKILL.md` : ''}
              currentPath="SKILL.md"
              skillName={activeSkill?.name}
              source={props.source !== 'all' ? props.source : undefined}
              translationConfig={props.translationConfig}
            />
          </Suspense>
        </div>
      </aside>
    </section>
  );
}
