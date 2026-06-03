const SOURCE_STORAGE_KEY = 'suit-skills.source';

export type SelectableSource = {
  enabled: boolean;
  name: string;
};

export function readStoredSource(): string | null {
  if (typeof window === 'undefined') return null;
  const value = localStorage.getItem(SOURCE_STORAGE_KEY)?.trim();
  return value || null;
}

export function writeStoredSource(source: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SOURCE_STORAGE_KEY, source);
}

export function nextSelectableSource(
  sources: SelectableSource[],
  current: string,
  fallback = 'all',
): string {
  if (current === 'all') return current;
  return sources.some((item) => item.enabled && item.name === current)
    ? current
    : fallback;
}

