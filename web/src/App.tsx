import { useEffect, useMemo, useState } from 'react';
import {
  fetchInstalled,
  fetchSkillDetail,
  fetchSkills,
  fetchSources,
  type InstalledSkill,
  type SkillDetail,
  type SkillSummary,
  type Source,
} from './api/client';

type View = 'library' | 'installed';

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
      <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
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
  folder: <path d="M3 6h7l2 2h9v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4" />
      <path d="M12 18.8v2.4" />
      <path d="m4.8 4.8 1.7 1.7" />
      <path d="m17.5 17.5 1.7 1.7" />
      <path d="M2.8 12h2.4" />
      <path d="M18.8 12h2.4" />
      <path d="m4.8 19.2 1.7-1.7" />
      <path d="m17.5 6.5 1.7-1.7" />
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

function installCommand(skill: SkillSummary | SkillDetail | null): string {
  const name = 'meta' in (skill ?? {}) ? (skill as SkillDetail).meta.name : (skill as SkillSummary | null)?.name;
  return name ? `suit-skills install ${name}` : 'suit-skills install <skill>';
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
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{block.text}</p>;
      })}
    </div>
  );
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
  return blocks.length ? blocks : [{ kind: 'p', text: '这个 skill 暂时没有 SKILL.md 内容。' }];
}

export default function App() {
  const [view, setView] = useState<View>('library');
  const [sources, setSources] = useState<Source[]>([]);
  const [source, setSource] = useState<string>('default');
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [installed, setInstalled] = useState<InstalledSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    fetchSources()
      .then((data) => {
        setSources(data.sources);
        setSource(data.defaultSource);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchSkills({ source, q: query, tag })
      .then((data) => {
        setSkills(data.items);
        setSelected((current) =>
          current && data.items.some((item) => item.name === current)
            ? current
            : data.items[0]?.name ?? '',
        );
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [source, query, tag]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    fetchSkillDetail(selected, source)
      .then(setDetail)
      .catch((err: Error) => setError(err.message));
  }, [selected, source]);

  useEffect(() => {
    fetchInstalled({})
      .then((data) => setInstalled(data.items))
      .catch(() => setInstalled([]));
  }, []);

  const tags = useMemo(() => {
    const all = new Set<string>();
    for (const skill of skills) {
      skill.tags?.forEach((item) => all.add(item));
    }
    return Array.from(all).sort();
  }, [skills]);

  const selectedSummary = skills.find((skill) => skill.name === selected) ?? null;

  async function copyCommand() {
    const command = installCommand(detail ?? selectedSummary);
    await navigator.clipboard.writeText(command);
    setToast('已复制安装命令');
    window.setTimeout(() => setToast(''), 1600);
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
        <nav className="nav">
          <button className={view === 'library' ? 'active' : ''} onClick={() => setView('library')}>
            <Icon name="database" />
            <span>Sources</span>
          </button>
          <button className={view === 'installed' ? 'active' : ''} onClick={() => setView('installed')}>
            <Icon name="check" />
            <span>Installed</span>
          </button>
          <button onClick={() => setView('library')}>
            <Icon name="tag" />
            <span>Tags</span>
          </button>
        </nav>
        <div className="rail-status">
          <span>本地索引</span>
          <strong><i /> ready</strong>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="crumb">
            <strong>Suit Skills</strong>
            <span>/</span>
            <em>{view === 'installed' ? 'installed' : selected || 'library'}</em>
          </div>
          <button className="icon-button" title="设置">
            <Icon name="settings" />
          </button>
        </header>

        {view === 'library' ? (
          <section className="console-grid">
            <div className="library">
              <div className="toolbar">
                <label className="search">
                  <Icon name="search" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索技能、来源或标签..."
                  />
                </label>
                <select value={source} onChange={(event) => setSource(event.target.value)}>
                  {sources.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                  <option value="all">all enabled</option>
                </select>
                <button className="button primary">
                  <Icon name="plus" />
                  新建技能
                </button>
              </div>

              <div className="tag-row">
                <button className={tag === '' ? 'active' : ''} onClick={() => setTag('')}>
                  全部
                </button>
                {tags.map((item) => (
                  <button className={tag === item ? 'active' : ''} key={item} onClick={() => setTag(item)}>
                    {item}
                  </button>
                ))}
              </div>

              {error ? <div className="state error">{error}</div> : null}
              {loading ? <div className="state">正在扫描技能库...</div> : null}
              {!loading && skills.length === 0 ? <div className="state">没有匹配的技能</div> : null}

              <div className="skill-grid">
                {skills.map((skill, index) => (
                  <button
                    className={`skill-card ${selected === skill.name ? 'selected' : ''} ${index === 2 ? 'wide' : ''}`}
                    key={skill.name}
                    onClick={() => setSelected(skill.name)}
                  >
                    <span className="skill-card-head">
                      <span className="skill-icon">
                        <Icon name={skill.tags?.includes('react') ? 'tag' : 'database'} />
                      </span>
                      {skill.installed ? <em className="installed-dot">已安装</em> : <em>v{skill.version}</em>}
                    </span>
                    <strong>{skill.name}</strong>
                    <span>{skill.description || '暂无描述'}</span>
                    <span className="card-tags">
                      {skill.tags?.slice(0, 3).map((item) => <i key={item}>{item}</i>)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <aside className="detail">
              <div className="detail-hero">
                <h1>{detail?.meta.name ?? selectedSummary?.name ?? 'Skill Detail'}</h1>
                <p>{detail?.meta.description ?? selectedSummary?.description ?? '选择一个 skill 查看详情。'}</p>
              </div>
              <div className="detail-body">
                <button className="button primary block" onClick={copyCommand}>
                  <Icon name="copy" />
                  复制安装命令
                </button>
                <button className="button block">
                  <Icon name="folder" />
                  打开本地目录
                </button>
                <div className="meta-table">
                  <Info label="版本" value={detail?.meta.version ?? selectedSummary?.version} />
                  <Info label="作者" value={String(detail?.meta.author ?? selectedSummary?.author ?? '-')} />
                  <Info label="来源" value={detail?.sourceName ?? selectedSummary?.sourceName} />
                  <Info label="安装状态" value={detail?.installedTargets.join(', ') || '未安装'} />
                </div>
                <MarkdownView markdown={detail?.markdown ?? ''} />
              </div>
            </aside>
          </section>
        ) : (
          <section className="installed-page">
            <h1>已安装 Skills</h1>
            <p>这里展示当前项目与配置目标中已经存在的 skill。</p>
            <div className="installed-list">
              {installed.map((item) => (
                <article key={`${item.target}:${item.path}`}>
                  <strong>{item.name}</strong>
                  <span>{item.target}</span>
                  <code>{item.path}</code>
                </article>
              ))}
              {installed.length === 0 ? <div className="state">当前没有检测到已安装 skill</div> : null}
            </div>
          </section>
        )}
      </main>

      {toast ? <div className="toast">{toast}</div> : null}
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
