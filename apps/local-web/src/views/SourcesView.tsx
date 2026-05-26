import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Source } from '../api/client';
import { Icon } from '../ui/Icon';

export default function SourcesView({
  defaultSource,
  name,
  onAdd,
  onDelete,
  onEdit,
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
  onEdit: (source: Source) => void;
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
  const [confirmDeleteSource, setConfirmDeleteSource] = useState<string | null>(null);
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
            type="button"
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
          <button type="button" className="button" disabled={refreshing} onClick={onRestore}>
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
        <button type="button" className="button primary" disabled={refreshing} onClick={onAdd}>
          {t('sources.addSource')}
        </button>
      </div>
      <div className="source-list" aria-busy={refreshing}>
        {sources.map((source) => {
          const isLastEnabledSource = source.enabled && enabledCount <= 1;
          const cannotDelete = isLastEnabledSource;
          const deleteTitle =
            isLastEnabledSource
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
                <span className="source-description">{sourceDisplayDescription(source)}</span>
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
                  type="button"
                  className="button"
                  disabled={refreshing || isLastEnabledSource}
                  onClick={() => onToggle(source)}
                  title={isLastEnabledSource ? t('sources.toggleTitleLast') : undefined}
                >
                  {source.enabled ? t('sources.disable') : t('sources.enable')}
                </button>
                {source.domesticMirror ? (
                  <button
                    type="button"
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
                  type="button"
                  className="button"
                  disabled={refreshing}
                  onClick={() => onEdit(source)}
                >
                  {t('sources.edit')}
                </button>
                <button
                  type="button"
                  className="button danger"
                  disabled={refreshing || cannotDelete}
                  onClick={() => setConfirmDeleteSource(confirming ? null : source.name)}
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
                    type="button"
                    className="button danger"
                    onClick={async () => {
                      await onDelete(source.name);
                      setConfirmDeleteSource(null);
                    }}
                  >
                    {t('sources.delete')}
                  </button>
                  <button
                    type="button"
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
