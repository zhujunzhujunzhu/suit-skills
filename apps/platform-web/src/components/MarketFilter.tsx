export function MarketFilter({
  category,
  categoryOptions,
  sourceOptions,
  filterPrefs,
  onCategoryChange,
  onSourceChange,
  onSortChange,
}: {
  category: string;
  categoryOptions: string[];
  sourceOptions: string[];
  filterPrefs: { source: string; sort: 'install' | 'rating' | 'updated' };
  onCategoryChange: (value: string) => void;
  onSourceChange: (value: string) => void;
  onSortChange: (value: 'install' | 'rating' | 'updated') => void;
}) {
  return (
    <div className="market-filter-bar">
      <select
        value={category}
        onChange={(e) => onCategoryChange(e.target.value)}
        className="filter-select"
        aria-label="按分类筛选"
      >
        {categoryOptions.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>

      <select
        value={filterPrefs.source}
        onChange={(e) => onSourceChange(e.target.value)}
        className="filter-select"
        aria-label="按来源筛选"
      >
        {sourceOptions.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>

      <select
        value={filterPrefs.sort}
        onChange={(e) => onSortChange(e.target.value as 'install' | 'rating' | 'updated')}
        className="filter-select"
        aria-label="排序方式"
      >
        <option value="install">按安装量</option>
        <option value="rating">按评分</option>
        <option value="updated">按更新时间</option>
      </select>
    </div>
  );
}
