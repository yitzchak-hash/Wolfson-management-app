/**
 * SETTINGS, the way the TzviAir Design Language draws every settings screen
 * (SettingsList): small grouped lists of categories, each on a coloured tile
 * with a white icon and a chevron; tap in to the category's page and back out.
 * From 1024px the list and the open page sit side by side.
 *
 * The open category is in the address (`?cat=backups`), so a category is a
 * real link: it can be bookmarked, sent, or ctrl-clicked into a new tab.
 * Without one, the page opens on the last category this person used
 * (kept with their other choices, in the cloud — prefs.ts).
 */
import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import { prefGet, prefSet } from '../../data/prefs';

export interface SettingsCategory {
  id: string;
  label: string;
  icon: LucideIcon;
  /** A `--tile-*` token name without the prefix: 'indigo', 'gray', … */
  tile: string;
  render: () => React.ReactNode;
}
export interface SettingsGroup { name: string; categories: SettingsCategory[] }

export function SettingsShell({ scopeKey, groups, header }: {
  /** Which settings screen this is — the last-used category is kept per screen. */
  scopeKey: string;
  groups: SettingsGroup[];
  header?: React.ReactNode;
}) {
  const [params, setParams] = useSearchParams();
  const all = groups.flatMap(g => g.categories);
  const wide = useWide();
  const asked = params.get('cat');
  const last = prefGet(`settings_last_${scopeKey}`);
  // Phone: no category in the address = the list. Wide screen: always a page open.
  const openId = asked && all.some(c => c.id === asked) ? asked
    : wide ? (all.find(c => c.id === last)?.id ?? all[0]?.id) : null;
  const open = all.find(c => c.id === openId) ?? null;

  const pick = (id: string, e?: React.MouseEvent) => {
    if (e && (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1)) return;   // a new tab: let the link do it
    e?.preventDefault();
    prefSet(`settings_last_${scopeKey}`, id);
    const next = new URLSearchParams(params); next.set('cat', id);
    setParams(next);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="p-3 md:p-6 w-full">
      {header}
      <div className="tz-settings" {...(open ? { 'data-open': open.id } : {})}>
        <nav className="tz-set" aria-label="Settings">
          {groups.map(g => (
            <section key={g.name} className="tz-set-group">
              <h2 className="tz-set-head">{g.name}</h2>
              <ul className="tz-set-box">
                {g.categories.map(c => {
                  const Icon = c.icon;
                  return (
                    <li key={c.id}>
                      <a className="tz-set-row" href={`?cat=${c.id}`} onClick={e => pick(c.id, e)}
                        {...(open?.id === c.id && wide ? { 'aria-current': 'page' as const } : {})}>
                        <span className="tz-set-tile" style={{ background: `var(--tile-${c.tile})` }} aria-hidden="true"><Icon strokeWidth={2} /></span>
                        <span className="tz-set-text"><span className="tz-set-label">{c.label}</span><ChevronRight className="tz-set-chev" /></span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </nav>
        <section className="tz-set-page">
          {open && (
            <>
              <div className="tz-set-page-head">
                <button className="tz-set-back" onClick={() => window.history.length > 1 ? window.history.back() : setParams(new URLSearchParams())}>
                  <ChevronLeft /> Settings
                </button>
                <h2 className="tz-set-title">{open.label}</h2>
              </div>
              <div className="tz-set-page-body">{open.render()}</div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

/** One row of a category's page: its name (and any wording it already had) at the start, the control at the end. */
export function SettingRow({ label, hint, children, htmlFor }: { label: React.ReactNode; hint?: React.ReactNode; children?: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="tz-set-item">
      <div className="min-w-0">
        {htmlFor ? <label className="tz-set-item-label" htmlFor={htmlFor}>{label}</label> : <span className="tz-set-item-label">{label}</span>}
        {hint && <div className="tz-set-item-hint">{hint}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 min-w-0">{children}</div>}
    </div>
  );
}

/** A box of setting rows on a category's page, with an optional name above. */
export function SettingBox({ name, children, foot }: { name?: string; children: React.ReactNode; foot?: React.ReactNode }) {
  return (
    <section className="tz-set-group">
      {name && <h3 className="tz-set-head">{name}</h3>}
      <div className="tz-set-pane">{children}</div>
      {foot && <p className="tz-set-foot">{foot}</p>}
    </section>
  );
}

function useWide(): boolean {
  const q = '(min-width: 1024px)';
  const [wide, setWide] = React.useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  React.useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}
