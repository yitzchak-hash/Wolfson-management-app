/**
 * "This week" — the Job Board's weekly notebook as a compact card for the
 * Dashboard page (owner, 2026-10-18, "This Week First" answer 9).
 *
 * It draws the MAIN notebook read-only, one week under the week chips, from
 * whichever workspace you are standing in: live when the Job Board is open,
 * from its stored copy otherwise (re-read when a snapshot lands). The chips
 * still move between weeks — that is only looking. A press on "Open the full
 * notebook" goes to the Job Board, where the notebook can be edited.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { useStore, loadProjectSnapshot } from '../../data/store';
import { CanvasElement, DASHBOARD_BOARD } from '../../types';
import type { WidgetCtx } from '../../data/widgets';
import { PlannerWidget, PlannerData } from './PlannerWidget';

function isMainRota(e: CanvasElement): boolean {
  return e.type === 'widget' && e.widget === 'rota' && e.board !== DASHBOARD_BOARD
    && ((e.data ?? {}) as Record<string, unknown>).role !== 'projection';
}

export function NotebookWeekCard({ el, c }: { el: CanvasElement; c: WidgetCtx }) {
  const navigate = useNavigate();
  const currentProjectId = useStore(s => s.currentProjectId);
  const liveEls = useStore(s => s.canvasElements);
  const liveApts = useStore(s => s.apartments);
  const tick = useStore(s => s.snapshotTick);
  const here = currentProjectId === 'general';
  const { main, jobs } = useMemo(() => {
    if (here) return { main: liveEls.find(isMainRota) ?? null, jobs: liveApts };
    const snap = loadProjectSnapshot('general');
    // The open workspace's own units first — its live tasks are resolved
    // against this list — then the Job Board's, for the notebook's own cards.
    return { main: (snap.canvasElements ?? []).find(isMainRota) ?? null, jobs: [...liveApts, ...(snap.apartments ?? [])] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [here, here ? liveEls : null, liveApts, tick]);

  const openFull = () => {
    if (!here) useStore.getState().setCurrentProject('general');
    navigate('/jobs');
  };

  const head = (
    <div className="flex items-center gap-1.5 px-2 pt-1.5 pb-1 flex-shrink-0">
      <CalendarDays size={13} className="text-gray-400" />
      <span className="font-extrabold tracking-wide text-gray-500 text-[11px] uppercase truncate">
        {el.text?.trim() || 'This week'}
      </span>
      <span className="flex-1" />
      <button data-no-drag data-el-action data-week-card-open onClick={openFull}
        className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold text-[#1e3a5f] hover:bg-slate-100">
        Open the full notebook <ChevronRight size={12} />
      </button>
    </div>
  );

  if (!main) {
    return (
      <div data-week-card className="w-full h-full flex flex-col bg-white rounded-xl overflow-hidden">
        {head}
        <div className="flex-1 flex items-center justify-center text-center px-4 text-[12.5px] text-gray-400">
          {c.readOnly && (el.data as Record<string, unknown> | undefined)?.sample
            ? 'The Job Board’s notebook, this week'
            : 'The Job Board has no weekly notebook yet — add one there and it shows here.'}
        </div>
      </div>
    );
  }
  const data = { ...(main.data ?? {}), weekView: '', weeksShown: 1 } as PlannerData;
  return (
    <div data-week-card className="w-full h-full flex flex-col bg-white rounded-xl overflow-hidden">
      {head}
      <div className="flex-1 min-h-0">
        <PlannerWidget
          viewKey={`dash-${el.id}`}
          hideHeader
          el={main}
          data={data}
          jobs={jobs}
          contractors={c.contractors}
          users={c.users}
          assignments={c.assignments}
          stages={c.stages}
          readOnly
          update={() => {}}
          openJob={id => here ? c.openJob(id) : c.openUnit?.('general', id)}
          openUnit={c.openUnit}
        />
      </div>
    </div>
  );
}
