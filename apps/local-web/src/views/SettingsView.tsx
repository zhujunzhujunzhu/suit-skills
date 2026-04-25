import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AiEditConfig,
  AppSettings,
  InstallTargetOption,
  SkillLibraryTarget,
  TranslationConfig,
} from '../api/client';
import {
  buildThemePreviewVariables,
  CLASSIC_THEME_VARIABLES,
  normalizeHexColor,
  type ThemeDraft,
} from '../theme/customTheme';
import { Icon } from '../ui/Icon';

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
        <button type="button" className="button" onClick={() => void onRefresh()}>
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
          type="button"
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
                <button type="button" className="button" onClick={() => beginEdit(row)}>
                  {t('agents.edit')}
                </button>
                <button
                  type="button"
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
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => void submitEdit(row.id)}
                  >
                    {t('agents.save')}
                  </button>
                  <button type="button" className="button" onClick={() => setEditingId(null)}>
                    {t('installed.cancel')}
                  </button>
                </div>
              ) : null}

              {deleting ? (
                <div className="confirm-strip source-confirm-strip">
                  <span>{t('agents.confirmDelete', { name: row.label })}</span>
                  <button
                    type="button"
                    className="button danger"
                    onClick={async () => {
                      await onDelete(row.id);
                      setConfirmDelete(null);
                    }}
                  >
                    {t('agents.delete')}
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={() => setConfirmDelete(null)}
                  >
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

export default function SettingsView({
  installTargetRows,
  library,
  onAdd,
  onBack,
  onDelete,
  onRefresh,
  onAiEditSave,
  onSettingsChange,
  onTranslationSave,
  onUpdate,
  aiEditConfig,
  settings,
  translationConfig,
}: {
  installTargetRows: InstallTargetOption[];
  library: SkillLibraryTarget | null;
  onAdd: (id: string, globalDir: string, projectDir: string) => Promise<void>;
  onBack: () => void;
  onDelete: (id: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onAiEditSave: (config: AiEditConfig) => Promise<void>;
  onSettingsChange: (settings: Partial<AppSettings>) => Promise<void>;
  onTranslationSave: (config: TranslationConfig) => Promise<void>;
  onUpdate: (id: string, globalDir: string, projectDir: string) => Promise<void>;
  aiEditConfig: AiEditConfig;
  settings: AppSettings;
  translationConfig: TranslationConfig;
}) {
  const { t } = useTranslation();
  const tt = (key: string, defaultValue: string) => t(key, { defaultValue });
  const [translationDraft, setTranslationDraft] =
    useState<TranslationConfig>(translationConfig);
  const [translationSaving, setTranslationSaving] = useState(false);
  const [aiEditDraft, setAiEditDraft] =
    useState<AiEditConfig>(aiEditConfig);
  const [aiEditSaving, setAiEditSaving] = useState(false);
  const [themeDraft, setThemeDraft] = useState<ThemeDraft>({
    themeMode: settings.themeMode,
    themeColor: settings.themeColor,
  });
  const [themeSaving, setThemeSaving] = useState(false);

  useEffect(() => {
    setTranslationDraft(translationConfig);
  }, [translationConfig]);

  useEffect(() => {
    setAiEditDraft(aiEditConfig);
  }, [aiEditConfig]);

  useEffect(() => {
    setThemeDraft({
      themeMode: settings.themeMode,
      themeColor: settings.themeColor,
    });
  }, [settings.themeColor, settings.themeMode]);

  const themePreviewVariables = useMemo(
    () => buildThemePreviewVariables(themeDraft),
    [themeDraft],
  );
  const themePreviewStyle = themePreviewVariables as CSSProperties;
  const themeSwatches = [
    themePreviewVariables['--surface-high'],
    themePreviewVariables['--primary'],
    themePreviewVariables['--secondary'],
    themePreviewVariables['--tertiary'],
  ];

  return (
    <section className="settings-page" aria-label={tt('settings.title', '设置')}>
      <div className="settings-sheet">
        <div className="settings-head">
          <button type="button" className="button settings-back-btn" onClick={onBack}>
            <Icon name="arrow-left" />
            {tt('settings.back', '返回')}
          </button>
          <div className="settings-head-text">
            <h1>{tt('settings.title', '设置')}</h1>
            <p>
              {tt(
                'settings.subtitle',
                '管理源缓存、桌面行为和 Agent 目标位置。',
              )}
            </p>
          </div>
        </div>

        <div className="settings-group">
          <h2>{tt('settings.refreshTitle', '源缓存')}</h2>
          <label className="settings-row">
            <span>
              <b>{tt('settings.refreshInterval', '检查间隔')}</b>
              <em>
                {tt(
                  'settings.refreshHint',
                  '搜索会优先使用本地缓存，超过间隔才检查远端；手动刷新始终立即检查。',
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
              <em>
                {tt(
                  'settings.minimizeToTrayHint',
                  '点击关闭按钮时隐藏窗口，可从托盘图标恢复。',
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
          <h2>{tt('settings.themeTitle', '主题')}</h2>
          <p className="settings-hint">
            {tt(
              'settings.themeHint',
              '默认保留经典主题配色，也可以切换为自定义主色；系统会自动生成整套深色主题。',
            )}
          </p>
          <div className="settings-theme-grid">
            <button
              type="button"
              className={`theme-card ${themeDraft.themeMode === 'default' ? 'active' : ''}`}
              onClick={() =>
                setThemeDraft((current) => ({ ...current, themeMode: 'default' }))
              }
            >
              <span className="theme-card-head">
                <strong>{tt('settings.themeDefault', '默认主题')}</strong>
                <em>{tt('settings.themeDefaultHint', '经典黄绿配色')}</em>
              </span>
              <span className="theme-preview-strip">
                {[
                  CLASSIC_THEME_VARIABLES['--surface-high'],
                  CLASSIC_THEME_VARIABLES['--primary'],
                  CLASSIC_THEME_VARIABLES['--secondary'],
                  CLASSIC_THEME_VARIABLES['--tertiary'],
                ].map((color, index) => (
                  <i
                    key={`${color}-${index}`}
                    className="theme-preview-swatch"
                    style={{ background: color }}
                  />
                ))}
              </span>
            </button>

            <button
              type="button"
              className={`theme-card ${themeDraft.themeMode === 'custom' ? 'active' : ''}`}
              onClick={() =>
                setThemeDraft((current) => ({ ...current, themeMode: 'custom' }))
              }
            >
              <span className="theme-card-head">
                <strong>{tt('settings.themeCustom', '自定义主题')}</strong>
                <em>{tt('settings.themeCustomHint', '用主色自动派生整套配色')}</em>
              </span>
              <span className="theme-preview-strip">
                {themeSwatches.map((color, index) => (
                  <i
                    key={`${color}-${index}`}
                    className="theme-preview-swatch"
                    style={{ background: color }}
                  />
                ))}
              </span>
            </button>
          </div>

          <label className="settings-row">
            <span>
              <b>{tt('settings.themeColor', '主题主色')}</b>
              <em>{tt('settings.themeColorHint', '选择后会影响按钮、高亮、卡片强调色和整体氛围')}</em>
            </span>
            <div className="theme-color-control">
              <input
                type="color"
                className="theme-color-input"
                value={normalizeHexColor(themeDraft.themeColor)}
                disabled={themeDraft.themeMode !== 'custom'}
                onChange={(event) =>
                  setThemeDraft((current) => ({
                    ...current,
                    themeColor: normalizeHexColor(event.target.value),
                  }))
                }
              />
              <code className="theme-color-value">
                {normalizeHexColor(themeDraft.themeColor)}
              </code>
            </div>
          </label>

          <div className="theme-preview-panel" style={themePreviewStyle}>
            <div className="theme-preview-panel-top">
              <strong>{tt('settings.themePreview', '主题预览')}</strong>
              <span>{tt('settings.themePreviewHint', '保存后会立即应用到整个界面')}</span>
            </div>
            <div className="theme-preview-panel-body">
              <div className="theme-preview-surface">
                <span>{tt('settings.themePreviewSurface', '面板')}</span>
                <button type="button" className="button primary">
                  {tt('settings.themePreviewPrimary', '主按钮')}
                </button>
              </div>
              <div className="theme-preview-meta">
                <i style={{ background: 'var(--primary)' }} />
                <i style={{ background: 'var(--secondary)' }} />
                <i style={{ background: 'var(--tertiary)' }} />
              </div>
            </div>
          </div>

          <div className="settings-row settings-row-actions">
            <button
              type="button"
              className="button primary"
              disabled={themeSaving}
              onClick={() => {
                setThemeSaving(true);
                void onSettingsChange({
                  themeMode: themeDraft.themeMode,
                  themeColor: normalizeHexColor(themeDraft.themeColor),
                }).finally(() => {
                  setThemeSaving(false);
                });
              }}
            >
              {themeSaving
                ? tt('settings.themeSaving', '保存中…')
                : tt('settings.themeSave', '保存主题设置')}
            </button>
          </div>
        </div>

        <div className="settings-group">
          <h2>{tt('settings.translationTitle', '翻译服务')}</h2>
          <p className="settings-hint">
            {tt(
              'settings.translationHint',
              '修改后请点击“保存翻译设置”写入配置文件，不会在输入时自动保存。',
            )}
          </p>
          <label className="settings-row">
            <span>
              <b>{tt('settings.translationProvider', '翻译提供方')}</b>
              <em>{tt('settings.translationProviderHint', '选择翻译英文 Skill 内容所使用的服务')}</em>
            </span>
            <select
              value={translationDraft.provider}
              onChange={(event) =>
                setTranslationDraft((draft) => ({
                  ...draft,
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
                    setTranslationDraft((draft) => ({
                      ...draft,
                      apiBaseUrl: event.target.value,
                    }))
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
                    setTranslationDraft((draft) => ({
                      ...draft,
                      apiKey: event.target.value,
                    }))
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
                    setTranslationDraft((draft) => ({
                      ...draft,
                      model: event.target.value,
                    }))
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
                    setTranslationDraft((draft) => ({
                      ...draft,
                      cliCommand: event.target.value,
                    }))
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
                    setTranslationDraft((draft) => ({
                      ...draft,
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

        <div className="settings-group">
          <h2>{tt('settings.aiEditTitle', 'AI 修改')}</h2>
          <p className="settings-hint">
            {tt(
              'settings.aiEditHint',
              '用于生成 skill 改写建议和预览。系统会先展示改动，再由你确认应用。',
            )}
          </p>
          <label className="settings-row">
            <span>
              <b>{tt('settings.aiEditProvider', 'AI 提供方')}</b>
              <em>{tt('settings.aiEditProviderHint', '选择用于本地 skill 改写的服务')}</em>
            </span>
            <select
              value={aiEditDraft.provider}
              onChange={(event) =>
                setAiEditDraft((draft) => ({
                  ...draft,
                  provider: event.target.value as AiEditConfig['provider'],
                }))
              }
            >
              <option value="none">{tt('settings.aiEditNone', '不启用')}</option>
              <option value="openai">{tt('settings.aiEditOpenai', 'OpenAI 兼容 API')}</option>
              <option value="cli">{tt('settings.aiEditCli', '本地 AI CLI 命令')}</option>
            </select>
          </label>

          {aiEditDraft.provider === 'openai' ? (
            <>
              <label className="settings-row">
                <span>
                  <b>{tt('settings.aiEditApiUrl', 'API 地址')}</b>
                  <em>{tt('settings.aiEditApiUrlHint', '留空使用 OpenAI 默认地址')}</em>
                </span>
                <input
                  type="text"
                  placeholder="https://api.openai.com/v1"
                  value={aiEditDraft.apiBaseUrl ?? ''}
                  onChange={(event) =>
                    setAiEditDraft((draft) => ({
                      ...draft,
                      apiBaseUrl: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="settings-row">
                <span><b>{tt('settings.aiEditApiKey', 'API Key')}</b></span>
                <input
                  type="password"
                  placeholder="sk-..."
                  value={aiEditDraft.apiKey ?? ''}
                  onChange={(event) =>
                    setAiEditDraft((draft) => ({
                      ...draft,
                      apiKey: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="settings-row">
                <span>
                  <b>{tt('settings.aiEditModel', '模型')}</b>
                  <em>{tt('settings.aiEditModelHint', '留空使用 gpt-4o-mini')}</em>
                </span>
                <input
                  type="text"
                  placeholder="gpt-4o-mini"
                  value={aiEditDraft.model ?? ''}
                  onChange={(event) =>
                    setAiEditDraft((draft) => ({
                      ...draft,
                      model: event.target.value,
                    }))
                  }
                />
              </label>
            </>
          ) : null}

          {aiEditDraft.provider === 'cli' ? (
            <>
              <label className="settings-row">
                <span>
                  <b>{tt('settings.aiEditCliCmd', 'CLI 命令')}</b>
                  <em>
                    {tt(
                      'settings.aiEditCliCmdHint',
                      '如 claude、openai 等，编辑请求会通过 stdin 传入',
                    )}
                  </em>
                </span>
                <input
                  type="text"
                  placeholder="claude"
                  value={aiEditDraft.cliCommand ?? ''}
                  onChange={(event) =>
                    setAiEditDraft((draft) => ({
                      ...draft,
                      cliCommand: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="settings-row">
                <span>
                  <b>{tt('settings.aiEditCliArgs', '附加参数')}</b>
                  <em>{tt('settings.aiEditCliArgsHint', '空格分隔，如 --model gpt-5')}</em>
                </span>
                <input
                  type="text"
                  placeholder="--model gpt-5"
                  value={(aiEditDraft.cliArgs ?? []).join(' ')}
                  onChange={(event) =>
                    setAiEditDraft((draft) => ({
                      ...draft,
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
              disabled={aiEditSaving}
              onClick={() => {
                setAiEditSaving(true);
                void onAiEditSave(aiEditDraft).finally(() => {
                  setAiEditSaving(false);
                });
              }}
            >
              {aiEditSaving
                ? tt('settings.aiEditSaving', '保存中…')
                : tt('settings.aiEditSave', '保存 AI 修改设置')}
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
