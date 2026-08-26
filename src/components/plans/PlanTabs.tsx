import React, { useEffect, useRef } from 'react';
import { Plus } from 'lucide-react';
import { usePlanDownload } from '../../data/planCache';

/**
 * One tab of the plan viewer/studio — a browser-style tab over one Drive file.
 *
 * The strip is remembered PER MACHINE, per job (`plan_tabs_<apartmentId>` in
 * localStorage), so reopening the studio brings the same tabs back. What a tab
 * remembers beyond its file: which working sketch it holds (`versionId` /
 * `sketchVersion` point at the autosaved planAnnotations record, which is how
 * unsaved marks survive a refresh — they already did, per sketch), and its
 * page and zoom.
 */
export interface PlanTab {
  id: string;
  fileId: string;
  name: string;
  kind: 'original' | 'annotated';
  versionId?: string | null;
  sketchVersion?: number | null;
  basedOn?: number;
  page?: number;
  scale?: number | null;
}

export function mintTab(fileId: string, name: string, kind: PlanTab['kind'] = 'original'): PlanTab {
  return { id: `T${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, fileId, name, kind };
}

export function loadTabState(key: string): { tabs: PlanTab[]; activeId: string } {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const d = JSON.parse(raw);
      if (Array.isArray(d.tabs) && d.tabs.length) {
        return { tabs: d.tabs, activeId: String(d.activeId ?? d.tabs[0].id) };
      }
    }
  } catch { /* fresh */ }
  return { tabs: [], activeId: '' };
}

export function saveTabState(key: string, tabs: PlanTab[], activeId: string): void {
  try { localStorage.setItem(key, JSON.stringify({ tabs, activeId })); } catch { /* private mode */ }
}

/**
 * The save-state clouds, per the owner: the × RED and the ✓ GREEN, drawn BIG
 * over the cloud — and they are icons only, not buttons. (The click-to-open-
 * Drive idea was dropped by his ruling.)
 */
const CLOUD_PATH = 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z';
export function CloudUnsaved({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={CLOUD_PATH} stroke="rgba(255,255,255,.55)" strokeWidth="1.6" />
      <g stroke="#ef4444" strokeWidth="2.8" strokeLinecap="round">
        <line x1="8.6" y1="8.6" x2="15.4" y2="15.4" />
        <line x1="15.4" y1="8.6" x2="8.6" y2="15.4" />
      </g>
    </svg>
  );
}
export function CloudSaved({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={CLOUD_PATH} stroke="rgba(255,255,255,.55)" strokeWidth="1.6" />
      <path d="M7.6 12.4 10.8 15.6 16.6 8.6" stroke="#22c55e" strokeWidth="2.8"
        strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/** The tiny downloading ring a tab wears while its plan is still arriving. */
function TabDownload({ fileId }: { fileId: string }) {
  const pct = usePlanDownload(fileId);
  if (pct == null || pct >= 100) return null;
  return (
    <span className="flex items-center gap-1 flex-shrink-0" title="Downloading this plan…">
      <span className="w-[10px] h-[10px] rounded-full animate-spin"
        style={{ border: '1.5px solid rgba(255,255,255,.3)', borderTopColor: '#4aa8d8' }} />
      <span className="text-[9px] text-white/55 tabular-nums">{pct}%</span>
    </span>
  );
}

/**
 * The strip itself. Chrome's manner: rounded tops, the lit tab brighter with
 * the accent underline, an always-visible × (the touch rule), and the + OUTSIDE
 * the scroller so it can never be covered. The picked tab is scrolled INTO
 * VIEW — with too many tabs the overflow hides the others, never the one you
 * are on (the owner's report: tabs were hiding under the +).
 */
export function PlanTabsStrip({ tabs, activeId, unsavedOf, showClouds, onPick, onCloseTab, onNewTab }: {
  tabs: PlanTab[];
  activeId: string;
  unsavedOf: (t: PlanTab) => boolean;
  /** Off in the read-only viewer — nothing there can be unsaved. */
  showClouds: boolean;
  onPick: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current?.querySelector(`[data-plan-tab="${activeId}"]`);
    el?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [activeId, tabs.length]);

  return (
    <div className="flex items-end min-w-0 flex-1 self-stretch" data-plan-tabs>
      <div ref={scrollRef} className="flex items-end gap-0.5 min-w-0 overflow-x-auto no-bar pt-1 self-stretch">
        {tabs.map(t => {
          const on = t.id === activeId;
          return (
            <div key={t.id} data-plan-tab={t.id} data-active={on ? '1' : undefined}
              role="tab" aria-selected={on}
              onClick={() => onPick(t.id)}
              title={t.name}
              className="flex items-center gap-1.5 flex-shrink-0 cursor-pointer relative min-w-0"
              style={{
                maxWidth: 170,
                padding: '5px 7px 6px 10px',
                borderRadius: '9px 9px 0 0',
                fontSize: 11.5, fontWeight: 600,
                color: on ? '#fff' : 'rgba(255,255,255,.72)',
                backgroundColor: on ? '#2c4f78' : 'rgba(255,255,255,.06)',
              }}>
              {showClouds && (
                <span className="flex-shrink-0 flex items-center"
                  title={unsavedOf(t) ? 'Unsaved marks — not in Drive yet' : 'Saved'}>
                  {unsavedOf(t) ? <CloudUnsaved /> : <CloudSaved />}
                </span>
              )}
              <TabDownload fileId={t.fileId} />
              <span className="truncate min-w-0">{t.name}</span>
              <span data-plan-tab-close role="button" aria-label="Close tab"
                onClick={e => { e.stopPropagation(); onCloseTab(t.id); }}
                className="flex-shrink-0 w-[16px] h-[16px] rounded flex items-center justify-center
                           text-white/60 hover:text-white hover:bg-white/20"
                style={{ fontSize: 12, lineHeight: 1 }}>
                ×
              </span>
              {on && (
                <span className="absolute" style={{
                  left: 8, right: 8, bottom: 2, height: 2, borderRadius: 2, backgroundColor: '#4aa8d8',
                }} />
              )}
            </div>
          );
        })}
      </div>
      <button data-plan-tab-new onClick={onNewTab} title="Open this plan in a new tab"
        className="flex-shrink-0 w-[24px] h-[24px] rounded-lg flex items-center justify-center
                   text-white/75 hover:bg-white/12 self-center ml-0.5">
        <Plus size={14} />
      </button>
    </div>
  );
}
