import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import type { ExtraProps } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import {
  buildInstallPackageCommand,
  getSkillFile,
  listFeedback,
  listSkillFiles,
  updateSkillFile,
  type FeedbackItem,
  type SkillFileDetail,
  type SkillFileEntry,
} from '../api/client';
import { markdownRemarkPlugins } from '../lib/markdown';
import {
  Badge,
  FileTree,
  formatBytes,
  formatCompact,
  formatDateTime,
  Metric,
  ReviewForm,
  ReviewItem,
  type Skill,
} from './shared';

const installTargetOptions = [
  { id: 'agents', label: 'Agents' },
  { id: 'codex', label: 'Codex' },
  { id: 'claude', label: 'Claude' },
  { id: 'cursor', label: 'Cursor' },
];

export function SkillDetailPage({
  backLabel,
  skill,
  onBack,
  onOpenDirectory,
}: {
  backLabel: string;
  skill: Skill;
  onBack: () => void;
  onOpenDirectory: () => void;
}) {
  const [reviews, setReviews] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [installScope, setInstallScope] = useState<'global' | 'local'>('global');
  const [installTargets, setInstallTargets] = useState<string[]>(['agents']);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function refreshReviews() {
    setLoading(true);
    try {
      const next = await listFeedback({ skillId: skill.id, status: 'all' });
      setReviews(next);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshReviews();
  }, [skill.id]);

  async function handleReviewSubmitted(review: FeedbackItem) {
    setReviews((current) => mergeReviews([review, ...current]));
    setLoading(true);
    try {
      const next = await listFeedback({ skillId: skill.id, status: 'all' });
      setReviews((current) => mergeReviews([...next, review, ...current]));
    } finally {
      setLoading(false);
    }
  }

  const reviewAverage = reviews.length
    ? reviews.reduce((total, item) => total + item.rating, 0) / reviews.length
    : skill.rating;
  const reviewCount = reviews.length || skill.reviews;
  const distribution = ratingDistribution(reviews);
  const statusCounts = reviewStatusCounts(reviews);
  const installCommand = useMemo(
    () => buildInstallPackageCommand(skill.id, { scope: installScope, targets: installTargets }),
    [installScope, installTargets, skill.id],
  );

  function toggleInstallTarget(target: string) {
    setInstallTargets((current) =>
      current.includes(target)
        ? current.filter((item) => item !== target)
        : [...current, target],
    );
    setCopyState('idle');
  }

  async function copyInstallCommand() {
    try {
      await navigator.clipboard?.writeText(installCommand);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }

  return (
    <div className="page skill-detail-page">
      <div className="detail-topbar">
        <button className="back-button" type="button" onClick={onBack}>
          {backLabel}
        </button>
        <button className="primary" type="button" onClick={onOpenDirectory}>
          进入技能目录
        </button>
      </div>
      <div className="skill-detail-layout">
        <article className="detail-main skill-overview">
          <div className="detail-title detail-hero">
            <span className="skill-icon large">{skill.name.slice(0, 2).toUpperCase()}</span>
            <div>
              <p className="eyebrow">{skill.category} / {skill.source}</p>
              <h1>{skill.name}</h1>
              <p>{skill.description}</p>
              <div className="tag-row">
                {skill.tags.map((tag) => <em key={tag}>{tag}</em>)}
              </div>
            </div>
            <Badge status={skill.status} />
          </div>
          <section className="info-grid">
            <Metric label="综合评分" value={reviewAverage.toFixed(1)} />
            <Metric label="全部评价" value={reviewCount} />
            <Metric label="安装量" value={formatCompact(skill.installs)} />
            <Metric label="版本" value={skill.version} />
          </section>
          <section className="readme-panel detail-section">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Overview</p>
                <h2>技能说明</h2>
              </div>
              <span>{skill.author}</span>
            </div>
            <p>
              该技能由 {skill.author} 维护，来自 {skill.source}。适用于{' '}
              {skill.tags.length ? skill.tags.join('、') : skill.category} 等场景。
            </p>
            <p>
              技能目录中可查看完整包结构、SKILL.md、meta.json、示例文件，并维护文件内容。
            </p>
          </section>
          <div className="install-box detail-install-box package-install-box">
            <div className="install-box-head">
              <div>
                <span>一键安装命令</span>
                <small>公开 package 地址，无需登录即可安装</small>
              </div>
              <button type="button" onClick={() => void copyInstallCommand()}>
                {copyState === 'copied' ? '已复制' : '复制'}
              </button>
            </div>
            <div className="install-options" aria-label="安装选项">
              <div className="segmented-control" role="group" aria-label="安装范围">
                <button
                  className={installScope === 'global' ? 'active' : ''}
                  type="button"
                  onClick={() => {
                    setInstallScope('global');
                    setCopyState('idle');
                  }}
                >
                  全局
                </button>
                <button
                  className={installScope === 'local' ? 'active' : ''}
                  type="button"
                  onClick={() => {
                    setInstallScope('local');
                    setCopyState('idle');
                  }}
                >
                  当前项目
                </button>
              </div>
              <div className="install-targets" aria-label="目标环境">
                {installTargetOptions.map((target) => (
                  <label className="checkbox-row compact" key={target.id}>
                    <input
                      checked={installTargets.includes(target.id)}
                      type="checkbox"
                      onChange={() => toggleInstallTarget(target.id)}
                    />
                    {target.label}
                  </label>
                ))}
              </div>
            </div>
            <code>{installCommand}</code>
            {copyState === 'failed' ? <small className="copy-error">复制失败，请手动复制命令。</small> : null}
          </div>
        </article>
        <aside className="skill-review-workbench" aria-label={`${skill.name} 的评价情况`}>
          <section className="review-panel rating-overview">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Reviews</p>
                <h2>评价情况</h2>
              </div>
              <strong>{reviewAverage.toFixed(1)}</strong>
            </div>
            <div className="rating-summary">
              <span>{reviewCount} 条评价</span>
              <span>{formatCompact(skill.installs)} 次安装</span>
              <span>{loading ? '同步中' : '已更新'}</span>
            </div>
            <div className="rating-bars" aria-label="评分分布">
              {[5, 4, 3, 2, 1].map((rating) => {
                const count = distribution[rating] ?? 0;
                const percent = reviews.length ? Math.round((count / reviews.length) * 100) : 0;
                return (
                  <div className="rating-bar" key={rating}>
                    <span>{rating} 分</span>
                    <div><i style={{ width: `${percent}%` }} /></div>
                    <strong>{reviews.length ? count : '-'}</strong>
                  </div>
                );
              })}
            </div>
            <div className="review-status-strip">
              <span>新评价 {statusCounts.submitted}</span>
              <span>处理中 {statusCounts.reviewing}</span>
              <span>已采纳 {statusCounts.approved}</span>
            </div>
          </section>
          <ReviewForm skill={skill} onSubmitted={handleReviewSubmitted} />
          <section className="review-list detail-review-list">
            <div className="panel-head">
              <div>
                <p className="eyebrow">All feedback</p>
                <h2>当前 skill 的全部评价</h2>
              </div>
              <span>{loading ? '加载中' : `${reviews.length} 条`}</span>
            </div>
            {reviews.length ? (
              reviews.map((review) => (
                <ReviewItem
                  key={review.id}
                  review={review}
                  onStatusChange={(updatedReview) =>
                    setReviews((current) =>
                      current.map((item) =>
                        item.id === updatedReview.id ? updatedReview : item,
                      ),
                    )
                  }
                />
              ))
            ) : (
              <div className="empty-state">还没有真实评价，提交后会显示在这里。</div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function findSkillMd(entry: SkillFileEntry | undefined): string {
  if (!entry) return '';
  if (entry.type === 'file' && entry.name.toUpperCase() === 'SKILL.MD') return entry.path;
  for (const child of entry.children ?? []) {
    const found = findSkillMd(child);
    if (found) return found;
  }
  return '';
}

function firstFilePath(entry: SkillFileEntry | undefined): string {
  if (!entry) return '';
  if (entry.type === 'file') return entry.path;
  for (const child of entry.children ?? []) {
    const found = firstFilePath(child);
    if (found) return found;
  }
  return '';
}

function ancestorDirPaths(filePath: string): string[] {
  const parts = filePath.split('/').filter(Boolean);
  if (parts.length <= 1) return [];
  const dirs: string[] = [];
  for (let index = 0; index < parts.length - 1; index += 1) {
    dirs.push(parts.slice(0, index + 1).join('/'));
  }
  return dirs;
}

function normalizeRelativeSkillPath(currentPath: string | undefined, target: string | undefined): string | null {
  const trimmed = target?.trim() ?? '';
  if (!trimmed || trimmed.startsWith('#')) return null;
  if (/^(https?:|data:|blob:|mailto:|tel:)/i.test(trimmed)) return null;

  const cutIndexes = [trimmed.indexOf('#'), trimmed.indexOf('?')].filter((item) => item >= 0);
  const pathOnly = trimmed.slice(0, cutIndexes.length ? Math.min(...cutIndexes) : trimmed.length);
  const baseSegments = pathOnly.startsWith('/')
    ? []
    : (currentPath ?? '').split('/').filter(Boolean).slice(0, -1);
  const inputSegments = (pathOnly.startsWith('/') ? pathOnly.slice(1) : pathOnly)
    .split('/')
    .filter(Boolean);

  const resolved = [...baseSegments];
  for (const segment of inputSegments) {
    if (segment === '.') continue;
    if (segment === '..') {
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  return resolved.join('/');
}

function hashFromHref(href: string | undefined): string | undefined {
  const hashIndex = href?.indexOf('#') ?? -1;
  if (hashIndex < 0 || !href || hashIndex === href.length - 1) return undefined;
  return decodeURIComponent(href.slice(hashIndex + 1));
}

function scrollToMarkdownAnchor(hash: string): void {
  window.requestAnimationFrame(() => {
    document.getElementById(hash)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
}

function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[`~!@#$%^&*()+=|\\[\]{};:'",.<>/?]/g, '')
    .replace(/\s+/g, '-');
}

function extractText(children: ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(extractText).join('');
  if (children && typeof children === 'object' && 'props' in children) {
    return extractText((children as { props?: { children?: ReactNode } }).props?.children);
  }
  return '';
}

function DirectoryTreeNode({
  depth,
  entry,
  expandedDirs,
  onOpen,
  onToggleDir,
  selectedPath,
}: {
  depth: number;
  entry: SkillFileEntry;
  expandedDirs: Set<string>;
  onOpen: (path: string) => void;
  onToggleDir: (path: string) => void;
  selectedPath: string;
}) {
  if (entry.type === 'directory') {
    const open = entry.path === '' || expandedDirs.has(entry.path);
    return (
      <div className={entry.path ? 'file-tree-dir' : 'file-tree-dir root'}>
        {entry.path ? (
          <button
            className="file-tree-item file-tree-dir-btn"
            onClick={() => onToggleDir(entry.path)}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
            type="button"
          >
            <span aria-hidden="true">{open ? '▾' : '▸'}</span>
            <strong>{entry.name}</strong>
          </button>
        ) : null}
        {open ? (
          <div className="file-tree-children">
            {entry.children?.map((child) => (
              <DirectoryTreeNode
                depth={entry.path ? depth + 1 : depth}
                entry={child}
                expandedDirs={expandedDirs}
                key={child.path}
                onOpen={onOpen}
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
      className={`file-tree-item file-tree-file-btn ${entry.path === selectedPath ? 'selected' : ''}`}
      onClick={() => onOpen(entry.path)}
      style={{ paddingLeft: `${8 + depth * 14}px` }}
      type="button"
    >
      <span aria-hidden="true">FILE</span>
      <strong>{entry.name}</strong>
    </button>
  );
}

function MarkdownPreview({
  content,
  onOpenRelativeFile,
}: {
  content: SkillFileDetail;
  onOpenRelativeFile: (path: string, hash?: string) => void;
}) {
  const components = useMemo(
    () => ({
      a: ({
        children,
        href,
        ...props
      }: ComponentPropsWithoutRef<'a'> & ExtraProps) => {
        const internalPath = normalizeRelativeSkillPath(content.path, href);
        const hash = hashFromHref(href);

        if (href?.startsWith('#') && hash) {
          return (
            <a
              {...props}
              href={href}
              onClick={(event) => {
                event.preventDefault();
                scrollToMarkdownAnchor(hash);
              }}
            >
              {children}
            </a>
          );
        }

        if (internalPath) {
          return (
            <a
              {...props}
              href={href}
              onClick={(event) => {
                event.preventDefault();
                onOpenRelativeFile(internalPath, hash);
              }}
            >
              {children}
            </a>
          );
        }

        return (
          <a {...props} href={href} rel="noreferrer noopener" target="_blank">
            {children}
          </a>
        );
      },
      h1: ({ children, ...props }: ComponentPropsWithoutRef<'h1'> & ExtraProps) => (
        <h1 {...props} id={slugifyHeading(extractText(children))}>{children}</h1>
      ),
      h2: ({ children, ...props }: ComponentPropsWithoutRef<'h2'> & ExtraProps) => (
        <h2 {...props} id={slugifyHeading(extractText(children))}>{children}</h2>
      ),
      h3: ({ children, ...props }: ComponentPropsWithoutRef<'h3'> & ExtraProps) => (
        <h3 {...props} id={slugifyHeading(extractText(children))}>{children}</h3>
      ),
      table: ({ children, ...props }: ComponentPropsWithoutRef<'table'> & ExtraProps) => (
        <div className="markdown-table-wrap"><table {...props}>{children}</table></div>
      ),
    }),
    [content.path, onOpenRelativeFile],
  );

  return (
    <div className="file-preview markdown">
      <ReactMarkdown components={components} remarkPlugins={[...markdownRemarkPlugins]}>
        {content.content}
      </ReactMarkdown>
    </div>
  );
}

function ratingDistribution(reviews: FeedbackItem[]): Record<number, number> {
  return reviews.reduce<Record<number, number>>((result, review) => {
    result[review.rating] = (result[review.rating] ?? 0) + 1;
    return result;
  }, {});
}

function mergeReviews(reviews: FeedbackItem[]): FeedbackItem[] {
  const seen = new Set<string>();
  return reviews.filter((review) => {
    if (seen.has(review.id)) return false;
    seen.add(review.id);
    return true;
  });
}

function reviewStatusCounts(reviews: FeedbackItem[]) {
  return reviews.reduce(
    (result, review) => ({ ...result, [review.status]: result[review.status] + 1 }),
    { submitted: 0, reviewing: 0, approved: 0, rejected: 0, archived: 0 },
  );
}

const VIEW_MODE_STORAGE_KEY = 'skill-directory-view-mode';

function loadViewModePrefs(): 'preview' | 'source' {
  try {
    const raw = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (raw === 'preview' || raw === 'source') return raw;
  } catch {
    // ignore
  }
  return 'preview';
}

function saveViewModePrefs(mode: 'preview' | 'source') {
  try {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}

export function SkillDirectoryPage({
  skill,
  onBack,
  onDirtyChange,
}: {
  skill: Skill;
  onBack: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [fileTree, setFileTree] = useState<SkillFileEntry | null>(null);
  const [selectedFile, setSelectedFile] = useState<SkillFileDetail | null>(null);
  const [draft, setDraft] = useState('');
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => new Set());
  const [viewMode, setViewMode] = useState<'preview' | 'source'>(loadViewModePrefs);
  const [pendingHash, setPendingHash] = useState('');
  const [filesLoading, setFilesLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const dirty = selectedFile ? draft !== selectedFile.content : false;
  const canPreview = Boolean(selectedFile && !dirty && selectedFile.language === 'markdown');

  async function refreshFiles(path?: string) {
    setFilesLoading(true);
    try {
      const next = await listSkillFiles(skill.id, path);
      const selectedPath = next.selectedFile?.path || findSkillMd(next.root) || firstFilePath(next.root);
      setFileTree(next.root);
      setSelectedFile(next.selectedFile ?? null);
      setDraft(next.selectedFile?.content ?? '');
      setExpandedDirs((current) => {
        const nextDirs = new Set(current);
        for (const dir of ancestorDirPaths(selectedPath)) nextDirs.add(dir);
        return nextDirs;
      });
      setViewMode(next.selectedFile?.language === 'markdown' ? loadViewModePrefs() : 'source');
      setSaveState('idle');
    } finally {
      setFilesLoading(false);
    }
  }

  useEffect(() => {
    void refreshFiles();
  }, [skill.id]);

  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  function confirmDiscardChanges() {
    return !dirty || window.confirm('当前文件有未保存内容，确定要放弃修改吗？');
  }

  const openFile = useCallback(async (path: string, hash?: string) => {
    if (!confirmDiscardChanges()) return;
    if (path === selectedFile?.path && !hash) return;
    setContentLoading(true);
    try {
      const next = await getSkillFile(skill.id, path);
      setSelectedFile(next);
      setDraft(next.content);
      setPendingHash(hash ?? '');
      setExpandedDirs((current) => {
        const nextDirs = new Set(current);
        for (const dir of ancestorDirPaths(next.path)) nextDirs.add(dir);
        return nextDirs;
      });
      setViewMode(next.language === 'markdown' ? loadViewModePrefs() : 'source');
      setSaveState('idle');
    } finally {
      setContentLoading(false);
    }
  }, [dirty, selectedFile?.path, skill.id]);

  useEffect(() => {
    if (!pendingHash || contentLoading || !selectedFile) return;
    scrollToMarkdownAnchor(pendingHash);
    setPendingHash('');
  }, [contentLoading, pendingHash, selectedFile]);

  function toggleDir(path: string) {
    setExpandedDirs((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function saveFile() {
    if (!selectedFile || !dirty || !selectedFile.editable) return;
    setSaveState('saving');
    try {
      const next = await updateSkillFile(skill.id, selectedFile.path, draft);
      setSelectedFile(next);
      setDraft(next.content);
      await refreshFiles(next.path);
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }

  return (
    <div className="page skill-directory-page">
      <div className="panel-head">
        <button className="back-button" type="button" onClick={onBack}>返回技能详情</button>
        <button
          className="primary"
          type="button"
          disabled={!dirty || saveState === 'saving' || !selectedFile?.editable}
          onClick={saveFile}
        >
          {saveState === 'saving' ? '保存中...' : dirty ? '保存修改' : '已同步'}
        </button>
      </div>
      <section className="package-editor directory-editor">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Package files</p>
            <h2>{skill.name} 技能目录</h2>
          </div>
          <span>{selectedFile?.path ?? '选择文件'}</span>
        </div>
        <div className="file-workbench full">
          <aside className="file-tree" aria-label="技能包目录">
            {filesLoading && !fileTree ? <div className="empty-state">文件加载中...</div> : null}
            {fileTree ? (
              <DirectoryTreeNode
                depth={0}
                entry={fileTree}
                expandedDirs={expandedDirs}
                selectedPath={selectedFile?.path ?? ''}
                onOpen={openFile}
                onToggleDir={toggleDir}
              />
            ) : null}
          </aside>
          <section className={`file-editor ${contentLoading ? 'loading' : ''}`}>
            {selectedFile ? (
              <>
                <div className="file-editor-head">
                  <div>
                    <strong>{selectedFile.path}</strong>
                    <small>
                      {selectedFile.language} / {formatBytes(selectedFile.size)} /{' '}
                      {formatDateTime(selectedFile.updatedAt)}
                    </small>
                  </div>
                  <div className="file-editor-actions">
                    {selectedFile.language === 'markdown' ? (
                      <div className="segmented-control" aria-label="文件查看模式">
                        <button
                          className={viewMode === 'preview' ? 'active' : ''}
                          disabled={!canPreview}
                          onClick={() => { setViewMode('preview'); saveViewModePrefs('preview'); }}
                          type="button"
                        >
                          预览
                        </button>
                        <button
                          className={viewMode === 'source' ? 'active' : ''}
                          onClick={() => { setViewMode('source'); saveViewModePrefs('source'); }}
                          type="button"
                        >
                          源码
                        </button>
                      </div>
                    ) : null}
                    <Badge status={contentLoading ? '加载中' : dirty ? '未保存' : saveState === 'error' ? '保存失败' : '已同步'} />
                  </div>
                </div>
                {contentLoading ? <div className="file-loading-bar" aria-hidden="true" /> : null}
                {viewMode === 'preview' && canPreview ? (
                  <MarkdownPreview content={selectedFile} onOpenRelativeFile={openFile} />
                ) : (
                  <textarea
                    value={draft}
                    spellCheck={false}
                    readOnly={!selectedFile.editable}
                    onChange={(event) => {
                      setDraft(event.target.value);
                      setSaveState('idle');
                      if (selectedFile.language === 'markdown') { setViewMode('source'); saveViewModePrefs('source'); }
                    }}
                  />
                )}
              </>
            ) : (
              <div className="empty-state">选择左侧文件查看和编辑内容。</div>
            )}
          </section>
          <aside className="file-detail-panel">
            <h3>文件详情</h3>
            {selectedFile ? (
              <>
                <dl>
                  <div><dt>路径</dt><dd>{selectedFile.path}</dd></div>
                  <div><dt>类型</dt><dd>{selectedFile.language}</dd></div>
                  <div><dt>大小</dt><dd>{formatBytes(selectedFile.size)}</dd></div>
                  <div><dt>状态</dt><dd>{selectedFile.editable ? '可编辑' : '只读'}</dd></div>
                </dl>
                {saveState === 'saved' ? <p>修改已保存到技能包文件。</p> : null}
                {saveState === 'error' ? <p>保存失败，请稍后重试。</p> : null}
              </>
            ) : (
              <p>还没有选中文件。</p>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}
