/**
 * The office answers work a worker did that was not on the list (owner,
 * 2026-10-18): "Yaakov did work that wasn't on the list. This is what he
 * wrote: …" — then one of three plain answers. Opened from a glowing task
 * on the notebook, and from the task's own card in the job window.
 *
 * Portalled to the body and sealed (it is opened from inside board nodes),
 * Escape in the capture phase so it closes before the window behind it.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useStore, loadProjectSnapshot } from '../../data/store';
import { aptLabel, getStageName, type ContractorAssignment, type OffListItem } from '../../types';
import { isWorkStage } from '../../data/stageMarks';
import { Translated } from '../ui/Translated';

export function OffListQuestion({ projectId, task, item, onClose }: {
  projectId: string;
  task: ContractorAssignment;
  item: OffListItem;
  onClose: () => void;
}) {
  const s = useStore(st => st.mainUiStrings);
  const rtl = !!s.isRtl;
  const contractors = useStore(st => st.contractors);
  const stages = useStore(st => st.stages);
  const currentProjectId = useStore(st => st.currentProjectId);
  const liveApts = useStore(st => st.apartments);
  const answerOffList = useStore(st => st.answerOffList);
  const [pickStage, setPickStage] = useState(false);

  const worker = contractors.find(c => c.id === task.contractorId)?.name || item.by || (rtl ? 'העובד' : 'The worker');
  const apt = useMemo(() => {
    const list = projectId === currentProjectId ? liveApts : loadProjectSnapshot(projectId).apartments;
    return list.find(a => a.id === task.apartmentId);
  }, [projectId, currentProjectId, liveApts, task.apartmentId]);
  const workStages = stages
    .filter(st => st.active && isWorkStage(st) && (projectId === 'general' ? st.projectId === 'general' : !st.projectId))
    .sort((a, b) => a.order - b.order);
  const when = new Date(item.at);
  const day = when.toLocaleDateString(rtl ? 'he-IL' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'short' });

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation(); e.preventDefault();
      if (pickStage) setPickStage(false); else onClose();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose, pickStage]);

  const seal = {
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onPointerUp: (e: React.PointerEvent) => e.stopPropagation(),
    onPointerMove: (e: React.PointerEvent) => e.stopPropagation(),
    onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    onContextMenu: (e: React.MouseEvent) => e.stopPropagation(),
    onWheel: (e: React.WheelEvent) => e.stopPropagation(),
    onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation(),
  };
  const answer = (choice: Parameters<typeof answerOffList>[3]) => {
    answerOffList(projectId, task.id, item.id, choice);
    onClose();
  };
  const pronoun = rtl ? 'הוא כתב' : 'This is what he wrote:';

  return createPortal(
    <div {...seal} dir="ltr">
      <div className="fixed inset-0 z-[180]" style={{ backgroundColor: 'rgba(15,23,42,.45)' }} onClick={onClose} />
      <div data-offlist-question={item.id} className="fixed z-[181] rounded-2xl bg-white overflow-hidden flex flex-col"
        style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(460px, 94vw)', maxHeight: '88vh',
          boxShadow: '0 24px 60px -16px rgba(15,23,42,.45)' }}>
        <div className="px-4 py-3 border-b border-gray-100 flex items-start gap-2">
          <h3 data-offlist-title className="m-0 text-[15px] font-extrabold text-slate-800 flex-1">
            {rtl ? `${worker} עשה עבודה שלא הייתה ברשימה` : `${worker} did work that wasn't on the list`}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" title={rtl ? 'סגירה' : 'Close'}><X size={16} /></button>
        </div>
        <div className="px-4 py-3 overflow-y-auto space-y-3 text-[13.5px] text-slate-700">
          <p className="m-0 text-gray-500 text-[12.5px]">{apt ? aptLabel(apt) : ''}{apt ? ' · ' : ''}{day}</p>
          <div>
            <p className="m-0 mb-1 font-semibold">{pronoun}{rtl ? ':' : ''}</p>
            <blockquote data-offlist-words className="m-0 rounded-xl border-s-4 border-[#7c3aed] bg-violet-50 px-3 py-2 text-[14.5px] text-slate-800">
              “<Translated text={item.text} to={rtl ? 'he' : 'en'} />”
            </blockquote>
          </div>
          <p className="m-0 font-extrabold text-slate-800">{rtl ? 'מה לעשות עם זה?' : 'What should we do with it?'}</p>
          {!pickStage ? (
            <div className="space-y-2">
              <button data-offlist-answer="stage" onClick={() => setPickStage(true)} disabled={!apt}
                className="w-full text-start rounded-xl border-2 border-gray-200 hover:border-[#1e3a5f] px-3 py-2.5 disabled:opacity-40">
                <span className="block font-bold">{rtl ? 'זה היה אחד השלבים' : 'It was one of the stages'}</span>
                <span className="block text-[12px] text-gray-500">{rtl ? 'בחרו איזה — הוא יסומן כגמור בדירה הזאת' : 'Pick which — it is ticked done on this apartment'}</span>
              </button>
              <button data-offlist-answer="task" onClick={() => answer({ kind: 'task' })}
                className="w-full text-start rounded-xl border-2 border-gray-200 hover:border-[#1e3a5f] px-3 py-2.5">
                <span className="block font-bold">{rtl ? 'לעשות מזה משימה נפרדת' : 'Make it a task of its own'}</span>
                <span className="block text-[12px] text-gray-500">{rtl ? `משימה סגורה ל${day}, כדי שהעבודה תיספר` : `A closed task for ${day}, so the work is counted`}</span>
              </button>
              <button data-offlist-answer="note" onClick={() => answer({ kind: 'note' })}
                className="w-full text-start rounded-xl border-2 border-gray-200 hover:border-[#1e3a5f] px-3 py-2.5">
                <span className="block font-bold">{rtl ? 'להשאיר את זה כהערה' : 'Just keep it as a note'}</span>
                <span className="block text-[12px] text-gray-500">{rtl ? 'זה נשאר כתוב על המשימה שנסגרה' : 'It stays written on the closed task'}</span>
              </button>
            </div>
          ) : (
            <div data-offlist-stages className="space-y-2">
              <p className="m-0 text-[12.5px] text-gray-500">{rtl ? 'איזה שלב?' : 'Which stage?'}</p>
              <div className="flex flex-wrap gap-1.5">
                {workStages.map(st => (
                  <button key={st.id} data-offlist-stage={st.id} onClick={() => answer({ kind: 'stage', stageId: st.id })}
                    className="inline-flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-1.5 text-[12.5px] font-bold text-gray-700 hover:border-[#1e3a5f]"
                    style={{ borderColor: `${st.color}88` }}>
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: st.color }} />
                    {getStageName(st, rtl)}
                  </button>
                ))}
              </div>
              <button onClick={() => setPickStage(false)} className="text-[12.5px] font-bold text-[#1e3a5f]">
                {rtl ? '← חזרה' : '‹ Back'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
