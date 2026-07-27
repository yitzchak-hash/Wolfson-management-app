import React, { useEffect, useState, useCallback } from 'react';
import { X, RefreshCw, AlertCircle, ExternalLink } from 'lucide-react';
import { useStore } from '../../data/store';
import { Apartment, aptLabel } from '../../types';
import {
  fetchContractorSheet, parseSheet, percentColor,
  SheetApartmentStatus, isSheetBackendConfigured,
} from '../../data/sheetApi';

/**
 * Live per-category progress for one apartment, read straight from the
 * contractor's shared spreadsheet. Nothing is cached in the store — every open
 * re-reads the sheet, so what you see is what the contractor last typed.
 */
export function ContractorStatusPanel({ apartment, onClose }: {
  apartment: Apartment;
  onClose: () => void;
}) {
  const { contractorSheetLink, buildings, mainUiStrings: ui } = useStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<SheetApartmentStatus | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [sheetTitle, setSheetTitle] = useState('');

  // Which side-by-side block in the sheet is this building? Buildings are ordered
  // by displayOrder, matching the sheet's left-to-right building blocks.
  const blockIndex = Math.max(
    0,
    [...buildings]
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
      .findIndex(b => b.id === apartment.buildingId),
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchContractorSheet(contractorSheetLink);
    if (!res.ok) {
      setError(res.error);
      setStatus(null);
    } else {
      setSheetTitle(res.title);
      setFetchedAt(res.fetchedAt);
      const all = parseSheet(res.rows, blockIndex);
      const num = apartment.apartmentNumber?.trim();
      setStatus(all.find(a => a.apartmentNumber === num) ?? null);
    }
    setLoading(false);
  }, [contractorSheetLink, blockIndex, apartment.apartmentNumber]);

  useEffect(() => { load(); }, [load]);

  const notConfigured = !contractorSheetLink?.trim() || !isSheetBackendConfigured();

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[80]" onClick={onClose} />
      <div
        className="fixed z-[90] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'min(440px, 92vw)', maxHeight: '82vh' }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 bg-[#1e3a5f] text-white flex-shrink-0">
          <span className="font-bold text-sm">{ui.contractorStatusTitle}</span>
          {!notConfigured && !error && (
            <span className="flex items-center gap-1 text-[9.5px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: 'rgba(74,168,216,0.22)', border: '1px solid rgba(74,168,216,0.45)', color: '#bfe3f7' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> {ui.liveLabel}
            </span>
          )}
          <span className="text-[11px] text-white/60 ml-auto truncate max-w-[45%]">
            {apartment.buildingId} · {aptLabel(apartment)}
          </span>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 flex-shrink-0">
            <X size={17} />
          </button>
        </div>

        {/* Sync bar */}
        <div className="flex items-center gap-2 px-4 py-1.5 bg-gray-50 border-b border-gray-100 text-[10.5px] text-gray-500 flex-shrink-0">
          <span className="truncate">
            {loading ? ui.loadingLabel
              : error ? ui.sheetUnavailable
              : fetchedAt ? `${sheetTitle || ui.contractorSheetLabel} · ${new Date(fetchedAt).toLocaleTimeString()}`
              : ''}
          </span>
          <button onClick={load} disabled={loading || notConfigured}
            className="ml-auto flex items-center gap-1 text-[#1e3a5f] font-semibold disabled:opacity-40 flex-shrink-0">
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> {ui.refreshButton}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3.5">
          {notConfigured ? (
            <div className="flex flex-col items-center text-center py-8 px-2">
              <AlertCircle size={26} className="text-amber-400 mb-2.5" />
              <p className="text-sm text-gray-600 font-medium mb-1">{ui.noSheetConfigured}</p>
              <p className="text-xs text-gray-400 leading-relaxed">{ui.noSheetConfiguredHint}</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center text-center py-8 px-2">
              <AlertCircle size={26} className="text-red-400 mb-2.5" />
              <p className="text-xs text-red-600 leading-relaxed">{error}</p>
              {contractorSheetLink && (
                <a href={contractorSheetLink} target="_blank" rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-xs text-[#4aa8d8] hover:underline">
                  <ExternalLink size={11} /> {ui.openSheet}
                </a>
              )}
            </div>
          ) : loading && !status ? (
            <div className="space-y-3.5 py-1">
              {[0, 1, 2, 3, 4].map(i => (
                <div key={i}>
                  <div className="h-2.5 w-28 bg-gray-100 rounded mb-1.5 animate-pulse" />
                  <div className="h-2.5 bg-gray-100 rounded-full animate-pulse" />
                </div>
              ))}
            </div>
          ) : !status ? (
            <div className="flex flex-col items-center text-center py-8 px-2">
              <AlertCircle size={26} className="text-gray-300 mb-2.5" />
              <p className="text-sm text-gray-500 font-medium mb-1">{ui.aptNotInSheet}</p>
              <p className="text-xs text-gray-400">
                {ui.aptPrefix} {apartment.apartmentNumber || '—'} · {apartment.buildingId}
              </p>
            </div>
          ) : (
            <div>
              {status.categories.map(cat => {
                const c = percentColor(cat.percent);
                const pct = cat.percent;
                return (
                  <div key={cat.name} className="mb-3">
                    <div className="flex justify-between items-baseline mb-1 gap-2">
                      <span className="text-[11.5px] font-semibold text-gray-700 truncate">{cat.name}</span>
                      <span className="text-[12px] font-extrabold tabular-nums flex-shrink-0" style={{ color: c }}>
                        {pct === null ? '—' : `${pct}%`}
                      </span>
                    </div>
                    <div className="h-[9px] rounded-full overflow-hidden bg-gray-100">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${pct ?? 0}%`, backgroundColor: c }} />
                    </div>
                  </div>
                );
              })}
              {status.rawLabel && (
                <p className="text-[10px] text-gray-300 mt-3 pt-2 border-t border-gray-100 text-center" dir="rtl">
                  {status.rawLabel}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
