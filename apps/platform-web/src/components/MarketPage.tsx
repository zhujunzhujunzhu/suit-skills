import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { SourceItem } from '../api/client';
import { useLocalStorage } from '../hooks';
import {
  averageRating,
  formatCompact,
  Metric,
  PageHeader,
  SkillRow,
  sum,
  type Skill,
} from './shared';

type SortMode = 'install' | 'rating' | 'updated';

type FilterPrefs = { source: string; sort: SortMode };

const DEFAULT_FILTER_PREFS: FilterPrefs = {
  source: '全部来源',
  sort: 'install',
};

export function MarketPage({
  skills,
  sourceConfig,
  onOpenSkill,
  onSync,
  syncInProgress = false,
}: {
  skills: Skill[];
  sourceConfig: SourceItem[];
  onOpenSkill: (skillId: string) => void;
  onSync?: () => void | Promise<void>;
  syncInProgress?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('全部');
  const [filterPrefs, setFilterPrefs] = useLocalStorage<FilterPrefs>(
    'market-filter-prefs',
    DEFAULT_FILTER_PREFS,
  );
  const deferredQuery = useDeferredValue(query);
  const listRef = useRef<HTMLDivElement | null>(null);

  const sourceLabelByName = useMemo(
    () => new Map(sourceConfig.map((item) => [item.name, item.label])),
    [sourceConfig],
  );

  const indexedSkills = useMemo(() => {
    return skills.map((skill) => ({
      skill,
      searchableText: normalizeSearchText([
        skill.name,
        skill.description,
        skill.author,
        skill.source,
        sourceLabelByName.get(skill.source),
        skill.category,
        skill.version,
        skill.status,
        skill.command,
        ...skill.tags,
      ]),
    }));
  }, [skills, sourceLabelByName]);

  const categoryOptions = useMemo(() => {
    const dynamicCategories = skills
      .map((skill) => skill.category)
      .map(categoryGroupFor)
      .filter((item) => item !== '其他');
    const preferredOrder = ['前端', '后端', '数据', 'AI', '测试', '质量', '安全', '文档', '设计', 'DevOps', '效率', '业务'];
    const activeGroups = new Set(dynamicCategories);
    const orderedGroups = preferredOrder.filter((item) => activeGroups.has(item));
    const hasOther = skills.some((skill) => categoryGroupFor(skill.category) === '其他');
    return ['全部', ...orderedGroups, ...(hasOther ? ['其他'] : [])];
  }, [skills]);

  const sourceOptions = useMemo(() => {
    const configured = sourceConfig.filter((item) => item.enabled).map((item) => item.label);
    const configuredLabels = new Set(sourceConfig.map((item) => item.label));
    const discovered = skills
      .map((skill) => skill.source)
      .filter((sourceName) => !configuredLabels.has(sourceName));
    return ['全部来源', ...Array.from(new Set([...configured, ...discovered]))];
  }, [skills, sourceConfig]);

  const filteredSkills = useMemo(() => {
    const terms = normalizeSearchText(deferredQuery).split(' ').filter(Boolean);
    const configuredLabels = new Set(sourceConfig.map((item) => item.label));
    const enabledLabels = new Set(
      sourceConfig.filter((item) => item.enabled).map((item) => item.label),
    );

    return indexedSkills
      .filter(({ skill, searchableText }) => {
        const matchesQuery = !terms.length || terms.every((term) => searchableText.includes(term));
        const matchesCategory = category === '全部' || categoryGroupFor(skill.category) === category;
        const matchesSource = filterPrefs.source === '全部来源' || skill.source === filterPrefs.source;
        const enabledSource =
          !configuredLabels.has(skill.source) || enabledLabels.has(skill.source);
        return matchesQuery && matchesCategory && matchesSource && enabledSource;
      })
      .sort((a, b) => {
        if (filterPrefs.sort === 'rating') return b.skill.rating - a.skill.rating;
        if (filterPrefs.sort === 'updated') return b.skill.updatedAtValue - a.skill.updatedAtValue;
        return b.skill.installs - a.skill.installs;
      })
      .map(({ skill }) => skill);
  }, [category, deferredQuery, indexedSkills, filterPrefs.sort, filterPrefs.source, sourceConfig]);

  const highlightTerms = useMemo(
    () => normalizeSearchText(deferredQuery).split(' ').filter(Boolean),
    [deferredQuery],
  );

  const summary = useMemo(() => ({
    count: filteredSkills.length,
    installs: formatCompact(sum(filteredSkills.map((skill) => skill.installs))),
    rating: averageRating(filteredSkills),
  }), [filteredSkills]);

  const hasActiveFilters = Boolean(query.trim()) || category !== '全部' || filterPrefs.source !== '全部来源';

  const rowVirtualizer = useVirtualizer({
    count: filteredSkills.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 116,
    overscan: 5,
  });

  function scrollListToTop() {
    listRef.current?.scrollTo({ top: 0 });
  }

  function resetFilters() {
    setQuery('');
    setCategory('全部');
    setFilterPrefs(DEFAULT_FILTER_PREFS);
    scrollListToTop();
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    scrollListToTop();
  }

  function handleFilterChange(setter: (value: string) => void, value: string) {
    setter(value);
    scrollListToTop();
  }

  function handleSourceChange(value: string) {
    setFilterPrefs({ ...filterPrefs, source: value });
    scrollListToTop();
  }

  function handleSortChange(value: SortMode) {
    setFilterPrefs({ ...filterPrefs, sort: value });
    scrollListToTop();
  }

  return (
    <div className="page market-page">
      <PageHeader
        eyebrow="Skill marketplace"
        title="技能市场"
        description="浏览、检索、安装和评价团队技能。"
        actions={
          <button
            className="primary"
            disabled={syncInProgress || !onSync}
            type="button"
            onClick={() => { void onSync?.(); }}
          >
            {syncInProgress ? '同步中...' : '同步市场'}
          </button>
        }
      />
      <section className="toolbar market-toolbar" aria-label="技能市场筛选">
        <div className="search-field">
          <input
            value={query}
            placeholder="搜索名称、描述、作者、来源、分类、命令或标签"
            onChange={(event) => handleQueryChange(event.target.value)}
          />
          {query ? (
            <button
              aria-label="清空搜索"
              className="ghost compact"
              type="button"
              onClick={() => handleQueryChange('')}
            >
              清空
            </button>
          ) : null}
        </div>
        <select value={category} onChange={(event) => handleFilterChange(setCategory, event.target.value)}>
          {categoryOptions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={filterPrefs.source} onChange={(event) => handleSourceChange(event.target.value)}>
          {sourceOptions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={filterPrefs.sort} onChange={(event) => handleSortChange(event.target.value as SortMode)}>
          <option value="install">安装量优先</option>
          <option value="rating">评分优先</option>
          <option value="updated">最近更新</option>
        </select>
        {hasActiveFilters ? (
          <button className="ghost toolbar-reset" type="button" onClick={resetFilters}>
            重置筛选
          </button>
        ) : null}
      </section>
      <section className="market-summary">
        <Metric label="技能数量" value={summary.count} />
        <Metric label="安装总量" value={summary.installs} />
        <Metric label="平均评分" value={summary.rating} />
      </section>
      <section className="market-list-panel">
        <div className="skill-list virtual-skill-list" ref={listRef} aria-label="技能列表">
          {filteredSkills.length ? (
            <div
              className="virtual-skill-list-inner"
              style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                const skill = filteredSkills[virtualItem.index]!;
                return (
                  <div
                    className="virtual-skill-item"
                    data-index={virtualItem.index}
                    key={skill.id}
                    ref={rowVirtualizer.measureElement}
                    style={{ transform: `translateY(${virtualItem.start}px)` }}
                  >
                    <SkillRow
                      highlightTerms={highlightTerms}
                      skill={skill}
                      onOpen={() => onOpenSkill(skill.id)}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state market-empty">
              <strong>没有匹配的技能</strong>
              <span>换一个关键词，或重置筛选后再查看。</span>
              {hasActiveFilters ? <button className="primary" type="button" onClick={resetFilters}>重置筛选</button> : null}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function normalizeSearchText(parts: Array<string | undefined> | string): string {
  const value = Array.isArray(parts) ? parts.filter(Boolean).join(' ') : parts;
  return value
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}_-]+/gu, ' ')
    .trim();
}

function categoryGroupFor(category: string): string {
  const value = normalizeSearchText(category);
  if (!value || value === 'null' || value === 'undefined') return '其他';
  if (/(frontend|front-end|react|ui|pwa|android|web|前端)/.test(value)) return '前端';
  if (/(backend|java|spring|api|database|ddd|后端)/.test(value)) return '后端';
  if (/(data|analytics|spreadsheet|scraping|monitoring|数据)/.test(value)) return '数据';
  if (/(ai|llm|agent|mcp|voice|comfyui|image-generation|模型)/.test(value)) return 'AI';
  if (/(test|testing|automation|测试)/.test(value)) return '测试';
  if (/(quality|review|reliability|audit|质量|审查)/.test(value)) return '质量';
  if (/(security|credentials|risk|trust|安全)/.test(value)) return '安全';
  if (/(document|presentation|content|markdown|文档)/.test(value)) return '文档';
  if (/(design|graphics|media|remotion|video|设计)/.test(value)) return '设计';
  if (/(devops|git|deployment|governance|运维)/.test(value)) return 'DevOps';
  if (/(workflow|productivity|planning|project-management|collaboration|效率)/.test(value)) return '效率';
  if (/(business|marketing|market|legal|auction|real-estate|product|业务)/.test(value)) return '业务';
  return '其他';
}
