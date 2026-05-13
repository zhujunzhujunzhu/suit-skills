import { useTheme, type ThemeMode } from '../hooks';
import './ThemeToggle.css';

export function ThemeToggle() {
  const { themeMode, effectiveTheme, setThemeMode } = useTheme();

  const handleModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setThemeMode(e.target.value as ThemeMode);
  };

  return (
    <div className="theme-toggle">
      <label htmlFor="theme-select" className="theme-toggle-label">
        主题:
      </label>
      <select
        id="theme-select"
        className="theme-toggle-select"
        value={themeMode}
        onChange={handleModeChange}
        aria-label="选择主题模式"
      >
        <option value="light">浅色</option>
        <option value="dark">深色</option>
        <option value="auto">自动</option>
      </select>
      <div className="theme-toggle-indicator" aria-hidden="true">
        {effectiveTheme === 'dark' ? '🌙' : '☀️'}
      </div>
    </div>
  );
}
