import React from 'react';
import { useStore } from '../../data/store';

/**
 * What a permanent delete takes with it, said before it happens.
 *
 * Every confirm dialog renders THIS rather than its own guess, so the board's
 * warning, the drawer's warning and the trash window's warning can never give
 * three different answers about the same job. The counts come from the store's
 * own `deletionImpact`, the same records the cascade will actually remove.
 */
export function deleteImpactParts(impact: {
  tasks: number; photos: number; workerNotes: number;
  stageNotes: number; pins: number; markups: number;
}): string[] {
  const bit = (n: number, one: string, many: string) =>
    n > 0 ? `${n} ${n === 1 ? one : many}` : null;
  return [
    bit(impact.tasks, 'task', 'tasks'),
    bit(impact.photos, 'photo', 'photos'),
    bit(impact.workerNotes, 'worker note', 'worker notes'),
    bit(impact.stageNotes, 'stage note', 'stage notes'),
    bit(impact.pins, 'plan pin', 'plan pins'),
    bit(impact.markups, 'plan markup', 'plan markups'),
  ].filter(Boolean) as string[];
}

export function DeleteImpact({ aptIds }: { aptIds: string[] }) {
  const deletionImpact = useStore(s => s.deletionImpact);
  const total = aptIds.reduce((acc, id) => {
    const i = deletionImpact(id);
    (Object.keys(i) as (keyof typeof i)[]).forEach(k => { acc[k] = (acc[k] ?? 0) + i[k]; });
    return acc;
  }, {} as Record<string, number>);
  const parts = deleteImpactParts(total as Parameters<typeof deleteImpactParts>[0]);

  if (!parts.length) {
    return <p className="text-sm text-gray-500 mb-1">Nothing else is attached to it.</p>;
  }
  return (
    <p className="text-sm text-gray-600 mb-1">
      Going with {aptIds.length === 1 ? 'it' : 'them'}:{' '}
      <span className="font-semibold text-red-600">{parts.join(', ')}</span>.
    </p>
  );
}

/** The same truth in one short line, for the tight two-step confirms in bins. */
export function useDeleteImpactLine(aptId: string | null): string {
  const deletionImpact = useStore(s => s.deletionImpact);
  if (!aptId) return '';
  const parts = deleteImpactParts(deletionImpact(aptId));
  return parts.length ? `takes ${parts.join(', ')} with it` : 'nothing else attached';
}
