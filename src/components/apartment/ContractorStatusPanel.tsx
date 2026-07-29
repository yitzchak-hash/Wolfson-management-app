import React, { useEffect, useState, useCallback } from 'react';
import { X, RefreshCw, AlertCircle, ExternalLink, Link2 } from 'lucide-react';
import { useStore } from '../../data/store';
import { Apartment, aptLabel } from '../../types';
import {
  fetchContractorSheet, parseSheet, percentColor, parseWolfsonSheet,
  isWolfsonLayout, STATE_COLORS, countBlocks, parseWolfsonAllTabs,
  SheetApartmentStatus, WolfsonCategoryStatus, isSheetBackendConfigured,
} from '../../data/sheetApi';

/** One apartment's reading. A linked pair produces two of these from one fetch. */
interface UnitResult {
  apt: Apartment;
  status: SheetApartmentStatus | null;   // Netiv-style percentages
  marks: WolfsonCategoryStatus[] | null; // Wolfson-style colour marks
  diag: string | null;
}

/**
 * Live per-category progress for an apartment, read straight from the
 * contractor's shared spreadsheet. Nothing is cached in the store — every open
 * re-reads the sheet, so what you see is what the contractor last typed.
 *
 * Connected (merged) apartments are shown as two SEPARATE readings, because the
 * contractor still tracks each physical unit on its own row even when the buyer
 * has joined them. Both are resolved from a single fetch.
 */
export function ContractorStatusPanel({ apartment, onClose }: {
  apartment: Apartment;
  onClose: () => void;
}) {
  const { contractorSheetLinks, currentProjectId, buildings, apartments, mainUiStrings: ui } = useStore();
  const contractorSheetLink = contractorSheetLinks[currentProjectId] ?? '';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [units, setUnits] = useState<UnitResult[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [sheetTitle, setSheetTitle] = useState('');
  const [tabCount, setTabCount] = useState(0);

  const partner = apartment.mergedWith
    ? apartments.find(a => a.id === apartment.mergedWith) ?? null
    : null;

  // Sorted so the pair reads identically whichever half you opened
  const targets: Apartment[] = partner
    ? [apartment, partner].sort((a, b) =>
        (Number(a.apartmentNumber) || 0) - (Number(b.apartmentNumber) || 0))
    : [apartment];

  const orderedBuildings = [...buildings].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  const blockOf = (apt: Apartment) =>
    Math.max(0, orderedBuildings.findIndex(b => b.id === apt.buildingId));

  const targetKey = targets.map(t => t.id).join('|');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchContractorSheet(contractorSheetLink);
    if (!res.ok) {
      setError(res.error);
      setUnits(null);
      setLoading(false);
      return;
    }
    setSheetTitle(res.title);
    setFetchedAt(res.fetchedAt);
    setTabCount(res.sheets?.length ?? 0);

    // A single fetch serves every unit in the pair
    const wolfson = isWolfsonLayout(res.rows);
    const parsed = targets.map<UnitResult>(apt => {
      const num = apt.apartmentNumber?.trim() ?? '';
      const bi = blockOf(apt);
      if (wolfson) {
        // One trade per tab — merge them all into a single category list
        const found = parseWolfsonAllTabs(res.sheets, apt.buildingId, num);
        return {
          apt, status: null, marks: found.length ? found : null,
          diag: found.length ? null
            : `${res.kind} · ${res.sheets.length} tabs · colour layout · no ${apt.buildingId} block found`,
        };
      }
      const all = parseSheet(res.rows, bi);
      const hit = all.find(a => a.apartmentNumber === num) ?? null;
      return {
        apt, status: hit, marks: null,
        diag: hit ? null
          : `${res.kind} · tab "${res.tab}" · ${res.rows.length} rows · block ${bi + 1} of ${countBlocks(res.rows)} · found: ${all.slice(0, 12).map(a => a.apartmentNumber).join(', ') || 'none'}`,
      };
    });
    setUnits(parsed);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractorSheetLink, targetKey]);

  useEffect(() => { load(); }, [load]);

  const notConfigured = !contractorSheetLink?.trim() || !isSheetBackendConfigured();
  const isPair = targets.length > 1;

  function renderUnit(u: UnitResult) {
    if (u.marks) {
      return u.marks.map(cat => {
        const c = STATE_COLORS[cat.state];
        const label = cat.state === 'done' ? ui.markDone
          : cat.state === 'progress' ? ui.markProgress
          : cat.state === 'issue' ? ui.markIssue : ui.markNone;
        return (
          <div key={cat.name} className="mb-3">
            <div className="flex justify-between items-baseline mb-1 gap-2">
              <span className="text-[11.5px] font-semibold text-gray-700 truncate">{cat.name}</span>
              <span className="text-[11px] font-bold flex-shrink-0" style={{ color: c }}>{label}</span>
            </div>
            <div className="h-[9px] rounded-full overflow-hidden bg-gray-100">
              <div className="h-full rounded-full transition-all"
                style={{ width: cat.state === 'done' ? '100%' : cat.state === 'none' ? '0%' : '50%', backgroundColor: c }} />
            </div>
            {cat.note && (
              <p className="text-[10px] text-gray-400 mt-0.5 truncate" dir="rtl" title={cat.note}>{cat.note}</p>
            )}
          </div>
        );
      });
    }
    if (u.status) {
      return u.status.categories.map(cat => {
        const c = percentColor(cat.percent);
        return (
          <div key={cat.name} className="mb-3">
            <div className="flex justify-between items-baseline mb-1 gap-2">
              <span className="text-[11.5px] font-semibold text-gray-700 truncate">{cat.name}</span>
              <span className="text-[12px] font-extrabold tabular-nums flex-shrink-0" style={{ color: c }}>
                {cat.percent === null ? '—' : `${cat.percent}%`}
              </span>
            </div>
            <div className="h-[9px] rounded-full overflow-hidden bg-gray-100">
              <div className="h-full rounded-full transition-all"
                style={{ width: `${cat.percent ?? 0}%`, backgroundColor: c }} />
            </div>
          </div>
        );
      });
    }
    return (
      <div className="flex flex-col items-center text-center py-6 px-2">
        <AlertCircle size={22} className="text-gray-300 mb-2" />
        <p className="text-xs text-gray-500 font-medium">{ui.aptNotInSheet}</p>
        {u.diag && (
          <p className="text-[10px] text-gray-400 mt-2 pt-2 border-t border-gray-100 leading-relaxed break-words w-full" dir="ltr">
            {u.diag}
          </p>
        )}
      </div>
    );
  }

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
            {apartment.buildingId} · {isPair
              ? targets.map(t => t.apartmentNumber).join('/')
              : aptLabel(apartment)}
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
              : fetchedAt ? `${sheetTitle || ui.contractorSheetLabel}${tabCount > 1 ? ` · ${tabCount} tabs` : ''} · ${new Date(fetchedAt).toLocaleTimeString()}`
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
          ) : loading && !units ? (
            <div className="space-y-3.5 py-1">
              {[0, 1, 2, 3, 4].map(i => (
                <div key={i}>
                  <div className="h-2.5 w-28 bg-gray-100 rounded mb-1.5 animate-pulse" />
                  <div className="h-2.5 bg-gray-100 rounded-full animate-pulse" />
                </div>
              ))}
            </div>
          ) : units ? (
            <>
              {isPair && (
                <div className="flex items-center gap-1.5 mb-3 text-[10.5px] text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5">
                  <Link2 size={12} className="flex-shrink-0" />
                  <span>{ui.linkedPairSeparateHint}</span>
                </div>
              )}
              {units.map((u, i) => (
                <div key={u.apt.id}>
                  {isPair && (
                    <div className={`flex items-baseline gap-2 mb-2 ${i > 0 ? 'mt-4 pt-3 border-t border-gray-200' : ''}`}>
                      <span className="text-[12px] font-bold text-[#1e3a5f]">
                        {ui.aptPrefix} {u.apt.apartmentNumber || '—'}
                      </span>
                      {u.apt.displayName?.trim() && u.apt.displayName.trim() !== u.apt.apartmentNumber?.trim() && (
                        <span className="text-[10.5px] text-gray-400 truncate">{u.apt.displayName}</span>
                      )}
                    </div>
                  )}
                  {renderUnit(u)}
                </div>
              ))}
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
