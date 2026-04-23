import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  applyInstalledSkillAiEdit,
  generateInstalledSkillAiEdit,
  fetchInstalledSkillFileContent,
  fetchInstalledSkillFiles,
  resetInstalledSkill,
  resetInstalledSkillFile,
  saveInstalledSkillFile,
  type AiEditConfig,
  type AiEditPreviewResult,
  type InstalledSkill,
  type SkillFileContent,
  type SkillFileNode,
} from '../api/client';
import { Icon } from '../ui/Icon';

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

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
      const found = findSkillMdInTree(node.children);
      if (found) return found;
    }
  }
  return undefined;
}

function ancestorDirPaths(filePath: string): string[] {
  const parts = filePath.split('/').filter(Boolean);
  if (parts.length <= 1) return [];
  const dirs: string[] = [];
  for (let i = 0; i < parts.length - 1; i += 1) {
    dirs.push(parts.slice(0, i + 1).join('/'));
  }
  return dirs;
}

function hasFilePath(nodes: SkillFileNode[] | undefined, filePath: string): boolean {
  if (!Array.isArray(nodes) || !filePath) return false;
  for (const node of nodes) {
    if (node.type === 'file' && node.path === filePath) {
      return true;
    }
    if (node.type === 'dir' && hasFilePath(node.children, filePath)) {
      return true;
    }
  }
  return false;
}

function firstFilePath(nodes: SkillFileNode[] | undefined): string {
  if (!Array.isArray(nodes)) return '';
  for (const node of nodes) {
    if (node.type === 'file') {
      return node.path;
    }
    if (node.type === 'dir') {
      const nested = firstFilePath(node.children);
      if (nested) return nested;
    }
  }
  return '';
}

function FileTreeNode({
  node,
  depth,
  expandedDirs,
  onSelectFile,
  onToggleDir,
  selectedPath,
}: {
  node: SkillFileNode;
  depth: number;
  expandedDirs: Set<string>;
  onSelectFile: (path: string) => void;
  onToggleDir: (path: string) => void;
  selectedPath: string;
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
                expandedDirs={expandedDirs}
                onSelectFile={onSelectFile}
                onToggleDir={onToggleDir}
                selectedPath={selectedPath}
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

function ImagePreview({ content }: { content: SkillFileContent }) {
  if (!content.contentBase64) return null;
  const mime = MIME_MAP[content.ext] ?? 'image/png';
  return (
    <div className="file-content-image">
      <img src={`data:${mime};base64,${content.contentBase64}`} alt={content.path} />
    </div>
  );
}

export default function InstalledSkillEditorView({
  aiEditConfig,
  item,
  onBack,
}: {
  aiEditConfig: AiEditConfig;
  item: InstalledSkill;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<SkillFileNode[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [filesError, setFilesError] = useState('');
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => new Set());
  const [selectedPath, setSelectedPath] = useState('');
  const [fileContent, setFileContent] = useState<SkillFileContent | null>(null);
  const [draft, setDraft] = useState('');
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiMode, setAiMode] = useState<'file' | 'skill'>('file');
  const [aiWorking, setAiWorking] = useState(false);
  const [aiPreview, setAiPreview] = useState<AiEditPreviewResult | null>(null);
  const [aiError, setAiError] = useState('');

  const isTextEditable =
    fileContent?.encoding === 'text' && fileContent.previewable === true;
  const dirty = isTextEditable && draft !== (fileContent?.content ?? '');

  const toggleDir = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const confirmDiscard = useCallback(() => {
    if (!dirty) return true;
    return window.confirm(
      t('installed.discardUnsaved', {
        defaultValue: '当前文件有未保存修改，是否放弃这些修改？',
      }),
    );
  }, [dirty, t]);

  const loadFileContent = useCallback(
    async (path: string) => {
      setLoadingContent(true);
      setStatusText('');
      try {
        const nextContent = await fetchInstalledSkillFileContent({
          name: item.name,
          target: item.target,
          scope: item.scope,
          filePath: path,
        });
        setFileContent(nextContent);
        setDraft(nextContent.content ?? '');
      } catch (err) {
        setFileContent({
          path,
          encoding: 'binary',
          previewable: false,
          ext: '',
          size: 0,
          content:
            err instanceof Error
              ? err.message
              : t('common.unknown', { defaultValue: '未知错误' }),
        });
      } finally {
        setLoadingContent(false);
      }
    },
    [item.name, item.scope, item.target, t],
  );

  const loadFiles = useCallback(
    async (preferredPath?: string, forceReloadSelection = false) => {
      setLoadingFiles(true);
      setFilesError('');
      try {
        const data = await fetchInstalledSkillFiles({
          name: item.name,
          target: item.target,
          scope: item.scope,
        });
        const nextFiles = normalizeSkillFileList(data?.files);
        setFiles(nextFiles);

        const nextPath =
          (preferredPath && hasFilePath(nextFiles, preferredPath) ? preferredPath : '') ||
          findSkillMdInTree(nextFiles)?.path ||
          firstFilePath(nextFiles);

        if (nextPath) {
          setExpandedDirs((prev) => {
            const next = new Set(prev);
            for (const dir of ancestorDirPaths(nextPath)) {
              next.add(dir);
            }
            return next;
          });
        }

        if (!nextPath) {
          setSelectedPath('');
          setFileContent(null);
          setDraft('');
          return;
        }

        if (forceReloadSelection && preferredPath && nextPath === preferredPath) {
          await loadFileContent(nextPath);
          return;
        }

        setSelectedPath(nextPath);
      } catch (err) {
        setFiles([]);
        setSelectedPath('');
        setFileContent(null);
        setDraft('');
        setFilesError(err instanceof Error ? err.message : '加载文件列表失败');
      } finally {
        setLoadingFiles(false);
      }
    },
    [item.name, item.scope, item.target, loadFileContent],
  );

  useEffect(() => {
    setFiles([]);
    setSelectedPath('');
    setFileContent(null);
    setDraft('');
    setStatusText('');
    setExpandedDirs(new Set());
    void loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    setAiPreview(null);
    setAiError('');
  }, [aiMode, item.name, item.scope, item.target, selectedPath]);

  useEffect(() => {
    if (!selectedPath) return;
    void loadFileContent(selectedPath);
  }, [loadFileContent, selectedPath]);

  async function handleSave() {
    if (!selectedPath || !isTextEditable || !dirty) return;
    setSaving(true);
    setStatusText('');
    try {
        const saved = await saveInstalledSkillFile({
        name: item.name,
        target: item.target,
        scope: item.scope,
        filePath: selectedPath,
        content: draft,
      });
      setFileContent(saved);
      setDraft(saved.content ?? '');
      setStatusText(
        t('installed.saveSuccess', { defaultValue: '已保存到本地技能文件' }),
      );
    } catch (err) {
      setStatusText(
        err instanceof Error ? err.message : t('common.unknown', { defaultValue: '未知错误' }),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleResetFile() {
    if (!selectedPath) return;
    if (!confirmDiscard()) return;
    if (
      !window.confirm(
        t('installed.resetFileConfirm', {
          defaultValue: '将当前文件恢复到安装时的原版？此操作会覆盖已保存修改。',
        }),
      )
    ) {
      return;
    }

    setSaving(true);
    setStatusText('');
    try {
      const result = await resetInstalledSkillFile({
        name: item.name,
        target: item.target,
        scope: item.scope,
        filePath: selectedPath,
      });
      if (result.status === 'removed') {
        await loadFiles(undefined, true);
        setStatusText(
          t('installed.resetFileRemoved', {
            defaultValue: '当前文件不在原版中，已从 skill 中移除。',
          }),
        );
        return;
      }

      if (result.file) {
        setFileContent(result.file);
        setDraft(result.file.content ?? '');
      } else {
        await loadFileContent(selectedPath);
      }
      setStatusText(
        t('installed.resetFileSuccess', {
          defaultValue: '已恢复当前文件到安装原版。',
        }),
      );
    } catch (err) {
      setStatusText(
        err instanceof Error ? err.message : t('common.unknown', { defaultValue: '未知错误' }),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleResetSkill() {
    if (!confirmDiscard()) return;
    if (
      !window.confirm(
        t('installed.resetSkillConfirm', {
          defaultValue: '将整个 skill 恢复到安装时原版？所有已保存修改都将被覆盖。',
        }),
      )
    ) {
      return;
    }

    setSaving(true);
    setStatusText('');
    try {
      await resetInstalledSkill({
        name: item.name,
        target: item.target,
        scope: item.scope,
      });
      await loadFiles(selectedPath, true);
      setStatusText(
        t('installed.resetSkillSuccess', {
          defaultValue: '已恢复整个 skill 到安装原版。',
        }),
      );
    } catch (err) {
      setStatusText(
        err instanceof Error ? err.message : t('common.unknown', { defaultValue: '未知错误' }),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateAiEdit() {
    if (!aiPrompt.trim()) return;
    if (aiMode === 'file' && !selectedPath) return;
    if (aiMode === 'file' && !isTextEditable) {
      setAiError(
        t('installed.aiNeedsTextFile', {
          defaultValue: '当前文件不是可编辑文本文件，请切换到文本文件或改用整个 skill 模式。',
        }),
      );
      return;
    }

    setAiWorking(true);
    setAiError('');
    setAiPreview(null);
    try {
      const preview = await generateInstalledSkillAiEdit({
        name: item.name,
        target: item.target,
        scope: item.scope,
        mode: aiMode,
        filePath: aiMode === 'file' ? selectedPath : undefined,
        prompt: aiPrompt,
      });
      setAiPreview(preview);
      if (preview.files.length === 0) {
        setAiError(
          t('installed.aiNoChanges', {
            defaultValue: 'AI 没有生成可应用的改动。',
          }),
        );
      }
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : t('common.unknown', { defaultValue: '未知错误' }),
      );
    } finally {
      setAiWorking(false);
    }
  }

  async function handleApplyAiEdit() {
    if (!aiPreview || aiPreview.files.length === 0) return;
    if (!confirmDiscard()) return;
    if (!window.confirm(
      t('installed.aiApplyConfirm', {
        defaultValue: '确认将 AI 预览中的改动写入本地 skill 吗？',
      }),
    )) {
      return;
    }

    setAiWorking(true);
    setAiError('');
    try {
      await applyInstalledSkillAiEdit({
        name: item.name,
        target: item.target,
        scope: item.scope,
        files: aiPreview.files.map((file) => ({
          path: file.path,
          content: file.afterContent,
        })),
      });
      await loadFiles(selectedPath || undefined, true);
      setAiPreview(null);
      setStatusText(
        t('installed.aiApplySuccess', {
          defaultValue: 'AI 改动已应用到本地 skill。',
        }),
      );
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : t('common.unknown', { defaultValue: '未知错误' }),
      );
    } finally {
      setAiWorking(false);
    }
  }

  function handleSelectFile(path: string) {
    if (path === selectedPath) return;
    if (!confirmDiscard()) return;
    setSelectedPath(path);
  }

  function handleBack() {
    if (!confirmDiscard()) return;
    onBack();
  }

  function handleReload() {
    if (!confirmDiscard()) return;
    void loadFiles(selectedPath || undefined, true);
  }

  return (
    <section className="skill-detail-page">
      <div className="skill-detail-topbar">
        <button type="button" className="button" onClick={handleBack}>
          <Icon name="arrow-left" />
          {t('settings.back', { defaultValue: '返回' })}
        </button>
        <span className="skill-detail-breadcrumb">
          <Icon name="edit" />
          {item.name}
          <em className="skill-editor-meta">
            {item.target} / {item.scope}
          </em>
        </span>
      </div>
      <div className="skill-detail-body">
        <aside className="skill-detail-tree">
          {loadingFiles ? (
            <div className="state">{t('installed.loadingFiles', { defaultValue: '加载文件树…' })}</div>
          ) : filesError ? (
            <div className="state error">{filesError}</div>
          ) : (
            <div className="file-tree-root">
              {files.map((node) => (
                <FileTreeNode
                  key={node.path}
                  node={node}
                  depth={0}
                  expandedDirs={expandedDirs}
                  onSelectFile={handleSelectFile}
                  onToggleDir={toggleDir}
                  selectedPath={selectedPath}
                />
              ))}
            </div>
          )}
        </aside>
        <main className="skill-detail-content">
          <div className="skill-editor-toolbar">
            <strong>{selectedPath || t('installed.selectFile', { defaultValue: '选择文件' })}</strong>
            <span className={`skill-editor-status ${dirty ? 'dirty' : ''}`}>
              {dirty
                ? t('installed.unsaved', { defaultValue: '未保存修改' })
                : statusText || t('installed.readOnlyHint', { defaultValue: '本地已安装技能编辑' })}
            </span>
            <div className="skill-editor-actions">
              <button
                type="button"
                className="button"
                onClick={handleReload}
                disabled={loadingFiles || loadingContent || saving}
              >
                {t('topbar.refresh', { defaultValue: '刷新' })}
              </button>
              <button
                type="button"
                className="button"
                onClick={() => void handleResetFile()}
                disabled={!selectedPath || loadingFiles || loadingContent || saving}
              >
                {t('installed.resetFile', { defaultValue: '恢复文件原版' })}
              </button>
              <button
                type="button"
                className="button danger"
                onClick={() => void handleResetSkill()}
                disabled={loadingFiles || saving}
              >
                {t('installed.resetSkill', { defaultValue: '恢复整个 skill' })}
              </button>
              <button
                type="button"
                className="button primary"
                onClick={() => void handleSave()}
                disabled={!dirty || !isTextEditable || saving}
              >
                {saving
                  ? t('installed.saving', { defaultValue: '保存中…' })
                  : t('agents.save', { defaultValue: '保存' })}
              </button>
            </div>
          </div>

          <section className="skill-ai-panel">
            <div className="skill-ai-panel-head">
              <strong>{t('installed.aiPanelTitle', { defaultValue: 'AI 改写预览' })}</strong>
              <span>
                {aiEditConfig.provider === 'none'
                  ? t('installed.aiNotConfigured', { defaultValue: '请先在设置中配置 AI 修改服务。' })
                  : t('installed.aiProviderActive', {
                      defaultValue: '当前提供方：{{provider}}',
                      provider: aiEditConfig.provider,
                    })}
              </span>
            </div>
            <div className="skill-ai-controls">
              <select
                value={aiMode}
                onChange={(event) => setAiMode(event.target.value === 'skill' ? 'skill' : 'file')}
                disabled={aiWorking}
              >
                <option value="file">
                  {t('installed.aiModeFile', { defaultValue: '仅当前文件' })}
                </option>
                <option value="skill">
                  {t('installed.aiModeSkill', { defaultValue: '整个 skill' })}
                </option>
              </select>
              <button
                type="button"
                className="button primary"
                onClick={() => void handleGenerateAiEdit()}
                disabled={aiEditConfig.provider === 'none' || aiWorking || !aiPrompt.trim()}
              >
                {aiWorking
                  ? t('installed.aiGenerating', { defaultValue: '生成中…' })
                  : t('installed.aiGenerate', { defaultValue: '生成 AI 建议' })}
              </button>
              <button
                type="button"
                className="button"
                onClick={() => {
                  setAiPreview(null);
                  setAiError('');
                  setAiPrompt('');
                }}
                disabled={aiWorking}
              >
                {t('installed.clearAi', { defaultValue: '清空' })}
              </button>
            </div>
            <textarea
              className="skill-ai-prompt"
              placeholder={t('installed.aiPromptPlaceholder', {
                defaultValue: '例如：补充输出格式约束，并把示例改得更适合快速测试。',
              })}
              value={aiPrompt}
              onChange={(event) => setAiPrompt(event.target.value)}
              disabled={aiWorking}
            />
            {aiError ? <div className="state error">{aiError}</div> : null}
            {aiPreview ? (
              <div className="skill-ai-preview">
                <div className="skill-ai-summary">
                  <strong>{aiPreview.summary}</strong>
                  <span>
                    {t('installed.aiChangedFiles', {
                      defaultValue: '改动文件：{{count}}',
                      count: aiPreview.files.length,
                    })}
                  </span>
                </div>
                <div className="skill-ai-preview-actions">
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => void handleApplyAiEdit()}
                    disabled={aiWorking || aiPreview.files.length === 0}
                  >
                    {t('installed.aiApply', { defaultValue: '应用 AI 改动' })}
                  </button>
                </div>
                <div className="skill-ai-file-list">
                  {aiPreview.files.map((file) => (
                    <article key={file.path} className="skill-ai-file-card">
                      <header>
                        <strong>{file.path}</strong>
                      </header>
                      <div className="skill-ai-diff-grid">
                        <div>
                          <span>{t('installed.beforeLabel', { defaultValue: '修改前' })}</span>
                          <pre className="code-block skill-ai-code">
                            <code>{file.beforeContent}</code>
                          </pre>
                        </div>
                        <div>
                          <span>{t('installed.afterLabel', { defaultValue: '修改后' })}</span>
                          <pre className="code-block skill-ai-code">
                            <code>{file.afterContent}</code>
                          </pre>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          {loadingFiles ? (
            <div className="state">{t('common.loading', { defaultValue: '加载中…' })}</div>
          ) : filesError ? (
            <div className="state error">{filesError}</div>
          ) : !selectedPath ? (
            <div className="file-content-empty">
              {t('installed.selectFile', { defaultValue: '从左侧选择文件查看或编辑' })}
            </div>
          ) : loadingContent ? (
            <div className="state">{t('installed.loadingFile', { defaultValue: '加载文件内容…' })}</div>
          ) : fileContent?.encoding === 'base64' && fileContent.previewable ? (
            <ImagePreview content={fileContent} />
          ) : isTextEditable ? (
            <textarea
              className="skill-editor-textarea"
              spellCheck={false}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          ) : fileContent?.content ? (
            <pre className="code-block skill-editor-preview">
              <code>{fileContent.content}</code>
            </pre>
          ) : (
            <div className="file-content-empty">
              {t('installed.notEditable', { defaultValue: '当前文件不可编辑，仅支持文本文件。' })}
            </div>
          )}
        </main>
      </div>
    </section>
  );
}
