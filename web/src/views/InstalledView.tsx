import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { InstalledSkill, InstallTargetOption } from '../api/client';
import { Icon } from '../ui/Icon';

type LocationScope = 'project' | 'global';
type ScopeFilter = 'all' | LocationScope;

function EmptyState({ children }: { children: string }) {
  return <div className="state">{children}</div>;
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

export default function InstalledView(props: {
  confirmRemove: string | null;
  installTargetRows: InstallTargetOption[];
  installed: InstalledSkill[];
  loading: boolean;
  onConfirmRemove: (value: string | null) => void;
  onCopyPackage: (item: InstalledSkill) => void;
  onOpenEditor: (item: InstalledSkill) => void;
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
                  props.installTargetRows.find((row) => row.id === targetId)?.label ??
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
                    type="button"
                    className="icon-button"
                    title={t('installed.editTitle', { defaultValue: '编辑本地技能' })}
                    onClick={() => props.onOpenEditor(item)}
                  >
                    <Icon name="edit" />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    title={t('installed.copyZipTitle')}
                    onClick={() => props.onCopyPackage(item)}
                  >
                    <Icon name="copy" />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    title={t('installed.linkTargetsTitle')}
                    onClick={() => openLinkPicker(key, item)}
                  >
                    <Icon name="link" />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    title={t('installed.exportZipTitle')}
                    onClick={() => props.onExport(item)}
                  >
                    <Icon name="package" />
                  </button>
                  <button
                    type="button"
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
                                props.installTargetRows.find((row) => row.id === target)
                                  ?.label ?? target,
                            })}
                          </span>
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="button primary"
                      disabled={selectedTargets.length === 0}
                      onClick={() => {
                        props.onLinkTargets(item, selectedTargets);
                        setLinkTargetKey(null);
                      }}
                    >
                      {t('installed.apply')}
                    </button>
                    <button
                      type="button"
                      className="button"
                      onClick={() => setLinkTargetKey(null)}
                    >
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
                    <button
                      type="button"
                      className="button danger"
                      onClick={() => props.onRemove(item)}
                    >
                      {t('installed.delete')}
                    </button>
                    <button
                      type="button"
                      className="button"
                      onClick={() => props.onConfirmRemove(null)}
                    >
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
