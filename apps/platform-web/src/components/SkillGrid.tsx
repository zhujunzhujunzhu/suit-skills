import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Skill } from './shared';
import { SkillRow } from './shared';
import { EmptyState } from './EmptyState';

export function SkillGrid({
  skills,
  highlightTerms,
  isFavorited,
  onOpenSkill,
  onToggleFavorite,
  hasActiveFilters,
  onResetFilters,
}: {
  skills: Skill[];
  highlightTerms: string[];
  isFavorited: (id: string) => boolean;
  onOpenSkill: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  hasActiveFilters: boolean;
  onResetFilters: () => void;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);

  const rowVirtualizer = useVirtualizer({
    count: skills.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 116,
    overscan: 5,
  });

  return (
    <section className="market-list-panel">
      <div className="skill-list virtual-skill-list" ref={listRef} aria-label="技能列表">
        {skills.length ? (
          <div
            className="virtual-skill-list-inner"
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualItem) => {
              const skill = skills[virtualItem.index]!;
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
                    isFavorited={isFavorited(skill.id)}
                    onToggleFavorite={() => onToggleFavorite(skill.id)}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            type="no-results"
            title="没有匹配的技能"
            description="换一个关键词，或重置筛选后再查看。"
            action={hasActiveFilters ? {
              label: '重置筛选',
              onClick: onResetFilters,
            } : undefined}
            ariaLabel="没有找到匹配的技能"
          />
        )}
      </div>
    </section>
  );
}
