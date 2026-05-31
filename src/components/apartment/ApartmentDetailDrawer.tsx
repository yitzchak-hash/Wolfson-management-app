import React, { useState, useEffect } from 'react';
import { X, Save, Building2, AlertTriangle, Link, Unlink } from 'lucide-react';
import { Apartment, User } from '../../types';
import { useStore } from '../../data/store';
import { format } from 'date-fns';
import { StageNotesSection } from './StageNotesSection';
import { ActivitySection } from './ActivitySection';

interface Props {
  apartment: Apartment | null;
  onClose: () => void;
  currentUser: User;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}

export function ApartmentDetailDrawer({ apartment, onClose, currentUser, onToast }: Props) {
  const { stages, activityLogs, apartments, updateApartment, mergeApartments } = useStore();

  const [displayName, setDisplayName] = useState('');
  const [currentStageId, setCurrentStageId] = useState<string>('');
  const [classification, setClassification] = useState<'standard' | 'shinui'>('standard');
  const [generalNotes, setGeneralNotes] = useState('');
  const [mergedWithId, setMergedWithId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'details' | 'stages' | 'history'>('details');

  useEffect(() => {
    if (apartment) {
      setDisplayName(apartment.displayName || apartment.apartmentNumber);
      setCurrentStageId(apartment.currentStageId ?? '');
      setClassification(apartment.classification);
      setGeneralNotes(apartment.generalNotes);
      setMergedWithId(apartment.mergedWith ?? '');
      setActiveTab('details');
    }
  }, [apartment?.id]);

  if (!apartment) return null;

  const sortedStages = [...stages].filter(s => s.active).sort((a, b) => a.order - b.order);
  const currentStage = stages.find(s => s.id === currentStageId);
  const aptLogs = activityLogs.filter(l => l.apartmentId === apartment.id).slice(0, 20);

  const sameBuildingApts = apartments
    .filter(a => a.buildingId === apartment.buildingId && a.id !== apartment.id && !a.isUnnamed)
    .sort((a, b) => (Number(a.apartmentNumber) || 0) - (Number(b.apartmentNumber) || 0));

  const mergedPartner = apartments.find(a => a.id === apartment.mergedWith);

  function handleSaveBasic() {
    updateApartment(apartment!.id, {
      displayName,
      apartmentNumber: displayName,
      currentStageId: currentStageId || null,
      classification,
      generalNotes,
    }, currentUser);
    onToast('Apartment details saved');
  }

  function handleSaveMerge() {
    mergeApartments(apartment!.id, mergedWithId || null, currentUser);
    const partner = apartments.find(a => a.id === mergedWithId);
    if (partner) {
      onToast(`Linked with Apt ${partner.displayName || partner.apartmentNumber}`);
    } else {
      onToast('Merge link cleared');
    }
  }

  return (
    <>
      <div className="drawer-overlay fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      <div className="drawer-panel fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#1e3a5f] text-white flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Building2 size={18} className="text-[#4aa8d8]" />
              <span className="text-[#4aa8d8] font-semibold">{apartment.buildingId}</span>
            </div>
            <span className="text-white/40 flex-shrink-0">·</span>
            <span className="font-bold text-lg truncate">
              {apartment.displayName || apartment.apartmentNumber ||
                <span className="italic text-white/60 text-base">Unnamed</span>}
            </span>
            {apartment.floor > 0 && (
              <span className="text-white/60 text-sm flex-shrink-0">Floor {apartment.floor}</span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* Status bar */}
        <div className="flex items-center gap-2 px-5 py-2.5 bg-gray-50 border-b border-gray-200 flex-shrink-0 flex-wrap">
          {currentStage ? (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
              style={{ backgroundColor: currentStage.color + '22', color: currentStage.color, border: `1px solid ${currentStage.color}55` }}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: currentStage.color }} />
              {currentStage.name}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200">
              Not Started
            </span>
          )}
          {classification === 'shinui' && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
              <AlertTriangle size={11} />
              Changes
            </span>
          )}
          {apartment.isDuplexApt && (
            <span className="text-xs text-gray-400 italic">duplex</span>
          )}
          {apartment.updatedByName && (
            <span className="ml-auto text-xs text-gray-400">
              {apartment.updatedByName} · {format(new Date(apartment.updatedAt), 'MMM d')}
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 flex-shrink-0">
          {(['details', 'stages', 'history'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'border-b-2 border-[#1e3a5f] text-[#1e3a5f]'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'stages' ? 'Stage Notes' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-5">
          {activeTab === 'details' && (
            <div className="space-y-4">
              {/* Apartment name */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Apartment Number / Name</label>
                <input
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Enter apartment number or name"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                />
              </div>

              {/* Stage */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Current Stage</label>
                <select
                  value={currentStageId}
                  onChange={e => setCurrentStageId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                >
                  <option value="">— Not Started —</option>
                  {sortedStages.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Classification — simple toggle, no extra form */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Classification</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setClassification('standard')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                      classification === 'standard'
                        ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    Standard
                  </button>
                  <button
                    onClick={() => setClassification('shinui')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                      classification === 'shinui'
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    Changes
                  </button>
                </div>
                {classification === 'shinui' && (
                  <p className="text-xs text-amber-600 mt-1.5">
                    Marked as Changes — change is logged automatically.
                  </p>
                )}
              </div>

              {/* General notes */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">General Notes</label>
                <textarea
                  value={generalNotes}
                  onChange={e => setGeneralNotes(e.target.value)}
                  rows={3}
                  placeholder="General notes about this apartment..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 resize-none"
                />
              </div>

              <button
                onClick={handleSaveBasic}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#162d4a] transition-colors"
              >
                <Save size={16} />
                Save Changes
              </button>

              {/* Merged / connected units */}
              <div className="border-t border-gray-100 pt-4">
                <label className="block text-xs font-medium text-gray-600 mb-1.5 flex items-center gap-1.5">
                  <Link size={12} />
                  Connected Unit (buyer merged two apartments)
                </label>
                {mergedPartner && (
                  <div className="mb-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700">
                    <Link size={12} />
                    Currently linked to Apt <strong>{mergedPartner.displayName || mergedPartner.apartmentNumber}</strong>
                  </div>
                )}
                <div className="flex gap-2">
                  <select
                    value={mergedWithId}
                    onChange={e => setMergedWithId(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                  >
                    <option value="">— No connection —</option>
                    {sameBuildingApts.map(a => (
                      <option key={a.id} value={a.id}>
                        Apt {a.displayName || a.apartmentNumber} (Floor {a.floor > 0 ? a.floor : 'B'})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleSaveMerge}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-all bg-blue-600 text-white hover:bg-blue-700"
                  >
                    {mergedWithId ? <Link size={14} /> : <Unlink size={14} />}
                    {mergedWithId ? 'Link' : 'Clear'}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1.5">Linking is mutual — both apartments will show the connection.</p>
              </div>
            </div>
          )}

          {activeTab === 'stages' && (
            <StageNotesSection
              apartmentId={apartment.id}
              stages={sortedStages}
              currentUser={currentUser}
              onSaved={() => onToast('Note saved')}
            />
          )}

          {activeTab === 'history' && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Recent Activity</h4>
              <ActivitySection logs={aptLogs} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
