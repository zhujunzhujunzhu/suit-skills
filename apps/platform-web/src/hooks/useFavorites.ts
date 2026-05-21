import { useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';

export function useFavorites() {
  const [favoriteIds, setFavoriteIds] = useLocalStorage<string[]>('market-favorites', []);

  const isFavorited = useCallback(
    (skillId: string) => favoriteIds.includes(skillId),
    [favoriteIds],
  );

  const toggleFavorite = useCallback(
    (skillId: string) => {
      if (favoriteIds.includes(skillId)) {
        setFavoriteIds(favoriteIds.filter((id) => id !== skillId));
      } else {
        setFavoriteIds([...favoriteIds, skillId]);
      }
    },
    [favoriteIds, setFavoriteIds],
  );

  return { favoriteIds, isFavorited, toggleFavorite };
}
