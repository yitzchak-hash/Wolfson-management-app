import React from 'react';
import { format } from 'date-fns';
import type { ActivityLang } from '../../data/activityWords';
import { DAY_WORDS, DayCard, DayVisit, placeKind, visitFragments } from '../../data/dayStory';
import { ActivityAvatar, clockRange } from './ActivityBits';
import type { ViewerItem } from './MediaViewer';

/**
 * One person's day, as a card (owner, 2026-10-06): who, which day, how many
 * places and how many closed — then one line per visit, earliest first, so
 * the day reads forward the way it was lived. Every line is the door to its
 * apartment; its pictures open in the viewer.
 *
 * Module level — a component declared in the page's render would be a new
 * type every render and remount every card on each tick.
 */

export interface VisitPlace {
  name: string;
  /** Present only when the record still exists somewhere it can be opened. */
  open?: () => void;
  openTitle?: string;
  /** Where the apartment stands NOW — its headline stage, from the live record. */
  now?: { name: string; color: string };
}

const MAX_THUMBS = 4;
const MAX_LOOKED = 6;

export function DayStoryCard({
  card, lang, dateLabel, place, ws, thumbs, onPhotos,
}: {
  card: DayCard;
  lang: ActivityLang;
  dateLabel: string;
  place: (v: DayVisit) => VisitPlace;
  /** The workspace's chip — only in the Job Board's centre, where days cross workspaces. */
  ws?: (id: string) => { name: string; color: string } | undefined;
  thumbs: (v: DayVisit) => ViewerItem[];
  onPhotos: (items: ViewerItem[], index: number) => void;
}) {
  const W = DAY_WORDS[lang];
  const clock = (iso: string) => format(new Date(iso), 'HH:mm');
  const looked = card.looked;
  const lookedShown = looked.slice(0, MAX_LOOKED);
  return (
    <section
      className="bg-white rounded-xl border border-gray-200 overflow-hidden"
      data-day-card={card.key}
      data-day-person={card.person}
      data-day-date={card.day}
    >
      <header className="flex items-center gap-3 px-3 sm:px-4 py-3 border-b border-gray-100 bg-slate-50/70 flex-wrap">
        <ActivityAvatar name={card.person} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-bold text-gray-900 text-base" data-day-name>{card.person}</span>
            <span className="text-sm text-gray-500" data-day-label>{dateLabel}</span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5" data-day-counts>
            {card.places > 0 && W.places(card.places, placeKind(card))}
            {card.closed > 0 && <> · <b className="font-semibold text-emerald-700">{W.closedN(card.closed)}</b></>}
          </div>
        </div>
        {ws && (
          <div className="flex gap-1 flex-wrap">
            {card.workspaces.map(id => {
              const look = ws(id);
              if (!look) return null;
              return (
                <span key={id} data-day-ws={id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                  style={{ backgroundColor: `${look.color}1a`, color: look.color }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: look.color }} />
                  {look.name}
                </span>
              );
            })}
          </div>
        )}
      </header>

      {card.visits.length > 0 && (
        <ol className="divide-y divide-gray-100">
          {card.visits.map(v => {
            const p = place(v);
            const frags = visitFragments(v, lang, clock);
            const pics = thumbs(v);
            const building = v.buildingId && v.buildingId !== 'G' ? v.buildingId : '';
            const look = ws?.(v.ws);
            return (
              <li key={v.key} className="px-3 sm:px-4 py-2.5 flex gap-3 min-w-0" data-day-visit={v.aptId}>
                <span dir="ltr" className="w-[5.5rem] flex-shrink-0 text-xs tabular-nums text-gray-500 pt-0.5" data-day-time>
                  {clockRange(v.last, v.first)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap min-w-0">
                    {p.open ? (
                      <button type="button" onClick={p.open} title={p.openTitle} data-day-place
                        className="font-semibold text-sm text-[#1e3a5f] hover:underline text-start break-words min-w-0">
                        {p.name}
                      </button>
                    ) : (
                      <span className="font-semibold text-sm text-gray-700 break-words min-w-0" data-day-place>{p.name}</span>
                    )}
                    {building && !p.name.startsWith(building) && (
                      <span className="px-1.5 py-px rounded bg-gray-100 text-gray-500 text-[11px] font-medium">{building}</span>
                    )}
                    {look && ws && card.workspaces.length > 1 && (
                      <span className="w-2 h-2 rounded-full flex-shrink-0 self-center" style={{ backgroundColor: look.color }} title={look.name} />
                    )}
                  </div>
                  {frags.length > 0 && (
                    <p className="text-sm text-gray-700 leading-snug mt-0.5 break-words" data-day-visit-line>
                      {frags.join(' · ')}
                    </p>
                  )}
                  {(pics.length > 0 || p.now) && (
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {pics.slice(0, MAX_THUMBS).map((it, i) => (
                        <button key={i} type="button" data-day-thumb onClick={() => onPhotos(pics, i)}
                          title={W.openPhotos(pics.length)}
                          className="w-11 h-11 rounded-lg overflow-hidden border border-gray-200 bg-gray-100 flex-shrink-0 hover:ring-2 hover:ring-[#4aa8d8]">
                          <img src={it.src} alt="" loading="lazy" className="w-full h-full object-cover" />
                        </button>
                      ))}
                      {pics.length > MAX_THUMBS && (
                        <button type="button" onClick={() => onPhotos(pics, MAX_THUMBS)} data-day-thumb-more
                          className="h-11 px-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-500 hover:border-gray-300">
                          +{pics.length - MAX_THUMBS}
                        </button>
                      )}
                      {p.now && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gray-50 border border-gray-200 text-[11px] text-gray-600" data-day-now>
                          <span className="text-gray-400">{W.now}</span>
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.now.color }} />
                          <b className="font-semibold">{p.now.name}</b>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {looked.length > 0 && (
        <div className="px-3 sm:px-4 py-2 border-t border-gray-100 text-xs text-gray-500 flex flex-wrap items-baseline gap-x-2 gap-y-1" data-day-looked={looked.length}>
          <span>{card.visits.length ? W.alsoLooked(looked.length) : W.onlyLooked(looked.length)}</span>
          {lookedShown.map((v, i) => {
            const p = place(v);
            return (
              <React.Fragment key={v.key}>
                {p.open ? (
                  <button type="button" onClick={p.open} title={p.openTitle} className="text-gray-600 hover:text-[#1e3a5f] hover:underline">{p.name}</button>
                ) : <span className="text-gray-600">{p.name}</span>}
                {i < lookedShown.length - 1 && <span aria-hidden="true">·</span>}
              </React.Fragment>
            );
          })}
          {looked.length > lookedShown.length && <span>+{looked.length - lookedShown.length}</span>}
        </div>
      )}
    </section>
  );
}
