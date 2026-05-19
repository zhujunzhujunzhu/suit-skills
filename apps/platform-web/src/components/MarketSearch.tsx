import { useEffect, useState } from 'react';

export function MarketSearch({
  query,
  searchHistory,
  showSearchHistory,
  onQueryChange,
  onShowHistory,
  onSelectHistory,
  onClearHistory,
}: {
  query: string;
  searchHistory: string[];
  showSearchHistory: boolean;
  onQueryChange: (value: string) => void;
  onShowHistory: (show: boolean) => void;
  onSelectHistory: (item: string) => void;
  onClearHistory: () => void;
}) {
  const [inputValue, setInputValue] = useState(query);

  useEffect(() => {
    setInputValue(query);
  }, [query]);

  function handleInputChange(value: string) {
    setInputValue(value);
    onQueryChange(value);
  }

  return (
    <div className="market-search">
      <div className="search-box">
        <input
          type="text"
          placeholder="搜索技能..."
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => onShowHistory(true)}
          onBlur={() => setTimeout(() => onShowHistory(false), 200)}
          className="search-input"
        />
      </div>
      {showSearchHistory && searchHistory.length > 0 && (
        <div className="search-history">
          <div className="history-header">
            <span>搜索历史</span>
            <button onClick={onClearHistory} className="clear-btn">清空</button>
          </div>
          <div className="history-items">
            {searchHistory.map((item) => (
              <button
                key={item}
                onClick={() => onSelectHistory(item)}
                className="history-item"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
