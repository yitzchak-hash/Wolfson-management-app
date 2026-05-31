import React, { useState, useEffect } from 'react';
import { X, Save, Building2, AlertTriangle, Link, Unlink, ExternalLink, BookOpen, Download, Eye, EyeOff, Activity, RefreshCw } from 'lucide-react';
import { Apartment, User } from '../../types';
import { useStore } from '../../data/store';
import { format } from 'date-fns';
import { StageNotesSection } from './StageNotesSection';
import { ActivitySection } from './ActivitySection';
import { extractFileId, drivePreviewUrl, driveDownloadUrl, findPlansPdf } from '../../data/driveApi';

interface Props {
  apartment: Apartment | null;
  onClose: () => void;
  currentUser: User;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}

export function ApartmentDetailDrawer({ apartment, onClose, currentUser, onToast }: Props) {
  const { stages, activityLogs, apartments, updateApartment, mergeApartments, unmergeApartments,
    googleAccessToken, googleTokenExpiry, autoBackup, backupSnapshots, restoreFromSnapshot } = useStore();

  const [displayName, setDisplayName] = useState('');
  const [currentStageId, setCurrentStageId] = useState<string>('');
  const [classification, setClassification] = useState<'standard' | 'shinui'>('standard');
  const [generalNotes, setGeneralNotes] = useState('');
  const [driveLink, setDriveLink] = useState('');
  const [plansPdfLink, setPlansPdfLink] = useState('');
  const [mergedWithId, setMergedWithId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'details' | 'stages' | 'history'>('details');
  const [showUnmergeModal, setShowUnmergeModal] = useState(false);
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [showHealthCheck, setShowHealthCheck] = useState(false);
  const [fetchingPdf, setFetchingPdf] = useState(false);
  const [detectedPdfId, setDetectedPdfId] = useState<string | null>(null);

  useEffect(() => {
    if (apartment) {
      setDisplayName(apartment.displayName || apartment.apartmentNumber);
      setCurrentStageId(apartment.currentStageId ?? '');
      setClassification(apartment.classification);
      setGeneralNotes(apartment.generalNotes);
      setDriveLink(apartment.driveLink ?? '');
      setPlansPdfLink(apartment.plansPdfLink ?? '');
      setMergedWithId(apartment.mergedWith ?? '');
      setShowPdfViewer(false);
      setShowHealthCheck(false);
      setActiveTab('details');
      // Auto-detect PDF if drive link is present and token available
      const existingFileId = apartment.plansPdfLink ? extractFileId(apartment.plansPdfLink) : null;
      setDetectedPdfId(existingFileId);
      if (!existingFileId && apartment.driveLink && googleAccessToken && Date.now() < (googleTokenExpiry ?? 0)) {
        setFetchingPdf(true);
        findPlansPdf(apartment.driveLink, googleAccessToken).then(f => {
          if (f) setDetectedPdfId(f.id);
        }).finally(() => setFetchingPdf(false));
      }
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
      driveLink: driveLink.trim() || undefined,
      plansPdfLink: plansPdfLink.trim() || undefined,
    }, currentUser);
    onToast('Apartment details saved');
  }

  function handleSaveMerge() {
    if (!mergedWithId && mergedPartner) {
      // Unlinking — show modal to decide who keeps the data
      setShowUnmergeModal(true);
      return;
    }
    mergeApartments(apartment!.id, mergedWithId || null, currentUser);
    const partner = apartments.find(a => a.id === mergedWithId);
    if (partner) {
      onToast(`Linked with Apt ${partner.displayName || partner.apartmentNumber}`);
    } else {
      onToast('Merge link cleared');
    }
  }

  function handleConfirmUnmerge(keepDataAptId: string | 'both') {
    setShowUnmergeModal(false);
    unmergeApartments(apartment!.id, keepDataAptId, currentUser);
    onToast('Apartments unlinked');
  }

  return (
    <>
      {/* Unmerge confirmation modal */}
      {showUnmergeModal && mergedPartner && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[60]" onClick={() => setShowUnmergeModal(false)} />
          <div className="fixed z-[70] bg-white rounded-2xl shadow-2xl p-6" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'min(400px, 90vw)' }}>
            <h3 className="font-bold text-gray-900 mb-1 text-base">Unlink Apartments</h3>
            <p className="text-sm text-gray-500 mb-4">
              Unlinking Apt <strong>{apartment.displayName || apartment.apartmentNumber}</strong> and Apt <strong>{mergedPartner.displayName || mergedPartner.apartmentNumber}</strong>.
              Which apartment keeps the shared data (stage, drive link)?
            </p>
            <div className="space-y-2">
              <button
                onClick={() => handleConfirmUnmerge(apartment.id)}
                className="w-full text-left px-4 py-3 rounded-xl border-2 border-gray-200 hover:border-[#1e3a5f] transition-all"
              >
                <div className="font-medium text-sm text-gray-800">Apt {apartment.displayName || apartment.apartmentNumber} keeps the data</div>
                <div className="text-xs text-gray-400 mt-0.5">Apt {mergedPartner.displayName || mergedPartner.apartmentNumber} — stage &amp; drive link will be cleared</div>
              </button>
              <button
                onClick={() => handleConfirmUnmerge(mergedPartner.id)}
                className="w-full text-left px-4 py-3 rounded-xl border-2 border-gray-200 hover:border-[#1e3a5f] transition-all"
              >
                <div className="font-medium text-sm text-gray-800">Apt {mergedPartner.displayName || mergedPartner.apartmentNumber} keeps the data</div>
                <div className="text-xs text-gray-400 mt-0.5">Apt {apartment.displayName || apartment.apartmentNumber} — stage &amp; drive link will be cleared</div>
              </button>
              <button
                onClick={() => handleConfirmUnmerge('both')}
                className="w-full text-left px-4 py-3 rounded-xl border-2 border-gray-200 hover:border-[#1e3a5f] transition-all"
              >
                <div className="font-medium text-sm text-gray-800">Both keep their current data</div>
                <div className="text-xs text-gray-400 mt-0.5">Just removes the link — no data is cleared</div>
              </button>
            </div>
            <button
              onClick={() => setShowUnmergeModal(false)}
              className="mt-3 w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </>
      )}

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
              {mergedPartner
                ? (() => {
                    const numA = Number(apartment.displayName || apartment.apartmentNumber) || 0;
                    const numB = Number(mergedPartner.displayName || mergedPartner.apartmentNumber) || 0;
                    const labelA = apartment.displayName || apartment.apartmentNumber;
                    const labelB = mergedPartner.displayName || mergedPartner.apartmentNumber;
                    return numA <= numB ? `Apt ${labelA} / ${labelB}` : `Apt ${labelB} / ${labelA}`;
                  })()
                : (apartment.displayName || apartment.apartmentNumber ||
                    <span className="italic text-white/60 text-base">Unnamed</span>)
              }
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

              {/* Classification — compact toggle */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Classification</label>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setClassification('standard')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                      classification === 'standard'
                        ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    Standard
                  </button>
                  <button
                    onClick={() => setClassification('shinui')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                      classification === 'shinui'
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    Changes
                  </button>
                  {classification === 'shinui' && (
                    <span className="text-xs text-amber-600 flex items-center gap-1 ml-1">
                      <AlertTriangle size={11} /> Logged automatically
                    </span>
                  )}
                </div>
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

              {/* Google Drive link */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
                    <ExternalLink size={11} />
                    Google Drive Folder
                  </label>
                  <button
                    onClick={() => setShowHealthCheck(v => !v)}
                    className={`flex items-center gap-1 text-xs transition-colors ${showHealthCheck ? 'text-[#1e3a5f]' : 'text-gray-400 hover:text-[#1e3a5f]'}`}
                    title="Drive folder health check"
                  >
                    <Activity size={11} />
                    Health
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    value={driveLink}
                    onChange={e => setDriveLink(e.target.value)}
                    placeholder="https://drive.google.com/drive/folders/..."
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                  />
                  {driveLink && (
                    <a
                      href={driveLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center px-3 py-2 rounded-lg border border-gray-200 text-gray-500 hover:text-[#4aa8d8] hover:border-[#4aa8d8] transition-all"
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
                {showHealthCheck && (
                  <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-1.5">
                    <p className="text-xs font-medium text-gray-600 mb-2">Folder Health</p>
                    {[
                      { label: 'Main Drive folder linked', ok: !!driveLink.trim() },
                      { label: 'Plans PDF detected', ok: !!detectedPdfId },
                    ].map(({ label, ok }) => (
                      <div key={label} className="flex items-center gap-2 text-xs">
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ${ok ? 'bg-green-500' : 'bg-red-400'}`} style={{ fontSize: '9px' }}>
                          {ok ? '✓' : '✗'}
                        </span>
                        <span className="text-gray-600">{label}</span>
                      </div>
                    ))}
                    {!detectedPdfId && !fetchingPdf && (
                      <p className="text-[10px] text-gray-400 mt-1.5 pt-1.5 border-t border-gray-200">
                        {googleAccessToken ? 'Refresh to re-check.' : 'Connect Google Drive in Settings → App to check.'}
                      </p>
                    )}
                  </div>
                )}
                {mergedPartner && mergedPartner.driveLink && driveLink && mergedPartner.driveLink !== driveLink.trim() && (
                  <div className="mt-1.5 flex items-start gap-1.5 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 border border-red-200">
                    <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                    <span>
                      Merged partner (Apt {mergedPartner.displayName || mergedPartner.apartmentNumber}) has a different Drive link.
                      Saving will sync both to the same link.
                    </span>
                  </div>
                )}
              </div>

              {/* Engineering Plans PDF — auto-detected or manually linked */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
                    <BookOpen size={11} /> Engineering Plans
                  </label>
                  {driveLink && googleAccessToken && Date.now() < (googleTokenExpiry ?? 0) && (
                    <button
                      onClick={() => {
                        setFetchingPdf(true);
                        findPlansPdf(driveLink, googleAccessToken!).then(f => {
                          if (f) { setDetectedPdfId(f.id); setPlansPdfLink(`https://drive.google.com/file/d/${f.id}/view`); }
                        }).finally(() => setFetchingPdf(false));
                      }}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-[#1e3a5f] transition-colors"
                      title="Re-fetch PDF from Drive"
                    >
                      <RefreshCw size={11} className={fetchingPdf ? 'animate-spin' : ''} />
                      {fetchingPdf ? 'Detecting…' : 'Refresh'}
                    </button>
                  )}
                </div>

                {detectedPdfId ? (
                  <>
                    {/* Thumbnail — small preview, click to expand */}
                    <div
                      className="rounded-xl overflow-hidden border border-gray-200 cursor-pointer relative mb-2"
                      style={{ height: showPdfViewer ? '440px' : '160px' }}
                      onClick={() => setShowPdfViewer(v => !v)}
                    >
                      <iframe
                        src={drivePreviewUrl(detectedPdfId)}
                        width="100%"
                        height={showPdfViewer ? '440' : '160'}
                        allow="autoplay"
                        title="Engineering Plans"
                        style={{ border: 'none', display: 'block', pointerEvents: showPdfViewer ? 'auto' : 'none' }}
                      />
                      {!showPdfViewer && (
                        <div className="absolute inset-0 flex items-end justify-center pb-2 bg-gradient-to-t from-black/20 to-transparent">
                          <span className="text-white text-[10px] font-medium bg-black/40 px-2 py-0.5 rounded">Click to expand</span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setShowPdfViewer(v => !v)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:border-[#1e3a5f] hover:text-[#1e3a5f] transition-all">
                        {showPdfViewer ? <EyeOff size={12} /> : <Eye size={12} />}
                        {showPdfViewer ? 'Hide' : 'Full View'}
                      </button>
                      <a href={driveDownloadUrl(detectedPdfId)} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:border-[#4aa8d8] hover:text-[#4aa8d8] transition-all">
                        <Download size={12} /> Download
                      </a>
                    </div>
                  </>
                ) : fetchingPdf ? (
                  <div className="flex items-center gap-2 text-xs text-gray-400 py-3">
                    <RefreshCw size={12} className="animate-spin" /> Looking for Plans PDF in Drive…
                  </div>
                ) : (
                  <div className="text-xs text-gray-400 italic py-1">
                    {driveLink
                      ? googleAccessToken && Date.now() < (googleTokenExpiry ?? 0)
                        ? 'No Plans PDF found in Drive folder. Click Refresh to retry.'
                        : 'Connect Google Drive in Settings to auto-detect the Plans PDF.'
                      : 'Set the Drive folder link above to auto-detect Plans PDF.'}
                  </div>
                )}
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
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-700">Recent Activity</h4>
                {autoBackup && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">Auto-backup on</span>
                )}
              </div>
              <ActivitySection
                logs={aptLogs}
                autoBackup={autoBackup}
                backupSnapshots={backupSnapshots}
                onRestore={(snapshotId) => {
                  restoreFromSnapshot(snapshotId);
                  onToast('Restored to selected point in time');
                }}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
