import { useDeferredValue, useMemo, useState } from 'react';
import type { SourceItem } from '../api/client';
import { useLocalStorage, useFavorites } from '../hooks';
import {
  averageRating,
  formatCompact,
  Metric,
  PageHeader,
  sum,
  type Skill,
} from './shared';
import { MarketSearch } from './MarketSearch';
import { MarketFilter } from './MarketFilter';
import { SkillGrid } from './SkillGrid';

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
  const [showSearchHistory, setShowSearchHistory] = useState(false);
  const [filterPrefs, setFilterPrefs] = useLocalStorage<FilterPrefs>(
    'market-filter-prefs',
    DEFAULT_FILTER_PREFS,
  );
  const deferredQuery = useDeferredValue(query);
  const [searchHistory, setSearchHistory] = useLocalStorage<string[]>('market-search-history', []);
  const { isFavorited, toggleFavorite } = useFavorites();

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
  }, [category, deferredQuery, indexedSkills, filterPrefs]);

  const highlightTerms = useMemo(
    () => normalizeSearchText(deferredQuery).split(' ').filter(Boolean),
    [deferredQuery],
  );

  const summary = useMemo(() => ({
    count: filteredSkills.length,
    installs: formatCompact(sum(filteredSkills.map((skill) => skill.installs))),
    rating: averageRating(filteredSkills),
  }), [filteredSkills]);

  const hasActiveFilters = useMemo(
    () => Boolean(query.trim()) || category !== '全部' || filterPrefs.source !== '全部来源',
    [query, category, filterPrefs.source]
  );

  function scrollListToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetFilters() {
    setQuery('');
    setCategory('全部');
    setFilterPrefs(DEFAULT_FILTER_PREFS);
    scrollListToTop();
  }

  function handleQueryChange(value: string) {
    if (value.trim() && !searchHistory.includes(value.trim())) {
      setSearchHistory([value.trim(), ...searchHistory.slice(0, 4)]);
    }
    setQuery(value);
    scrollListToTop();
  }

  function handleFilterChange(setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      scrollListToTop();
    };
  }

  return (
    <div className="market-page">
      <PageHeader
        eyebrow=""
        title="技能市场"
        description=""
        actions={
          <button
            onClick={onSync}
            disabled={syncInProgress}
            className="sync-button"
          >
            {syncInProgress ? '同步中...' : '同步'}
          </button>
        }
      />

      <section className="market-controls">
        <MarketSearch
          query={query}
          searchHistory={searchHistory}
          showSearchHistory={showSearchHistory}
          onQueryChange={handleQueryChange}
          onShowHistory={setShowSearchHistory}
          onSelectHistory={(item) => {
            setQuery(item);
            scrollListToTop();
          }}
          onClearHistory={() => setSearchHistory([])}
        />

        <MarketFilter
          category={category}
          categoryOptions={categoryOptions}
          sourceOptions={sourceOptions}
          filterPrefs={filterPrefs}
          onCategoryChange={handleFilterChange(setCategory)}
          onSourceChange={handleFilterChange((value) => setFilterPrefs({ ...filterPrefs, source: value }))}
          onSortChange={(sort) => {
            setFilterPrefs({ ...filterPrefs, sort });
            scrollListToTop();
          }}
        />

        <div className="market-summary">
          <Metric label="技能数量" value={summary.count} />
          <Metric label="总安装量" value={summary.installs} />
          <Metric label="平均评分" value={summary.rating} />
        </div>
      </section>

      <SkillGrid
        skills={filteredSkills}
        highlightTerms={highlightTerms}
        isFavorited={isFavorited}
        onOpenSkill={onOpenSkill}
        onToggleFavorite={toggleFavorite}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={resetFilters}
      />
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

