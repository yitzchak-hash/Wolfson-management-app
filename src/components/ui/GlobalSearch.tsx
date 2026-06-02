import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Building2, ClipboardList, FileText, MessageSquare } from 'lucide-react';
import { useStore } from '../../data/store';
import { useNavigate } from 'react-router-dom';

interface SearchResult {
  id: string;
  type: 'apartment' | 'task' | 'note' | 'contractor_note';
  title: string;
  subtitle: string;
  aptId?: string;
}

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
}

export function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const { apartments, contractorAssignments, stageNotes, contractorNotes, contractors, stages } = useStore();
  const s = useStore(state => state.mainUiStrings);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const q = query.toLowerCase();
    const found: SearchResult[] = [];

    // Apartments
    apartments.filter(a => !a.isUnnamed).forEach(a => {
      const text = [a.displayName, a.apartmentNumber, a.generalNotes].join(' ').toLowerCase();
      if (text.includes(q)) {
        found.push({
          id: `apt-${a.id}`, type: 'apartment',
          title: `${a.buildingId} · Apt ${a.displayName || a.apartmentNumber}`,
          subtitle: a.generalNotes.trim() ? a.generalNotes.slice(0, 80) : `Floor ${a.floor}`,
          aptId: a.id,
        });
      }
    });

    // Tasks
    contractorAssignments.forEach(a => {
      if (a.taskDescription.toLowerCase().includes(q)) {
        const apt = apartments.find(ap => ap.id === a.apartmentId);
        const contractor = contractors.find(c => c.id === a.contractorId);
        found.push({
          id: `task-${a.id}`, type: 'task',
          title: a.taskDescription.slice(0, 60),
          subtitle: `${a.buildingId} · Apt ${apt?.displayName || apt?.apartmentNumber} · ${contractor?.name ?? ''}`,
          aptId: a.apartmentId,
        });
      }
    });

    // Stage notes
    stageNotes.forEach(n => {
      if (n.noteText.toLowerCase().includes(q)) {
        const apt = apartments.find(a => a.id === n.apartmentId);
        const stage = stages.find(s => s.id === n.stageId);
        found.push({
          id: `note-${n.id}`, type: 'note',
          title: n.noteText.slice(0, 60),
          subtitle: `${apt?.buildingId} · Apt ${apt?.displayName || apt?.apartmentNumber} · ${stage?.name ?? ''}`,
          aptId: n.apartmentId,
        });
      }
    });

    // Contractor notes
    contractorNotes.forEach(n => {
      if (n.text.toLowerCase().includes(q)) {
        const apt = apartments.find(a => a.id === n.apartmentId);
        found.push({
          id: `cnote-${n.id}`, type: 'contractor_note',
          title: n.text.slice(0, 60),
          subtitle: `${apt?.buildingId} · Apt ${apt?.displayName || apt?.apartmentNumber} · ${n.authorName}`,
          aptId: n.apartmentId,
        });
      }
    });

    // Cap per category
    const groupCap = (type: SearchResult['type']) => found.filter(r => r.type === type).slice(0, 5);
    setResults([
      ...groupCap('apartment'),
      ...groupCap('task'),
      ...groupCap('note'),
      ...groupCap('contractor_note'),
    ]);
  }, [query, apartments, contractorAssignments, stageNotes, contractorNotes, contractors, stages]);

  function handleSelect(result: SearchResult) {
    onClose();
    if (result.aptId) {
      navigate(`/?apt=${result.aptId}`);
    }
  }

  const TYPE_ICON: Record<SearchResult['type'], React.ReactNode> = {
    apartment: <Building2 size={14} className="text-[#1e3a5f]" />,
    task: <ClipboardList size={14} className="text-amber-500" />,
    note: <FileText size={14} className="text-blue-500" />,
    contractor_note: <MessageSquare size={14} className="text-green-500" />,
  };

  const TYPE_LABEL: Record<SearchResult['type'], string> = {
    apartment: s.searchTypeApartment, task: s.searchTypeTask, note: s.searchTypeNote, contractor_note: s.searchTypeContractorNote,
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-start justify-center pt-20 px-4">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
          <Search size={18} className="text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={s.searchPlaceholder}
            className="flex-1 text-sm focus:outline-none text-gray-900 placeholder:text-gray-400"
          />
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        {results.length > 0 ? (
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
            {results.map(result => (
              <button
                key={result.id}
                onClick={() => handleSelect(result)}
                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="mt-0.5 flex-shrink-0">{TYPE_ICON[result.type]}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{result.title}</div>
                  <div className="text-xs text-gray-400 truncate">{result.subtitle}</div>
                </div>
                <span className="text-[10px] text-gray-300 flex-shrink-0 pt-0.5">{TYPE_LABEL[result.type]}</span>
              </button>
            ))}
          </div>
        ) : query.trim() ? (
          <div className="px-4 py-8 text-center text-gray-400 text-sm">{s.searchNoResults} "{query}"</div>
        ) : (
          <div className="px-4 py-6 text-center text-gray-400 text-sm">{s.searchStartTyping}</div>
        )}
      </div>
    </div>
  );
}
