import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Save } from 'lucide-react';
import { Stage, User } from '../../types';
import { useStore } from '../../data/store';
import { format } from 'date-fns';

interface StageNotesSectionProps {
  apartmentId: string;
  stages: Stage[];
  currentUser: User;
  onSaved: () => void;
}

export function StageNotesSection({ apartmentId, stages, currentUser, onSaved }: StageNotesSectionProps) {
  const { upsertStageNote, getStageNote } = useStore();
  const [openStage, setOpenStage] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const sortedStages = [...stages].filter(s => s.active).sort((a, b) => a.order - b.order);

  function handleSave(stageId: string) {
    const text = drafts[stageId] ?? (getStageNote(apartmentId, stageId)?.noteText ?? '');
    upsertStageNote(apartmentId, stageId, text, currentUser);
    onSaved();
  }

  function getDraft(stageId: string): string {
    if (drafts[stageId] !== undefined) return drafts[stageId];
    return getStageNote(apartmentId, stageId)?.noteText ?? '';
  }

  return (
    <div className="space-y-1.5">
      {sortedStages.map(stage => {
        const note = getStageNote(apartmentId, stage.id);
        const isOpen = openStage === stage.id;
        const hasNote = note && note.noteText.trim();

        return (
          <div key={stage.id} className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
              onClick={() => setOpenStage(isOpen ? null : stage.id)}
            >
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
                <span className="text-sm font-medium text-gray-800">{stage.name}</span>
                {hasNote && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Note</span>
                )}
              </div>
              {isOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
            </button>

            {isOpen && (
              <div className="p-3 space-y-2 bg-white">
                <textarea
                  value={getDraft(stage.id)}
                  onChange={e => setDrafts(d => ({ ...d, [stage.id]: e.target.value }))}
                  placeholder={`Notes for ${stage.name}...`}
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                />
                <div className="flex items-center justify-between">
                  {note ? (
                    <span className="text-xs text-gray-400">
                      Updated by {note.updatedByName} · {format(new Date(note.updatedAt), 'MMM d, yyyy HH:mm')}
                    </span>
                  ) : <span />}
                  <button
                    onClick={() => handleSave(stage.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e3a5f] text-white rounded-lg text-xs font-medium hover:bg-[#162d4a] transition-colors"
                  >
                    <Save size={12} />
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
