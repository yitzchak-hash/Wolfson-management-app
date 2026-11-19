/**
 * Small, look-only pieces of the apartment window, used by BOTH the office's window (ApartmentDetailDrawer) and the
 * outside shared view's window (src/shared/SharedApartmentWindow) — so the two stay the same window (owner,
 * 2026-11-18: "the same window as we see, but just the features that are available. Same exact window and style").
 *
 * Props in, markup out: nothing here may import the store, Firebase or Drive — the shared view loads this file.
 */
import React from 'react';
import type { MainUiStrings } from '../../types';
import { buildingShort } from '../../data/aptSale';
import { rowNumOf } from '../../data/floorRows';

/**
 * The window's size beside a plan. The plan gets at least HALF the window (owner, 2026-11-08): the fields never
 * take more than half, nor more than 560; the sheet sizes the window by its own shape (`ratio`, width / height).
 * 141 = the navy header (56) plus the plan pane's own two bars (47 + 38, measured).
 */
export function drawerSizes(innerW: number, innerH: number, ratio: number) {
  const maxModalH = Math.min(980, innerH * 0.93);
  const availW = Math.round(innerW * 0.96);
  const fieldsW = Math.max(340, Math.min(560, availW - 340, Math.round(availW / 2)));
  const fitW = Math.max(280, Math.round(innerW * 0.96) - fieldsW);
  const planW = Math.min(Math.round((maxModalH - 56) * ratio), fitW);
  const modalH = Math.min(maxModalH,
    Math.max(Math.round(planW / ratio) + 141, Math.min(640, maxModalH)));
  return { maxModalH, fieldsW, planW, modalH };
}

/** The window itself: full screen on a phone, a centred window everywhere else (wider with the plan beside it). */
export function drawerPanelClass(isPhone: boolean): string {
  return `drawer-panel fixed bg-white shadow-2xl z-[120] flex flex-col overflow-hidden ${isPhone ? '' : 'rounded-2xl'}`;
}
export function drawerPanelStyle(isPhone: boolean, planSideOn: boolean, s: { fieldsW: number; planW: number; modalH: number }): React.CSSProperties {
  return isPhone
    ? { inset: 0, width: '100%', height: '100%' }
    : {
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: planSideOn ? `min(${s.fieldsW + s.planW}px, 96vw)` : 'min(1020px, 94vw)',
        height: planSideOn ? `${s.modalH}px` : 'min(980px, 93vh)',
        transition: 'width 180ms ease',
      };
}

/** One tab of the window's tab row. */
export function drawerTabClass(active: boolean, isPhone: boolean): string {
  return `flex-1 whitespace-nowrap font-medium transition-colors relative ${
    isPhone ? 'py-2 px-1 text-[12px]' : 'py-2.5 text-sm'
  } ${
    active ? 'border-b-2 border-[#1e3a5f] text-[#1e3a5f]' : 'text-gray-500 hover:text-gray-700'
  }`;
}

/**
 * The title's "Building B1 · Floor 3 · Apt 12 [A]". The floor is the one the building diagram LABELS — Wolfson's
 * towers print one lower than the stored floor.
 */
export function DrawerTitleChips({ buildingId, floor, apartmentNumber, tipus, ui }: {
  buildingId: string; floor: number; apartmentNumber?: string; tipus?: string; ui: MainUiStrings;
}) {
  const row = rowNumOf(buildingId, floor);
  return (
    <>
      <span data-drawer-building className="text-[#4aa8d8] font-semibold text-sm flex-shrink-0">{ui.buildingWord} {buildingShort(buildingId)}</span>
      {row && <span data-drawer-floor className="text-white/50 text-xs flex-shrink-0">· {ui.floorPrefix} {row}</span>}
      {apartmentNumber && <span data-drawer-aptno className="text-white/50 text-xs flex-shrink-0">· {ui.aptPrefix} {apartmentNumber}</span>}
      {tipus && <span data-tipus-chip className="text-white/85 text-xs font-bold flex-shrink-0 px-1.5 rounded bg-white/15">{tipus}</span>}
    </>
  );
}

/** A field's small grey label over its box. */
export function DetailLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[10px] font-medium text-gray-500 mb-1">{children}</label>;
}
