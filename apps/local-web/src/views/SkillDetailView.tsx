import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  createElement,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ExtraProps } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import {
  fetchSkillBrowserBundle,
  fetchSkillFileContent,
  translateText,
  type SkillFileContent,
  type SkillFileNode,
  type TranslationConfig,
} from '../api/client';
import {
  collectMarkdownTranslationTasks,
  getMarkdownNodeKey,
  markdownRemarkPlugins,
} from '../lib/markdown';
import { Icon } from '../ui/Icon';

type TranslationDisplayMode = 'original' | 'replace' | 'compare';

interface CachedTranslationEntry {
  source: string;
  targetLang: string;
  translated: string;
  provider: string;
  createdAt: number;
}

const TRANSLATE_CACHE_PREFIX = 'suit-skills-translate:';
const TRANSLATE_CACHE_VERSION = 'v2';
const TRANSLATE_TARGET_LANG = '简体中文';
const TRANSLATE_CONCURRENCY = 4;
const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

const translateMemoryCache = new Map<string, CachedTranslationEntry>();
const translateInflightCache = new Map<string, Promise<CachedTranslationEntry>>();

function AppIcon({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

type TranslatableMarkdownTag =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'li'
  | 'p'
  | 'td'
  | 'th';

type MarkdownComponentProps<Tag extends TranslatableMarkdownTag> =
  ComponentPropsWithoutRef<Tag> & ExtraProps;

type ParsedTranslateTask = ReturnType<typeof collectMarkdownTranslationTasks>[number];
type MarkdownSourceDescriptor = {
  currentPath?: string;
  onOpenRelativeFile?: ((path: string, hash?: string) => void) | undefined;
  skillName?: string;
  source?: string;
};

const markdownImageCache = new Map<string, string>();
const markdownImageInflightCache = new Map<string, Promise<string>>();

function getCodeBlockText(children: ReactNode): string {
  if (typeof children === 'string') {
    return children.replace(/\n$/, '');
  }
  if (Array.isArray(children)) {
    return children.map((child) => getCodeBlockText(child)).join('');
  }
  if (isValidElement(children)) {
    const props = children.props as { children?: ReactNode };
    return getCodeBlockText(props.children);
  }
  return '';
}

function getCodeBlockLanguage(children: ReactNode): string {
  if (Array.isArray(children)) {
    for (const child of children) {
      const language = getCodeBlockLanguage(child);
      if (language) return language;
    }
    return '';
  }
  if (!isValidElement(children)) return '';
  const props = children.props as { children?: ReactNode; className?: string };
  const match = /language-([a-z0-9_-]+)/i.exec(props.className ?? '');
  return match?.[1]?.toLowerCase() ?? getCodeBlockLanguage(props.children);
}

async function copyTextToClipboard(text: string): Promise<void> {
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

function isExternalHref(href: string | undefined): boolean {
  if (!href || href.startsWith('#') || href.startsWith('/')) return false;
  return /^(https?:)?\/\//i.test(href);
}

function extractTextContent(children: ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map((child) => extractTextContent(child)).join('');
  }
  if (isValidElement(children)) {
    const props = children.props as { children?: ReactNode };
    return extractTextContent(props.children);
  }
  return '';
}

function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[`~!@#$%^&*()+=|\\[\]{};:'",.<>/?]/g, '')
    .replace(/\s+/g, '-');
}

function extractHashFragment(target: string | undefined): string | undefined {
  if (!target) return undefined;
  const hashIndex = target.indexOf('#');
  if (hashIndex < 0 || hashIndex === target.length - 1) return undefined;
  return decodeURIComponent(target.slice(hashIndex + 1));
}

function scrollToMarkdownAnchor(hash: string): void {
  if (typeof document === 'undefined') return;
  const element = document.getElementById(hash);
  element?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function isDirectRenderableUrl(value: string | undefined): boolean {
  if (!value) return false;
  return /^(https?:|data:|blob:)/i.test(value);
}

export function normalizeSkillRelativePath(
  currentPath: string | undefined,
  target: string | undefined,
): string | null {
  if (!target) return null;
  const trimmed = target.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  if (/^(https?:|data:|blob:|mailto:|tel:)/i.test(trimmed)) return null;

  const cutIndexCandidates = [trimmed.indexOf('#'), trimmed.indexOf('?')].filter((n) => n >= 0);
  const endIndex = cutIndexCandidates.length > 0 ? Math.min(...cutIndexCandidates) : trimmed.length;
  const pathOnly = trimmed.slice(0, endIndex);
  const baseSegments = pathOnly.startsWith('/')
    ? []
    : (currentPath ?? '').split('/').filter(Boolean).slice(0, -1);
  const inputSegments = (pathOnly.startsWith('/') ? pathOnly.slice(1) : pathOnly)
    .split('/')
    .filter(Boolean);

  const resolvedSegments = [...baseSegments];
  for (const segment of inputSegments) {
    if (segment === '.') continue;
    if (segment === '..') {
      if (resolvedSegments.length > 0) resolvedSegments.pop();
      continue;
    }
    resolvedSegments.push(segment);
  }
  return resolvedSegments.join('/');
}

async function resolveMarkdownImageSource(
  path: string,
  skillName: string,
  source: string | undefined,
): Promise<string> {
  const cacheKey = `${source ?? 'default'}:${skillName}:${path}`;
  const cached = markdownImageCache.get(cacheKey);
  if (cached) return cached;

  const inflight = markdownImageInflightCache.get(cacheKey);
  if (inflight) return inflight;

  const request = fetchSkillFileContent(skillName, path, source)
    .then((content) => {
      if (content.encoding !== 'base64' || !content.contentBase64) {
        throw new Error('Image content is not previewable');
      }
      const mime = MIME_MAP[content.ext] ?? 'image/png';
      const dataUrl = `data:${mime};base64,${content.contentBase64}`;
      markdownImageCache.set(cacheKey, dataUrl);
      return dataUrl;
    })
    .finally(() => {
      markdownImageInflightCache.delete(cacheKey);
    });

  markdownImageInflightCache.set(cacheKey, request);
  return request;
}

function MarkdownFragmentContent({
  markdown,
  currentPath,
  onOpenRelativeFile,
  skillName,
  source,
}: {
  markdown: string;
} & MarkdownSourceDescriptor) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <>{children}</>,
        a: (props) => (
          <MarkdownLink
            {...props}
            currentPath={currentPath}
            onOpenRelativeFile={onOpenRelativeFile}
          />
        ),
        img: (props) => (
          <MarkdownImage
            {...props}
            currentPath={currentPath}
            skillName={skillName}
            source={source}
          />
        ),
        input: (props) => <MarkdownInput {...props} />,
        pre: (props) => <MarkdownCodeBlock {...props} />,
      }}
      remarkPlugins={[...markdownRemarkPlugins]}
    >
      {markdown}
    </ReactMarkdown>
  );
}

function MarkdownCodeBlock({
  children,
  ...props
}: ComponentPropsWithoutRef<'pre'> & ExtraProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copyResetTimerRef = useRef<number | null>(null);
  const codeText = useMemo(() => getCodeBlockText(children), [children]);
  const language = useMemo(() => getCodeBlockLanguage(children), [children]);

  useEffect(() => () => {
    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
    }
  }, []);

  const handleCopy = useCallback(async () => {
    if (!codeText) return;
    await copyTextToClipboard(codeText);
    setCopied(true);
    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
    }
    copyResetTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      copyResetTimerRef.current = null;
    }, 1600);
  }, [codeText]);

  return (
    <div className="markdown-code-shell">
      <div className="markdown-code-header">
        <span className="markdown-code-language">
          {language || 'code'}
        </span>
        <button
          className={`button markdown-code-copy ${copied ? 'is-copied' : ''}`}
          disabled={!codeText}
          onClick={() => void handleCopy()}
          type="button"
        >
          <Icon name={copied ? 'check' : 'copy'} />
          {t('library.copy')}
        </button>
      </div>
      <pre className="code-block" {...props}>
        {children}
      </pre>
    </div>
  );
}

function MarkdownLink({
  currentPath,
  href,
  onOpenRelativeFile,
  children,
  ...props
}: (ComponentPropsWithoutRef<'a'> & ExtraProps) & Pick<
  MarkdownSourceDescriptor,
  'currentPath' | 'onOpenRelativeFile'
>) {
  const external = isExternalHref(href);
  const internalPath = normalizeSkillRelativePath(currentPath, href);
  const hash = extractHashFragment(href);

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

  if (internalPath && onOpenRelativeFile) {
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

  if (internalPath && !onOpenRelativeFile) {
    return (
      <span
        className="markdown-link-disabled"
        role="link"
        title={internalPath}
      >
        {children}
      </span>
    );
  }

  return (
    <a
      {...props}
      href={href}
      rel={external ? 'noreferrer noopener' : props.rel}
      target={external ? '_blank' : props.target}
    >
      {children}
    </a>
  );
}

function MarkdownImage({
  alt,
  currentPath,
  skillName,
  source,
  src,
  title,
  ...props
}: (ComponentPropsWithoutRef<'img'> & ExtraProps) & MarkdownSourceDescriptor) {
  const resolvedPath = normalizeSkillRelativePath(currentPath, src);
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(() =>
    isDirectRenderableUrl(src) ? src ?? null : null,
  );
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (isDirectRenderableUrl(src)) {
      setResolvedSrc(src ?? null);
      setLoadError(false);
      return () => {
        cancelled = true;
      };
    }

    if (!resolvedPath || !skillName) {
      setResolvedSrc(null);
      setLoadError(true);
      return () => {
        cancelled = true;
      };
    }

    setLoadError(false);
    void resolveMarkdownImageSource(
      resolvedPath,
      skillName,
      source && source !== 'all' ? source : undefined,
    )
      .then((value) => {
        if (!cancelled) setResolvedSrc(value);
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedSrc(null);
          setLoadError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [resolvedPath, skillName, source, src]);

  if (!resolvedSrc) {
    return (
      <span className="markdown-image-fallback">
        {alt || title || (loadError ? 'Image unavailable' : 'Loading image...')}
      </span>
    );
  }

  return (
    <img
      {...props}
      alt={alt}
      className={['markdown-image', props.className].filter(Boolean).join(' ')}
      src={resolvedSrc}
      title={title}
    />
  );
}

function MarkdownInput({
  checked,
  className,
  disabled,
  type,
  ...props
}: ComponentPropsWithoutRef<'input'> & ExtraProps) {
  if (type !== 'checkbox') {
    return <input {...props} className={className} disabled={disabled} type={type} />;
  }
  return (
    <input
      {...props}
      checked={checked}
      className={['markdown-task-checkbox', className].filter(Boolean).join(' ')}
      disabled
      readOnly
      type="checkbox"
    />
  );
}

function fingerprintText(text: string): string {
  let hashA = 2166136261;
  let hashB = 1315423911;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    hashA ^= code;
    hashA = Math.imul(hashA, 16777619);
    hashB ^= code + 0x9e3779b9 + (hashB << 6) + (hashB >> 2);
  }
  return `${text.length}:${(hashA >>> 0).toString(16)}:${(hashB >>> 0).toString(16)}`;
}

function getBlockTranslateStorageKey(text: string, targetLang: string): string {
  return `${TRANSLATE_CACHE_PREFIX}${TRANSLATE_CACHE_VERSION}:block:${fingerprintText(text)}:${targetLang}`;
}

function readBlockTranslationCache(
  text: string,
  targetLang: string,
): CachedTranslationEntry | null {
  const storageKey = getBlockTranslateStorageKey(text, targetLang);
  const memoryHit = translateMemoryCache.get(storageKey);
  if (memoryHit && memoryHit.source === text && memoryHit.targetLang === targetLang) {
    return memoryHit;
  }
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedTranslationEntry>;
    if (
      parsed.source !== text ||
      parsed.targetLang !== targetLang ||
      typeof parsed.translated !== 'string' ||
      !parsed.translated.trim()
    ) {
      return null;
    }
    const entry: CachedTranslationEntry = {
      source: text,
      targetLang,
      translated: parsed.translated,
      provider: typeof parsed.provider === 'string' ? parsed.provider : 'cache',
      createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now(),
    };
    translateMemoryCache.set(storageKey, entry);
    return entry;
  } catch {
    return null;
  }
}

function writeBlockTranslationCache(
  text: string,
  targetLang: string,
  translated: string,
  provider: string,
): CachedTranslationEntry {
  const storageKey = getBlockTranslateStorageKey(text, targetLang);
  const entry: CachedTranslationEntry = {
    source: text,
    targetLang,
    translated,
    provider,
    createdAt: Date.now(),
  };
  translateMemoryCache.set(storageKey, entry);
  try {
    localStorage.setItem(storageKey, JSON.stringify(entry));
  } catch {
    // ignore quota errors
  }
  return entry;
}

async function resolveBlockTranslation(
  text: string,
  targetLang: string,
): Promise<CachedTranslationEntry> {
  const cached = readBlockTranslationCache(text, targetLang);
  if (cached) {
    return cached;
  }

  const storageKey = getBlockTranslateStorageKey(text, targetLang);
  const inflight = translateInflightCache.get(storageKey);
  if (inflight) {
    return inflight;
  }

  const request = translateText(text, targetLang)
    .then((result) =>
      writeBlockTranslationCache(text, targetLang, result.translated, result.provider),
    )
    .finally(() => {
      translateInflightCache.delete(storageKey);
    });

  translateInflightCache.set(storageKey, request);
  return request;
}

function isProbablyEnglishText(text: string): boolean {
  const normalized = text
    .replace(/`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\b[a-zA-Z]:\\[^\s]*/g, ' ')
    .trim();
  if (!normalized) return false;
  const latinRuns = normalized.match(/[A-Za-z]{3,}/g) ?? [];
  if (latinRuns.length === 0) return false;
  const latinLength = latinRuns.reduce((sum, item) => sum + item.length, 0);
  const cjkLength = (normalized.match(/[\u4e00-\u9fff]/g) ?? []).length;
  return latinLength >= Math.max(6, cjkLength * 2);
}

function renderTranslationHint(
  translated: string | undefined,
  pending: boolean,
  failed: boolean,
  onRetry?: () => void,
  sourceDescriptor?: MarkdownSourceDescriptor,
): ReactNode {
  if (translated) {
    return (
      <div className="translation-line">
        <MarkdownFragmentContent
          markdown={translated}
          currentPath={sourceDescriptor?.currentPath}
          onOpenRelativeFile={sourceDescriptor?.onOpenRelativeFile}
          skillName={sourceDescriptor?.skillName}
          source={sourceDescriptor?.source}
        />
      </div>
    );
  }
  if (pending) return <p className="translation-line pending">翻译中…</p>;
  if (failed) {
    return (
      <div className="translation-line error">
        <span>翻译失败</span>
        {onRetry ? (
          <button
            className="button translation-retry-btn"
            onClick={onRetry}
            type="button"
          >
            重试
          </button>
        ) : null}
      </div>
    );
  }
  return null;
}

export function TranslateMarkdownView({
  markdown,
  cacheKey,
  currentPath,
  onOpenRelativeFile,
  skillName,
  source,
  translationConfig,
}: {
  markdown: string;
  cacheKey: string;
  currentPath?: string;
  onOpenRelativeFile?: (path: string) => void;
  skillName?: string;
  source?: string;
  translationConfig: TranslationConfig;
}) {
  const { t } = useTranslation();
  const emptyText = t('markdown.empty');
  const hasMarkdownContent = markdown.trim().length > 0;
  const tasks = useMemo(
    () => collectMarkdownTranslationTasks(markdown, isProbablyEnglishText),
    [markdown],
  );
  const taskKeySet = useMemo(() => new Set(tasks.map((task) => task.key)), [tasks]);
  const contentIdentity = useMemo(
    () => `${cacheKey}:${fingerprintText(markdown)}`,
    [cacheKey, markdown],
  );
  const [mode, setMode] = useState<TranslationDisplayMode>('original');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [translatedByKey, setTranslatedByKey] = useState<Record<string, string>>({});
  const [failedByKey, setFailedByKey] = useState<Record<string, string>>({});
  const runIdRef = useRef(0);
  const canTranslate = translationConfig.provider !== 'none';
  const canTranslateCurrent = canTranslate && tasks.length > 0;
  const failedTaskKeys = useMemo(
    () => tasks.filter((task) => failedByKey[task.key]).map((task) => task.key),
    [failedByKey, tasks],
  );

  const progress = useMemo(() => {
    let completed = 0;
    let failed = 0;
    tasks.forEach((task) => {
      if (translatedByKey[task.key]) completed += 1;
      else if (failedByKey[task.key]) failed += 1;
    });
    return {
      total: tasks.length,
      completed,
      failed,
    };
  }, [failedByKey, tasks, translatedByKey]);

  const ensureTranslations = useCallback(async (requestedTaskKeys?: Set<string>) => {
    const targetTasks = requestedTaskKeys
      ? tasks.filter((task) => requestedTaskKeys.has(task.key))
      : tasks;
    if (!targetTasks.length) return;

    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setIsLoading(true);
    setError('');
    setFailedByKey((prev) => {
      if (!requestedTaskKeys) return {};
      const next = { ...prev };
      requestedTaskKeys.forEach((taskKey) => {
        delete next[taskKey];
      });
      return next;
    });

    const cachedTranslations: Record<string, string> = {};
    const groupedTasks = new Map<string, ParsedTranslateTask[]>();

    targetTasks.forEach((task) => {
      const cached = readBlockTranslationCache(task.text, TRANSLATE_TARGET_LANG);
      if (cached) {
        cachedTranslations[task.key] = cached.translated;
        return;
      }
      const group = groupedTasks.get(task.text);
      if (group) group.push(task);
      else groupedTasks.set(task.text, [task]);
    });

    if (Object.keys(cachedTranslations).length > 0) {
      setTranslatedByKey((prev) => ({ ...prev, ...cachedTranslations }));
      setFailedByKey((prev) => {
        const next = { ...prev };
        Object.keys(cachedTranslations).forEach((key) => {
          delete next[key];
        });
        return next;
      });
    }

    const queue = Array.from(groupedTasks.entries()).map(([text, relatedTasks]) => ({
      text,
      relatedTasks,
    }));

    if (queue.length === 0) {
      if (runIdRef.current === runId) setIsLoading(false);
      return;
    }

    let hadFailure = false;
    let cursor = 0;

    const worker = async () => {
      while (cursor < queue.length) {
        const currentIndex = cursor;
        cursor += 1;
        const current = queue[currentIndex];
        try {
          const result = await resolveBlockTranslation(current.text, TRANSLATE_TARGET_LANG);
          if (runIdRef.current !== runId) return;
          setTranslatedByKey((prev) => {
            const next = { ...prev };
            current.relatedTasks.forEach((task) => {
              next[task.key] = result.translated;
            });
            return next;
          });
          setFailedByKey((prev) => {
            const next = { ...prev };
            current.relatedTasks.forEach((task) => {
              delete next[task.key];
            });
            return next;
          });
        } catch (err) {
          if (runIdRef.current !== runId) return;
          hadFailure = true;
          const message = err instanceof Error ? err.message : '翻译失败';
          setFailedByKey((prev) => {
            const next = { ...prev };
            current.relatedTasks.forEach((task) => {
              next[task.key] = message;
            });
            return next;
          });
        }
      }
    };

    await Promise.all(
      Array.from(
        { length: Math.min(TRANSLATE_CONCURRENCY, queue.length) },
        () => worker(),
      ),
    );

    if (runIdRef.current !== runId) return;
    setIsLoading(false);
    setError(hadFailure ? '部分内容翻译失败，可重试失败项。' : '');
  }, [tasks]);

  const activateMode = useCallback(
    async (nextMode: TranslationDisplayMode) => {
      if (nextMode === 'original') {
        runIdRef.current += 1;
        setMode('original');
        setIsLoading(false);
        setError('');
        return;
      }
      if (!canTranslateCurrent) return;
      setMode(nextMode);
      await ensureTranslations();
    },
    [canTranslateCurrent, ensureTranslations],
  );

  const retryFailedTranslations = useCallback(async () => {
    if (!failedTaskKeys.length) return;
    await ensureTranslations(new Set(failedTaskKeys));
  }, [ensureTranslations, failedTaskKeys]);

  const retrySingleTranslation = useCallback(
    async (taskKey: string) => {
      await ensureTranslations(new Set([taskKey]));
    },
    [ensureTranslations],
  );

  const markdownSourceDescriptor = useMemo<MarkdownSourceDescriptor>(
    () => ({
      currentPath,
      onOpenRelativeFile,
      skillName,
      source,
    }),
    [currentPath, onOpenRelativeFile, skillName, source],
  );

  const renderTranslatableElement = useCallback(
    function renderTranslatableElement(
      tagName: TranslatableMarkdownTag,
      props: MarkdownComponentProps<TranslatableMarkdownTag>,
    ) {
      const { node, children, ...rest } = props;
      const isHeadingTag = /^h[1-6]$/.test(tagName);
      const headingId = isHeadingTag ? slugifyHeading(extractTextContent(children)) : '';
      const taskKey = getMarkdownNodeKey(node?.position);
      const isTaskNode = Boolean(taskKey && taskKeySet.has(taskKey));
      const translated = taskKey ? translatedByKey[taskKey] : undefined;
      const failed = taskKey ? Boolean(failedByKey[taskKey]) : false;
      const pending = Boolean(
        taskKey &&
          mode !== 'original' &&
          isLoading &&
          taskKeySet.has(taskKey) &&
          !translated &&
          !failed,
      );
      const retryAction =
        taskKey && failed ? () => void retrySingleTranslation(taskKey) : undefined;

      if (mode === 'compare' && isTaskNode) {
        if (tagName === 'li') {
          return (
            <li {...(rest as ComponentPropsWithoutRef<'li'>)}>
              <div className="markdown-list-item-content">{children}</div>
              {renderTranslationHint(
                translated,
                pending,
                failed,
                retryAction,
                markdownSourceDescriptor,
              )}
            </li>
          );
        }

        if (tagName === 'td' || tagName === 'th') {
          return (
            <>
              {createElement(
                tagName,
                rest as Record<string, unknown>,
                <div className="markdown-table-cell-content">
                  {children}
                  {renderTranslationHint(
                    translated,
                    pending,
                    failed,
                    retryAction,
                    markdownSourceDescriptor,
                  )}
                </div>,
              )}
            </>
          );
        }

        return (
          <div className="markdown-compare-block">
            {createElement(tagName, rest as Record<string, unknown>, children)}
            {renderTranslationHint(
              translated,
              pending,
              failed,
              retryAction,
              markdownSourceDescriptor,
            )}
          </div>
        );
      }

      return createElement(
        tagName,
        {
          ...(rest as Record<string, unknown>),
          ...(headingId ? { id: headingId } : {}),
        },
        mode === 'replace' && isTaskNode && translated
          ? (
            <MarkdownFragmentContent
              markdown={translated}
              currentPath={currentPath}
              onOpenRelativeFile={onOpenRelativeFile}
              skillName={skillName}
              source={source}
            />
          )
          : children,
      );
    },
    [
      currentPath,
      failedByKey,
      isLoading,
      mode,
      markdownSourceDescriptor,
      onOpenRelativeFile,
      retrySingleTranslation,
      skillName,
      source,
      taskKeySet,
      translatedByKey,
    ],
  );

  const markdownComponents = useMemo(
    () => ({
      h1: (props: MarkdownComponentProps<'h1'>) =>
        renderTranslatableElement('h1', props),
      h2: (props: MarkdownComponentProps<'h2'>) =>
        renderTranslatableElement('h2', props),
      h3: (props: MarkdownComponentProps<'h3'>) =>
        renderTranslatableElement('h3', props),
      h4: (props: MarkdownComponentProps<'h4'>) =>
        renderTranslatableElement('h4', props),
      h5: (props: MarkdownComponentProps<'h5'>) =>
        renderTranslatableElement('h5', props),
      h6: (props: MarkdownComponentProps<'h6'>) =>
        renderTranslatableElement('h6', props),
      li: (props: MarkdownComponentProps<'li'>) =>
        renderTranslatableElement('li', props),
      p: (props: MarkdownComponentProps<'p'>) =>
        renderTranslatableElement('p', props),
      td: (props: MarkdownComponentProps<'td'>) =>
        renderTranslatableElement('td', props),
      th: (props: MarkdownComponentProps<'th'>) =>
        renderTranslatableElement('th', props),
      a: (props: ComponentPropsWithoutRef<'a'> & ExtraProps) => (
        <MarkdownLink
          {...props}
          currentPath={currentPath}
          onOpenRelativeFile={onOpenRelativeFile}
        />
      ),
      img: (props: ComponentPropsWithoutRef<'img'> & ExtraProps) => (
        <MarkdownImage
          {...props}
          currentPath={currentPath}
          skillName={skillName}
          source={source}
        />
      ),
      input: (props: ComponentPropsWithoutRef<'input'> & ExtraProps) => (
        <MarkdownInput {...props} />
      ),
      pre: (props: ComponentPropsWithoutRef<'pre'> & ExtraProps) => (
        <MarkdownCodeBlock {...props} />
      ),
      table: ({ children, ...props }: ComponentPropsWithoutRef<'table'> & ExtraProps) => (
        <div className="markdown-table-wrap">
          <table {...props}>{children}</table>
        </div>
      ),
    }),
    [currentPath, onOpenRelativeFile, renderTranslatableElement, skillName, source],
  );

  useEffect(() => {
    runIdRef.current += 1;
    setMode('original');
    setIsLoading(false);
    setError('');
    setTranslatedByKey({});
    setFailedByKey({});
  }, [contentIdentity]);

  useEffect(() => () => {
    runIdRef.current += 1;
  }, []);

  return (
    <div className="translate-markdown-view">
      {canTranslate ? (
        <div className="translate-toolbar">
          <button
            className={`button translate-btn ${mode === 'replace' ? 'active' : ''}`}
            onClick={() => void activateMode('replace')}
            disabled={!canTranslateCurrent}
            title="翻译后直接替换原文"
            type="button"
          >
            <AppIcon>
              <path d="M3 5h8" />
              <path d="M7 3v2" />
              <path d="M4 12c0-3.3 2.7-6 6-6s6 2.7 6 6" />
              <path d="m7 12 2 2" />
              <path d="M12 17h9" />
              <path d="M16 13v8" />
              <path d="m13 20 3-3 3 3" />
            </AppIcon>
            中文替换
          </button>
          <button
            className={`button translate-btn ${mode === 'compare' ? 'active' : ''}`}
            onClick={() => void activateMode('compare')}
            disabled={!canTranslateCurrent}
            title="保留原文并显示中文对照"
            type="button"
          >
            中英对照
          </button>
          <button
            className={`button translate-btn ${mode === 'original' ? 'active' : ''}`}
            onClick={() => void activateMode('original')}
            disabled={mode === 'original' && !isLoading}
            type="button"
          >
            原文
          </button>
          {progress.failed ? (
            <button
              className="button translate-btn"
              onClick={() => void retryFailedTranslations()}
              disabled={isLoading}
              type="button"
            >
              重试失败 {progress.failed}
            </button>
          ) : null}
          <span className="translate-progress">
            {!tasks.length
              ? '当前内容无需翻译'
              : isLoading
                ? `翻译中 ${progress.completed}/${progress.total}`
                : `已就绪 ${progress.completed}/${progress.total}${progress.failed ? `，失败 ${progress.failed}` : ''}`}
          </span>
          {error ? <span className="translate-error">{error}</span> : null}
        </div>
      ) : null}
      <div className="markdown">
        {hasMarkdownContent ? (
          <ReactMarkdown
            components={markdownComponents}
            remarkPlugins={[...markdownRemarkPlugins]}
          >
            {markdown}
          </ReactMarkdown>
        ) : (
          <p>{emptyText}</p>
        )}
      </div>
    </div>
  );
}

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

function ancestorDirPaths(filePath: string): string[] {
  const parts = filePath.split('/').filter(Boolean);
  if (parts.length <= 1) return [];
  const dirs: string[] = [];
  for (let i = 0; i < parts.length - 1; i += 1) {
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
          <AppIcon>
            {open ? <path d="M6 9l6 6 6-6" /> : <path d="M9 18l6-6-6-6" />}
          </AppIcon>
          <AppIcon>
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </AppIcon>
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
      <AppIcon>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
      </AppIcon>
      <span>{node.name}</span>
    </button>
  );
}

function FileContentViewer({
  content,
  onSelectFile,
  source,
  translationConfig,
  skillName,
}: {
  content: SkillFileContent | null;
  onSelectFile: (path: string, hash?: string) => void;
  source: string;
  translationConfig: TranslationConfig;
  skillName: string;
}) {
  if (!content) {
    return <div className="file-content-empty">暂无内容</div>;
  }
  if (!content.previewable) {
    return (
      <div className="file-content-empty">
        <AppIcon>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
        </AppIcon>
        <span>
          无法预览此文件（{content.ext || '二进制'}，{(content.size / 1024).toFixed(1)} KB）
        </span>
      </div>
    );
  }
  if (content.encoding === 'base64' && content.contentBase64) {
    const mime = MIME_MAP[content.ext] ?? 'image/png';
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
          currentPath={content.path}
          onOpenRelativeFile={onSelectFile}
          skillName={skillName}
          source={source}
          translationConfig={translationConfig}
        />
      </div>
    );
  }
  return (
    <div className="file-content-code">
      <pre className="code-block">
        <code>{text}</code>
      </pre>
    </div>
  );
}

export default function SkillDetailView({
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
  const [pendingHash, setPendingHash] = useState('');
  const [fileContent, setFileContent] = useState<SkillFileContent | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const hydratedContentPathRef = useRef('');

  const toggleDir = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const selectFile = useCallback((path: string, hash?: string) => {
    setSelectedPath(path);
    setPendingHash(hash ?? '');
  }, []);

  useEffect(() => {
    if (!skillName) return;
    setLoadingFiles(true);
    setFilesError('');
    setFiles([]);
    setSelectedPath('');
    setPendingHash('');
    setExpandedDirs(new Set());
    setFileContent(null);
    hydratedContentPathRef.current = '';
    fetchSkillBrowserBundle(skillName, source !== 'all' ? source : undefined)
      .then((data) => {
        const nextFiles = normalizeSkillFileList(data?.files);
        setFiles(nextFiles);
        const preferredPath = data.initialPath || findSkillMdInTree(nextFiles)?.path || '';
        if (preferredPath) {
          setExpandedDirs(new Set(ancestorDirPaths(preferredPath)));
          setSelectedPath(preferredPath);
          setPendingHash('');
          setFileContent(data.initialContent ?? null);
          hydratedContentPathRef.current = data.initialContent?.path ?? '';
        }
      })
      .catch((err: unknown) => {
        setFilesError(err instanceof Error ? err.message : '加载文件列表失败');
      })
      .finally(() => setLoadingFiles(false));
  }, [skillName, source]);

  useEffect(() => {
    if (!selectedPath || !skillName) return;
    if (
      hydratedContentPathRef.current === selectedPath &&
      fileContent?.path === selectedPath
    ) {
      hydratedContentPathRef.current = '';
      return;
    }
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

  useEffect(() => {
    if (!pendingHash || loadingContent || !fileContent) return;
    const frameId = window.requestAnimationFrame(() => {
      scrollToMarkdownAnchor(pendingHash);
      setPendingHash('');
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [fileContent, loadingContent, pendingHash]);

  return (
    <section className="skill-detail-page">
      <div className="skill-detail-topbar">
        <button type="button" className="button" onClick={onBack}>
          <AppIcon>
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </AppIcon>
          返回
        </button>
        <span className="skill-detail-breadcrumb">
          <AppIcon>
            <ellipse cx="12" cy="6" rx="7" ry="3" />
            <path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
            <path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
          </AppIcon>
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
                  onSelectFile={(path) => selectFile(path)}
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
            <div className="file-content-empty">从左侧选择文件查看内容</div>
          ) : loadingContent ? (
            <div className="state">加载文件内容…</div>
          ) : (
            <FileContentViewer
              content={fileContent}
              onSelectFile={selectFile}
              source={source}
              translationConfig={translationConfig}
              skillName={skillName}
            />
          )}
        </main>
      </div>
    </section>
  );
}
