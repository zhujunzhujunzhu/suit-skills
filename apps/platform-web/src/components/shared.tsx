import { useEffect, useState } from 'react';
import {
  submitFeedback,
  updateFeedbackStatus,
  type FeedbackInput,
  type FeedbackItem,
  type FeedbackStatus,
  type SkillInput,
  type SkillItem,
  type SkillFileEntry,
} from '../api/client';

export type View = 'market' | 'detail' | 'upload' | 'mine' | 'reviews' | 'sources';
export type Role = 'user' | 'admin';
export type SkillStatus = '已验证' | '待审核' | '新发布';

export interface Skill {
  id: string;
  name: string;
  description: string;
  author: string;
  source: string;
  category: string;
  version: string;
  installs: number;
  rating: number;
  reviews: number;
  status: SkillStatus;
  tags: string[];
  command: string;
  updatedAt: string;
  updatedAtValue: number;
}

export const ROLE_STORAGE_KEY = 'suit-skills-platform-role';
export const adminOnlyViews = new Set<View>(['reviews', 'sources']);

export const skills: Skill[] = [
  {
    id: 'skill-frontend-design',
    name: 'frontend-design',
    description: '创建高质量 Web 页面、组件和控制台界面，适合 React/Vite 项目。',
    author: 'Design Ops',
    source: '官方源',
    category: '前端',
    version: '2.2.0',
    installs: 12840,
    rating: 4.9,
    reviews: 186,
    status: '已验证',
    tags: ['React', 'UI', 'Dashboard'],
    command: 'npx suit-skills@latest install frontend-design',
    updatedAt: '今天 09:30',
    updatedAtValue: new Date('2026-04-26T01:30:00.000Z').getTime(),
  },
  {
    id: 'skill-java-bugfix',
    name: 'java-bugfix-workflow',
    description: '定位并修复 Java/Spring/MyBatis 服务启动、接口和 SQL 类问题。',
    author: 'Backend Guild',
    source: '后端私有源',
    category: '后端',
    version: '1.1.4',
    installs: 7210,
    rating: 4.7,
    reviews: 94,
    status: '已验证',
    tags: ['Java', 'Spring', 'Bugfix'],
    command: 'npx suit-skills@latest install java-bugfix-workflow',
    updatedAt: '昨天 18:12',
    updatedAtValue: new Date('2026-04-25T10:12:00.000Z').getTime(),
  },
  {
    id: 'skill-docx',
    name: 'docx',
    description: '创建、编辑、格式化 Word 文档，支持报告、模板、批注和内容整理。',
    author: 'Document Team',
    source: '官方源',
    category: '文档',
    version: '0.8.9',
    installs: 5140,
    rating: 4.6,
    reviews: 61,
    status: '已验证',
    tags: ['Word', 'Report', 'Office'],
    command: 'npx suit-skills@latest install docx',
    updatedAt: '04-24 16:40',
    updatedAtValue: new Date('2026-04-24T08:40:00.000Z').getTime(),
  },
  {
    id: 'skill-audit',
    name: 'audit',
    description: '检查可访问性、性能、响应式、主题一致性和前端质量风险。',
    author: 'Quality Lab',
    source: '质量源',
    category: '质量',
    version: '1.5.0',
    installs: 8360,
    rating: 4.8,
    reviews: 112,
    status: '已验证',
    tags: ['Audit', 'A11y', 'Performance'],
    command: 'npx suit-skills@latest install audit',
    updatedAt: '04-20 13:05',
    updatedAtValue: new Date('2026-04-20T05:05:00.000Z').getTime(),
  },
];

export const navItems: Array<{ view: Exclude<View, 'detail'>; label: string; desc: string }> = [
  { view: 'market', label: '技能市场', desc: '浏览全部技能' },
  { view: 'upload', label: '上传技能', desc: '发布自己的技能包' },
  { view: 'mine', label: '我的技能包', desc: '维护与发布记录' },
  { view: 'reviews', label: '评价中心', desc: '处理用户反馈' },
  { view: 'sources', label: '源管理', desc: '维护来源与发布' },
];

export const categories = ['全部', ...Array.from(new Set(skills.map((skill) => skill.category)))];
export const reviewTags = ['易用性', '安装体验', '文档清晰', '稳定性', '效果优秀', '需要改进'];
export const emptyForm: FeedbackInput = { rating: 5, tags: [], anonymous: false, contact: '', message: '' };

export function readStoredRole(): Role | null {
  if (typeof localStorage === 'undefined') return null;
  const value = localStorage.getItem(ROLE_STORAGE_KEY);
  return value === 'admin' || value === 'user' ? value : null;
}

export function skillFromApi(item: SkillItem): Skill {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    author: item.author,
    source: sourceLabel(item.source),
    category: categoryLabel(item.category),
    version: item.version,
    installs: item.installs,
    rating: item.rating,
    reviews: item.reviews,
    status: statusLabelFromApi(item.status),
    tags: item.tags,
    command: item.command,
    updatedAt: formatDateTime(item.updatedAt),
    updatedAtValue: timestampValue(item.updatedAt),
  };
}

export function skillInputFromForm(form: SkillInput): SkillInput {
  return { ...form, tags: form.tags ?? [], owner: form.owner || 'current-user' };
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: React.ReactNode }) {
  return (
    <header className="page-header">
      <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function Metric({ label, value }: { label: string; value: string | number }) {
  return <article className="metric"><span>{label}</span><strong>{value}</strong></article>;
}

export function Badge({ status }: { status: string }) {
  return <span className={`badge ${badgeClass(status)}`}>{status}</span>;
}

export function SkillRow({ skill, onOpen, highlightTerms = [] }: { skill: Skill; onOpen: () => void; highlightTerms?: string[] }) {
  const updatedDaysAgo = Math.floor((Date.now() - skill.updatedAtValue) / (1000 * 60 * 60 * 24));
  const updatedLabel = updatedDaysAgo === 0 ? '今天' : updatedDaysAgo === 1 ? '昨天' : `${updatedDaysAgo}天前`;
  return (
    <button className="skill-row" type="button" role="link" aria-label="查看技能详情: ${skill.name}" tabIndex={0} onClick={onOpen}>
      <span className="skill-icon">{skill.name.slice(0, 2).toUpperCase()}</span>
      <span className="skill-main">
        <span className="skill-title" role="heading" aria-level={3}><strong><HighlightText text={skill.name} terms={highlightTerms} /></strong><Badge status={skill.status} /></span>
        <span className="skill-desc"><HighlightText text={skill.description} terms={highlightTerms} /></span>
        <span className="tag-row">{skill.tags.map((tag) => <em key={tag}><HighlightText text={tag} terms={highlightTerms} /></em>)}</span>
      </span>
      <span className="skill-meta"><small>作者</small><strong><HighlightText text={skill.author} terms={highlightTerms} /></strong></span>
      <span className="skill-meta"><small>来源</small><strong><HighlightText text={skill.source} terms={highlightTerms} /></strong></span>
      <span className="skill-meta"><small>更新</small><strong>{updatedLabel}</strong></span>
      <span className="skill-metrics"><strong>⭐ {skill.rating.toFixed(1)}</strong><small>📥 {formatCompact(skill.installs)} 安装 · {skill.reviews} 评价 · 📅 {updatedLabel}更新</small></span>
      <span className="open-link">查看详情</span>
    </button>
  );
}

function HighlightText({ text, terms }: { text: string; terms: string[] }) {
  const highlights = terms
    .map((term) => term.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  if (!highlights.length) return text;

  const matcher = new RegExp(`(${highlights.map(escapeRegExp).join('|')})`, 'gi');
  const parts = text.split(matcher).filter(Boolean);

  return (
    <>
      {parts.map((part, index) => (
        highlights.some((term) => part.localeCompare(term, undefined, { sensitivity: 'accent' }) === 0)
          ? <mark className="search-highlight" key={`${part}-${index}`}>{part}</mark>
          : <span key={`${part}-${index}`}>{part}</span>
      ))}
    </>
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function FileTree({ entry, selectedPath, onOpen }: { entry: SkillFileEntry; selectedPath: string; onOpen: (path: string) => void }) {
  if (entry.type === 'file') {
    return <button className={entry.path === selectedPath ? 'file-node active' : 'file-node'} type="button" onClick={() => onOpen(entry.path)}><span>FILE</span><strong>{entry.name}</strong></button>;
  }
  return (
    <div className={entry.path ? 'file-folder' : 'file-folder root'}>
      {entry.path ? <div className="file-folder-label">DIR <strong>{entry.name}</strong></div> : null}
      <div className="file-folder-children">{entry.children?.map((child) => <FileTree entry={child} key={child.path} selectedPath={selectedPath} onOpen={onOpen} />)}</div>
    </div>
  );
}

export function ReviewForm({
  skill,
  onSubmitted,
}: {
  skill: Skill;
  onSubmitted: (review: FeedbackItem) => void | Promise<void>;
}) {
  const [form, setForm] = useState<FeedbackInput>({ ...emptyForm, skillId: skill.id, skillName: skill.name });
  const [state, setState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    setForm({ ...emptyForm, skillId: skill.id, skillName: skill.name });
    setState('idle');
    setValidationError('');
  }, [skill.id, skill.name]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = form.message.trim();
    if (message.length < 2) {
      setValidationError('请至少填写 2 个字的评价内容。');
      setState('idle');
      return;
    }

    setValidationError('');
    setState('submitting');
    try {
      const review = await submitFeedback({
        ...form,
        skillId: skill.id,
        skillName: skill.name,
        message,
        contact: form.anonymous ? '' : form.contact.trim(),
      });
      setForm({ ...emptyForm, skillId: skill.id, skillName: skill.name });
      setState('success');
      await onSubmitted(review);
    } catch {
      setState('error');
    }
  }

  return (
    <form className="review-form" onSubmit={handleSubmit}>
      <div className="panel-head"><div><p className="eyebrow">Feedback</p><h2>评价这个技能</h2></div><span>{state === 'success' ? '已提交' : '帮助维护者改进'}</span></div>
      <div className="rating-row" role="radiogroup" aria-label="评分">{[1, 2, 3, 4, 5].map((rating) => <button className={form.rating === rating ? 'active' : ''} key={rating} type="button" onClick={() => setForm((current) => ({ ...current, rating }))}>{rating}</button>)}</div>
      <div className="tag-row choose">{reviewTags.map((tag) => <button className={form.tags.includes(tag) ? 'active' : ''} key={tag} type="button" onClick={() => setForm((current) => ({ ...current, tags: current.tags.includes(tag) ? current.tags.filter((item) => item !== tag) : [...current.tags, tag] }))}>{tag}</button>)}</div>
      <textarea value={form.message} placeholder="说说这个技能哪里好用，哪里还需要改进。" onChange={(event) => { setValidationError(''); setState((current) => current === 'success' ? 'idle' : current); setForm((current) => ({ ...current, message: event.target.value })); }} />
      <div className="form-grid">
        <label className="checkbox-row"><input checked={form.anonymous} type="checkbox" onChange={(event) => setForm((current) => ({ ...current, anonymous: event.target.checked, contact: event.target.checked ? '' : current.contact }))} />匿名评价</label>
        <input disabled={form.anonymous} value={form.contact} placeholder="联系方式（可选）" onChange={(event) => setForm((current) => ({ ...current, contact: event.target.value }))} />
      </div>
      <button className="primary" disabled={state === 'submitting'} type="submit">{state === 'submitting' ? '提交中...' : '提交评价'}</button>
      {validationError ? <div className="form-feedback warn">{validationError}</div> : null}
      {state === 'success' ? <div className="form-feedback ok">评价已提交，已同步到当前技能的评价列表。</div> : null}
      {state === 'error' ? <div className="empty-state danger-text">提交失败，请稍后重试。</div> : null}
    </form>
  );
}

export function ReviewItem({
  review,
  onStatusChange,
}: {
  review: FeedbackItem;
  onStatusChange?: (review: FeedbackItem) => void;
}) {
  const [status, setStatus] = useState<FeedbackStatus>(review.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setStatus(review.status);
    setError('');
  }, [review.id, review.status]);

  async function changeStatus(nextStatus: FeedbackStatus) {
    const previousStatus = status;
    setStatus(nextStatus);
    setSaving(true);
    setError('');
    try {
      const updated = await updateFeedbackStatus(review.id, nextStatus);
      setStatus(updated.status);
      onStatusChange?.(updated);
    } catch {
      setStatus(previousStatus);
      setError('状态更新失败，请稍后重试。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="review-item">
      <div className="panel-head">
        <strong>{review.skillName || '未知技能'} / {review.rating} 分</strong>
        <select
          disabled={saving}
          value={status}
          onChange={(event) => { void changeStatus(event.target.value as FeedbackStatus); }}
        >
          <option value="submitted">新评价</option><option value="reviewing">处理中</option><option value="approved">已采纳</option><option value="rejected">不采纳</option><option value="archived">已归档</option>
        </select>
      </div>
      <p>{review.message}</p>
      <div className="tag-row">{review.tags.map((tag) => <em key={tag}>{tag}</em>)}</div>
      <small>{review.anonymous ? '匿名用户' : review.contact || '未填写联系方式'}</small>
      {saving ? <small>状态保存中...</small> : null}
      {error ? <div className="form-feedback warn">{error}</div> : null}
    </article>
  );
}

function badgeClass(status: string): string {
  if (['已同步', '已解析', '已发布', '已验证', '通过', '启用', '默认源'].includes(status)) return 'ok';
  if (['未保存', '未发布', '待审核', '待确认', '发布中', '待校验', '新发布'].includes(status)) return 'warn';
  if (['保存失败', '需处理', '已驳回', '发布失败', '停用'].includes(status)) return 'danger';
  return 'neutral';
}

export function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

export function averageRating(items: Skill[]) {
  if (!items.length) return '0.0';
  return (items.reduce((total, item) => total + item.rating, 0) / items.length).toFixed(1);
}

export function formatCompact(value: number) {
  return new Intl.NumberFormat('zh-CN', { notation: 'compact' }).format(value);
}

export function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function statusLabelFromApi(status: SkillItem['status']): SkillStatus {
  if (status === 'verified') return '已验证';
  if (status === 'new') return '新发布';
  return '待审核';
}

function sourceLabel(source: string): string {
  const legacyPlatformSources = new Set(['official', 'backend-private', 'delivery-private', 'quality', 'platform', 'uploaded']);
  const normalizedSource = legacyPlatformSources.has(source) ? 'default' : source;
  const labels: Record<string, string> = { default: 'Suit Skills 默认源', 'anthropics-skills': 'Anthropic 官方技能库', superpowers: 'Superpowers 工程技能库', 'vercel-agent-skills': 'Vercel Agent 技能库', 'huggingface-skills': 'Hugging Face 技能库', 'antigravity-awesome-skills': 'Antigravity 技能合集', 'awesome-claude-skills': 'Claude 技能资源索引' };
  return labels[normalizedSource] ?? normalizedSource;
}

function categoryLabel(category: string): string {
  const labels: Record<string, string> = { frontend: '前端', backend: '后端', document: '文档', delivery: '交付', quality: '质量', platform: '平台', custom: '自定义' };
  return labels[category] ?? category;
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
}

function timestampValue(value: string): number {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}
