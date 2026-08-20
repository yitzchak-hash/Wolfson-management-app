import { MovablePanel } from './MovablePanel';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Trash2, Upload, Check, Plus, ChevronUp, ChevronDown } from 'lucide-react';
import { useStore } from '../../data/store';
import { CanvasElement, Stage, binLabelOf, isBuiltInBin, personColor } from '../../types';
import { WIDGET_BY_ID } from '../../data/widgets';
import { WidgetField, WIDGET_FIELDS, ART_FIELDS, BOX_FIELDS, TEXT_STYLE_FIELDS, OUTLINE_FIELDS, fieldDefault } from '../../data/widgetFields';
import { ART_KINDS, ArtKind } from './BoardNodes';
import {
  PlannerData, takeOffPlanner, putBackOnPlanner, slotsFrom, personOf, iso as plannerIso,
} from './PlannerWidget';
import { PlannerOffDialog, OffScope } from './PlannerDialogs';
import { ANCHORS, anchorOf } from './AttachLayer';

/**
 * The panel behind the pencil.
 *
 * Every node on the board carried a pencil button, and on a widget it called
 * the plain text editor — which no widget renders — so the button did nothing
 * at all. On 47 widgets. This is what it opens now: a form built from the
 * field descriptions in `widgetFields.ts`, so a widget's settings are declared
 * once next to the widget rather than hand-written as 47 separate dialogs.
 *
 * It also covers the node types that are not widgets, because they had the same
 * gap in different ways: a bin's pencil did nothing, and a note had no way to
 * change its type size at all.
 */

const SWATCHES = [
  '#ffffff', '#fef9c3', '#dcfce7', '#dbeafe', '#f3e8ff', '#ffe4e6', '#ffedd5', '#ccfbf1',
  '#1e3a5f', '#0f172a', '#dc2626', '#ea6b13', '#16a34a', '#0d9488', '#7c3aed', '#b8860b',
];

export function NodeSettings({ el, onClose, onDelete }: {
  el: CanvasElement;
  onClose: () => void;
  onDelete?: (id: string) => void;
}) {
  const {
    apartments, contractors, stages: allStages, currentProjectId, currentUser,
    updateCanvasElement, addStage,
  } = useStore();

  const stages = useMemo(
    () => allStages.filter(st => st.active && st.projectId === currentProjectId).sort((a, b) => a.order - b.order),
    [allStages, currentProjectId],
  );
  const jobs = useMemo(
    () => apartments.filter(a => a.buildingId === 'G' && !a.isUnnamed),
    [apartments],
  );

  // Escape closes it, like every other panel in the app. Without this the only
  // ways out were the × and clicking the backdrop, and a full-screen backdrop
  // you have not noticed swallows every other click on the board.
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      const t = e.target as HTMLElement | null;
      // Let a field have the first Escape, so backing out of a typo does not
      // shut the whole panel.
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) { t.blur(); return; }
      onClose();
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  const def = el.widget ? WIDGET_BY_ID.get(el.widget) : undefined;

  const fields: WidgetField[] = useMemo(() => {
    if (el.type === 'widget' && el.widget) return WIDGET_FIELDS[el.widget] ?? [];
    if (el.type === 'clipart') return ART_FIELDS;
    if (el.type === 'box') return BOX_FIELDS;
    if (el.type === 'note') {
      return [
        { key: 'text', label: 'Note', kind: 'longtext', scope: 'element' },
        ...TEXT_STYLE_FIELDS,
        ...OUTLINE_FIELDS,
      ];
    }
    if (el.type === 'title') {
      return [
        { key: 'text', label: 'Heading', kind: 'text', scope: 'element' },
        ...TEXT_STYLE_FIELDS,
        ...OUTLINE_FIELDS,
      ];
    }
    if (el.type === 'voice') {
      return [{ key: 'text', label: 'Label', kind: 'text', scope: 'element' }, ...OUTLINE_FIELDS];
    }
    // A countdown placed straight onto the board said "Set a time" and offered
    // no way to set one.
    if (el.type === 'countdown') {
      return [
        { key: 'text', label: 'Label', kind: 'text', scope: 'element', placeholder: 'Countdown' },
        { key: 'targetAt', label: 'Counting down to', kind: 'datetime', scope: 'element' },
      ];
    }
    if (el.type === 'stopwatch') {
      return [{ key: 'text', label: 'Label', kind: 'text', scope: 'element', placeholder: 'Stopwatch' }];
    }
    return [];
  }, [el.type, el.widget]);

  const heading = el.type === 'bin' ? binLabelOf(el)
    : def?.name
    ?? (el.type === 'clipart' ? 'Clip art'
      : el.type === 'box' ? 'Section box'
      : el.type === 'note' ? 'Sticky note'
      : el.type === 'title' ? 'Heading'
      : 'Node');

  /**
   * The sections, in the order they were declared.
   *
   * Only one is open at a time: the panel is 400px wide and 82vh tall, and two
   * open sections put the second one below the fold, where it reads as absent.
   */
  const groupNames = useMemo(() => {
    const seen: string[] = [];
    for (const f of fields) if (f.group && !seen.includes(f.group)) seen.push(f.group);
    return seen;
  }, [fields]);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const data = (el.data ?? {}) as Record<string, unknown>;

  function setData(key: string, value: unknown) {
    updateCanvasElement(el.id, { data: { ...data, [key]: value } });
  }
  function setEl(key: string, value: unknown) {
    updateCanvasElement(el.id, { [key]: value } as Partial<CanvasElement>);
  }

  /**
   * Show the value in USE, not the absence of an override.
   *
   * An unset field rendered as a blank box, so the panel said "empty" where the
   * board was plainly drawing a heading at some size in some weight. The
   * default is what the render path itself falls back to, so what the panel
   * shows and what the board draws are the same number.
   *
   * Nothing is written by looking: the default is only displayed, and the
   * record stays clean until somebody actually changes something.
   */
  const widgetDef = el.widget ? WIDGET_BY_ID.get(el.widget) : undefined;
  const readField = (f: WidgetField) => {
    const set = f.scope === 'element'
      ? (el as unknown as Record<string, unknown>)[f.key]
      : data[f.key];
    if (set !== undefined && set !== null && set !== '') return set;
    return fieldDefault(el, f, widgetDef?.name, widgetDef?.data as Record<string, unknown> | undefined)
      ?? set;
  };
  const writeField = (f: WidgetField, v: unknown) =>
    f.scope === 'element' ? setEl(f.key, v) : setData(f.key, v);

  return (
    <>
      <div className="fixed inset-0 z-[95]" onClick={onClose} />
      {/* Movable, like every other board panel — you are editing a node and the
          panel is very often sitting on top of the node you are editing. */}
      <MovablePanel
        id="node-settings"
        title={heading}
        className="fixed z-[96] bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden"
        style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(400px, 94vw)', maxHeight: '82vh' }}
        onClose={onClose}
      >
        <div className="flex items-center gap-2 px-4 py-2.5 flex-shrink-0"
          style={{ backgroundColor: '#1e3a5f', color: '#fff' }}>
          <span className="font-bold text-[13px] truncate">{heading}</span>
          <span className="flex-1" />
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/15"><X size={15} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {el.type === 'bin' && <BinSettings el={el} stages={stages} />}

          {el.type === 'clipart' && (
            <Row label="Which piece">
              <div className="grid grid-cols-4 gap-1.5">
                {ART_KINDS.map(k => (
                  <button key={k} onClick={() => setEl('art', k as ArtKind)}
                    className="py-1.5 rounded-lg text-[10.5px] font-semibold border capitalize transition-colors"
                    style={(el.art ?? 'pin') === k
                      ? { backgroundColor: '#1e3a5f', color: '#fff', borderColor: '#1e3a5f' }
                      : { backgroundColor: '#fff', color: '#475569', borderColor: '#e2e8f0' }}>
                    {k.replace('-', ' ')}
                  </button>
                ))}
              </div>
            </Row>
          )}

          {/*
            Ungrouped settings stay in plain sight; the rest fold away.

            A widget with three settings should not have to be opened. The
            planner has nineteen, and a flat list of nineteen is a wall you
            have to read all of to find the one line you came for.
          */}
          {fields.filter(f => !f.group).map(f => (
            <Field
              key={`${f.scope ?? 'data'}.${f.key}`}
              el={el}
              field={f}
              value={readField(f)}
              onChange={v => writeField(f, v)}
              stages={stages}
              jobs={jobs}
              contractors={contractors.filter(c => c.active)}
            />
          ))}

          {groupNames.map(name => (
            <FieldGroup key={name} name={name}
              open={openGroup === name}
              onToggle={() => setOpenGroup(g => (g === name ? null : name))}
              count={fields.filter(f => f.group === name).length}>
              {fields.filter(f => f.group === name).map(f => (
                <Field
                  key={`${f.scope ?? 'data'}.${f.key}`}
                  el={el}
                  field={f}
                  value={readField(f)}
                  onChange={v => writeField(f, v)}
                  stages={stages}
                  jobs={jobs}
                  contractors={contractors.filter(c => c.active)}
                />
              ))}
            </FieldGroup>
          ))}

          {/* Colour is on every node, and until now it wrote a value that
              widgets never read. */}
          {el.type !== 'bin' && (
            <Row label="Colour" hint={el.type === 'widget' ? 'The card behind the widget.' : undefined}>
              <Swatches value={el.color} onPick={c => setEl('color', c)} />
            </Row>
          )}

          {/* Attached art has no size of its own — it has a share of whatever it
              is stuck to, which is what makes it resize when the tile does. */}
          {el.attachedTo ? (
            <Row label="Size on the tile"
              hint="A share of the tile's width, so it stays right when the tile is resized.">
              <div className="flex items-center gap-2">
                <input
                  type="range" min={6} max={60}
                  value={Math.round((el.attachScale ?? 0.26) * 100)}
                  onChange={e => setEl('attachScale', Number(e.target.value) / 100)}
                  className="flex-1 accent-[#1e3a5f]"
                />
                <span className="text-[12px] font-bold tabular-nums w-9 text-right">
                  {Math.round((el.attachScale ?? 0.26) * 100)}%
                </span>
              </div>
            </Row>
          ) : (
            <Row label="Size">
              <div className="flex items-center gap-2">
                <NumBox label="W" value={Math.round(el.w)} min={24}
                  onChange={v => setEl('w', v)} />
                <NumBox label="H" value={Math.round(el.h)} min={24}
                  onChange={v => setEl('h', v)} />
                {el.type === 'clipart' && (
                  <button
                    onClick={() => updateCanvasElement(el.id, { w: 64, h: 64 })}
                    className="text-[10.5px] font-semibold text-gray-500 hover:text-[#1e3a5f] px-2 py-1 rounded-lg border border-gray-200">
                    Reset
                  </button>
                )}
              </div>
            </Row>
          )}

          {el.attachedTo && (
            <Row label="Which corner">
              <div className="grid grid-cols-5 gap-1">
                {ANCHORS.map(a => (
                  <button key={a.id} onClick={() => setEl('attachAnchor', a.id)} title={a.label}
                    className="py-1.5 rounded-lg text-[9.5px] font-semibold border transition-colors"
                    style={anchorOf(el) === a.id
                      ? { backgroundColor: '#1e3a5f', color: '#fff', borderColor: '#1e3a5f' }
                      : { backgroundColor: '#fff', color: '#475569', borderColor: '#e2e8f0' }}>
                    {a.label.replace('Top ', 'T ').replace('Bottom ', 'B ')}
                  </button>
                ))}
              </div>
            </Row>
          )}

          <Row label="Wallboard">
            <button
              onClick={() => setEl('showOnTv', el.showOnTv === false ? undefined : false)}
              className="px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold border transition-colors"
              style={el.showOnTv === false
                ? { backgroundColor: '#fee2e2', color: '#b91c1c', borderColor: '#fecaca' }
                : { backgroundColor: '#dcfce7', color: '#15803d', borderColor: '#bbf7d0' }}>
              {el.showOnTv === false ? 'Hidden from the TV' : 'Showing on the TV'}
            </button>
          </Row>
        </div>

        {onDelete && !(el.type === 'bin' && isBuiltInBin(el)) && (
          <div className="px-4 py-2.5 border-t border-gray-100 flex-shrink-0">
            <button
              onClick={() => { onDelete(el.id); onClose(); }}
              className="flex items-center gap-1.5 text-[11.5px] font-semibold text-gray-400 hover:text-red-600">
              <Trash2 size={12} /> Remove this from the board
            </button>
          </div>
        )}
      </MovablePanel>
    </>
  );

}

/**
 * A group's own settings — name, colour, and the stage it can stand for.
 *
 * MODULE level, deliberately. It was declared inside NodeSettings' render
 * body, which makes it a NEW COMPONENT TYPE on every render — so the moment
 * any store echo re-rendered the panel (the cloud bounce of the very edit
 * being typed, about a second in), React unmounted and remounted it, resetting
 * the name field to the stored value and dropping focus. That is the owner's
 * "it doesn't let me type, it disappears after a second", and it is the same
 * declared-in-render trap CLAUDE.md already documents for the plan pane.
 */
function BinSettings({ el, stages }: { el: CanvasElement; stages: Stage[] }) {
  const { updateCanvasElement, addStage, currentUser, currentProjectId } = useStore();
  const [name, setName] = useState(binLabelOf(el));
  const [makeStage, setMakeStage] = useState(false);
  useEffect(() => setName(binLabelOf(el)), [el.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * A bin can mean a stage, and it does not have to.
   *
   * When it is linked, dropping a job into it moves the job to that stage as
   * well as filing it — which is what "Ready to start" actually means to the
   * office. Left unlinked it is pure filing, which is what Archive and Trash
   * want. The two systems stay independent everywhere else.
   */
  function linkStage(id: string) {
    updateCanvasElement(el.id, { stageId: id || undefined });
  }

  function createStageFromName() {
    const clean = name.trim();
    if (!clean || !currentUser) return;
    const id = 'ST-' + Math.random().toString(36).slice(2, 9);
    addStage({
      id,
      name: clean,
      nameHe: '',
      color: el.color || '#1e3a5f',
      order: stages.length + 1,
      active: true,
      description: `Created from the “${clean}” group on the board.`,
      projectId: currentProjectId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Stage);
    updateCanvasElement(el.id, { stageId: id });
    setMakeStage(false);
  }

  return (
    <>
      <Row label="Name">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={() => updateCanvasElement(el.id, { text: name.trim() })}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          placeholder="Group name"
          className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[12.5px] outline-none focus:ring-2 focus:ring-[#1e3a5f]/25"
        />
      </Row>

      <Row label="Colour">
        <Swatches value={el.color} onPick={c => updateCanvasElement(el.id, { color: c })} />
      </Row>

      <Row
        label="Moving a job here also sets its stage"
        hint="Leave this off and the group is filing only — a job keeps whatever stage it was at.">
        <select
          value={el.stageId ?? ''}
          onChange={e => linkStage(e.target.value)}
          className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[12.5px] outline-none bg-white">
          <option value="">Do not change the stage</option>
          {stages.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
        </select>

        {!stages.some(st => st.name.toLowerCase() === name.trim().toLowerCase()) && name.trim() && (
          makeStage ? (
            <div className="mt-2 flex items-center gap-1.5">
              <button onClick={createStageFromName}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-white"
                style={{ backgroundColor: '#1e3a5f' }}>
                <Check size={11} /> Make “{name.trim()}” a stage
              </button>
              <button onClick={() => setMakeStage(false)}
                className="text-[11px] text-gray-400 hover:text-gray-600">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setMakeStage(true)}
              className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-[#4aa8d8] hover:underline">
              <Plus size={11} /> Make this a stage in this workspace
            </button>
          )
        )}
      </Row>
    </>
  );
}

// ── pieces ───────────────────────────────────────────────────────────────────

/** One collapsible block of settings. */
function FieldGroup({ name, count, open, onToggle, children }: {
  name: string; count: number; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-100 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-[12px] font-bold text-gray-700 flex-1">{name}</span>
        <span className="text-[10px] text-gray-400 tabular-nums">{count}</span>
        <ChevronDown size={14} className="text-gray-400 transition-transform flex-shrink-0"
          style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && <div className="px-3 pb-3 pt-0.5 space-y-3.5">{children}</div>}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  /**
   * The hint is a TOOLTIP, not a paragraph.
   *
   * Every field used to print its explanation under itself, which turned a
   * settings panel into a wall of grey text you read past to reach the
   * controls. The label keeps a small ⓘ; hovering (or holding, on touch)
   * shows the words. The explanation still exists — it just waits to be
   * asked.
   */
  return (
    <div>
      <label className="flex items-center gap-1 text-[10.5px] font-bold text-gray-500 mb-1">
        {label}
        {hint && (
          <span title={hint} aria-label={hint}
            className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full
                       bg-gray-100 text-gray-400 text-[9px] font-black cursor-help select-none">
            i
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

function NumBox({ label, value, min, max, onChange }: {
  label: string; value: number; min?: number; max?: number; onChange: (v: number) => void;
}) {
  return (
    <span className="flex items-center gap-1">
      <span className="text-[10px] font-bold text-gray-400">{label}</span>
      <input
        type="number" value={value} min={min} max={max}
        onChange={e => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.max(min ?? -Infinity, Math.min(max ?? Infinity, n)));
        }}
        className="w-[68px] px-2 py-1.5 rounded-lg border border-gray-200 text-[12px] outline-none focus:ring-2 focus:ring-[#1e3a5f]/25"
      />
    </span>
  );
}

function Swatches({ value, onPick, clearable }: {
  value?: string; onPick: (c: string | undefined) => void; clearable?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* "None" has to be reachable. An outline you can set and never unset is
          a trap, and there is nowhere else in this panel to clear a colour. */}
      {clearable && (
        <button onClick={() => onPick(undefined)} title="No outline"
          className="w-[22px] h-[22px] rounded-lg border-2 flex items-center justify-center"
          style={{
            backgroundColor: '#fff',
            borderColor: !value ? '#1e3a5f' : 'rgba(15,23,42,.12)',
            transform: !value ? 'scale(1.14)' : undefined,
          }}>
          <span className="block w-3.5 h-px bg-red-400 rotate-45" />
        </button>
      )}
      {SWATCHES.map(c => (
        <button key={c} onClick={() => onPick(c)} title={c}
          className="w-[22px] h-[22px] rounded-lg border-2 transition-transform"
          style={{
            backgroundColor: c,
            borderColor: value === c ? '#1e3a5f' : 'rgba(15,23,42,.12)',
            transform: value === c ? 'scale(1.14)' : undefined,
          }} />
      ))}
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(value ?? '') ? value : '#ffffff'}
        onChange={e => onPick(e.target.value)}
        title="Any colour"
        className="w-[26px] h-[26px] rounded-lg cursor-pointer bg-transparent border border-gray-200" />
    </div>
  );
}

/**
 * Main or Projection, for a planner.
 *
 * Its own control rather than a plain select, because choosing Main is not a
 * field write on one node: exactly ONE planner in the workspace is the main
 * one, so the crown moving means every other copy becomes a projection. That is
 * worth a sentence of warning before it happens — somebody else's screen is
 * about to change.
 */
function PlannerRoleField({ el, label, hint }: {
  el: CanvasElement; label: string; hint?: string;
}) {
  const canvasElements = useStore(s => s.canvasElements);
  const updateCanvasElement = useStore(s => s.updateCanvasElement);
  const role = ((el.data ?? {}) as Record<string, unknown>).role === 'projection' ? 'projection' : 'main';
  const siblings = canvasElements.filter(e =>
    e.id !== el.id && e.type === 'widget' && e.widget === el.widget);
  const others = siblings.length;
  const currentMain = siblings.find(e =>
    ((e.data ?? {}) as Record<string, unknown>).role !== 'projection');

  function pick(next: 'main' | 'projection') {
    if (next === role) return;
    if (next === 'main') {
      if (currentMain && !window.confirm(
        'Make this the main notebook?\n\n'
        + 'The one that is main now, and every other copy, becomes a projection — '
        + 'read-only, showing whatever is written in this one.')) return;
      // Demote everybody else FIRST, then crown this one: two planners both
      // claiming to be main, even for a moment, is a projection with nothing to
      // point at.
      siblings.forEach(e => {
        if (((e.data ?? {}) as Record<string, unknown>).role === 'projection') return;
        updateCanvasElement(e.id, { data: { ...(e.data ?? {}), role: 'projection' } });
      });
      updateCanvasElement(el.id, { data: { ...(el.data ?? {}), role: 'main' } });
      return;
    }
    if (!currentMain && !window.confirm(
      'Make this a projection?\n\n'
      + 'There would then be no main notebook, and nothing to show. '
      + 'Set another one to main first if you can.')) return;
    updateCanvasElement(el.id, { data: { ...(el.data ?? {}), role: 'projection' } });
  }

  return (
    <Row label={label} hint={hint}>
      <div className="flex rounded-lg overflow-hidden border border-gray-200">
        {(['main', 'projection'] as const).map(v => (
          <button key={v} type="button" onClick={() => pick(v)}
            className="flex-1 px-2 py-1.5 text-[12px] font-semibold transition-colors"
            style={role === v
              ? { backgroundColor: '#1e3a5f', color: '#fff' }
              : { backgroundColor: '#fff', color: '#64748b' }}>
            {v === 'main' ? 'The main one' : 'A projection'}
          </button>
        ))}
      </div>
      <p className="text-[10.5px] text-gray-400 mt-1">
        {others === 0
          ? 'The only notebook in this workspace.'
          : role === 'main'
            ? `${others} other cop${others === 1 ? 'y' : 'ies'} show this one.`
            : currentMain
              ? 'Showing the main notebook. Nothing here can be edited.'
              : 'There is no main notebook to show yet.'}
      </p>
    </Row>
  );
}

/** Which workspace a widget is about. */
function ProjectField({ label, hint, value, onChange }: {
  label: string; hint?: string; value: string; onChange: (v: string) => void;
}) {
  const projects = useStore(st => st.projects);
  const current = useStore(st => st.currentProjectId);
  return (
    <Row label={label} hint={hint}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[12.5px] bg-white outline-none"
      >
        <option value="">The one you are in ({projects.find(p => p.id === current)?.name ?? current})</option>
        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </Row>
  );
}

/**
 * Which jobs a widget is about.
 *
 * Search, then tick. Not a plain multi-select box: a workspace has hundreds of
 * jobs and picking three of them out of a scrolling list is miserable, whereas
 * typing two letters of a family name is how anybody in the office already
 * thinks about finding one. "All of them" stays the default and is one button
 * away, because that is what most of these widgets should show.
 */
function JobsField({ label, hint, value, onChange, jobs }: {
  label: string; hint?: string; value: string[];
  onChange: (v: string[] | undefined) => void;
  jobs: { id: string; displayName?: string }[];
}) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? jobs.filter(j => (j.displayName ?? '').toLowerCase().includes(needle)).slice(0, 40)
    : jobs.slice(0, 40);

  const toggle = (id: string) => onChange(
    value.includes(id) ? value.filter(x => x !== id) : [...value, id],
  );

  return (
    <Row label={label} hint={hint}>
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search jobs…"
            className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-gray-200 text-[12.5px] outline-none
                       focus:ring-2 focus:ring-[#1e3a5f]/25"
          />
          <button
            onClick={() => onChange(value.length ? [] : jobs.map(j => j.id))}
            className="px-2 py-1.5 rounded-lg text-[11.5px] font-semibold border border-gray-200
                       text-gray-600 hover:border-[#1e3a5f] hover:text-[#1e3a5f] whitespace-nowrap"
          >
            {value.length ? 'All jobs' : 'Pick all'}
          </button>
        </div>

        <p className="text-[10.5px] text-gray-400">
          {value.length ? `${value.length} chosen` : 'Every job in this workspace'}
        </p>

        <div className="max-h-[168px] overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
          {shown.length === 0 && (
            <p className="px-2 py-2 text-[11px] text-gray-400">Nothing matches.</p>
          )}
          {shown.map(j => {
            const on = value.includes(j.id);
            return (
              <button
                key={j.id}
                onClick={() => toggle(j.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-slate-50"
              >
                <span
                  className="w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: on ? '#1e3a5f' : '#fff',
                    border: on ? 'none' : '1px solid #cbd5e1',
                  }}
                >
                  {on && <Check size={9} color="#fff" />}
                </span>
                <span className="flex-1 min-w-0 truncate text-[12px] text-gray-700">
                  {j.displayName || 'Job'}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Row>
  );
}

/**
 * Who is on the rota.
 *
 * Contractors and office staff in one list, because the paper sheet mixes them
 * and the office does not think of them as two kinds of person. Order matters —
 * the rows come out in the order chosen here — so picking somebody appends them
 * and there are arrows to move a row up or down.
 */
function PeopleField({ el, label, hint, value, onChange }: {
  el: CanvasElement;
  label: string; hint?: string; value: string[]; onChange: (v: string[]) => void;
}) {
  const contractors = useStore(st => st.contractors);
  const users = useStore(st => st.users);
  const apartments = useStore(st => st.apartments);
  const currentUser = useStore(st => st.currentUser);
  const updateApartment = useStore(st => st.updateApartment);
  const updateCanvasElement = useStore(st => st.updateCanvasElement);
  const addCanvasElement = useStore(st => st.addCanvasElement);
  const canvasElements = useStore(st => st.canvasElements);

  /** Who is being taken off, waiting on the from-when answer. */
  const [offering, setOffering] = useState<{ id: string; name: string } | null>(null);

  const data = (el.data ?? {}) as PlannerData;

  /**
   * Take them off, and put their jobs somewhere you can see them.
   *
   * The jobs are NOT filed into a group: filing takes a job out of every count
   * in the app, which is a much bigger thing than coming off a rota and would
   * quietly change the unit totals. They are gathered into a labelled section
   * box on the board instead — still on the board, still counted, and obvious.
   */
  function takeOff(personId: string, scope: OffScope, date?: string) {
    const from = scope === 'all' ? '0000-01-01'
      : scope === 'date' ? (date ?? plannerIso(new Date()))
      : plannerIso(new Date());

    const { data: next, freed } = takeOffPlanner(data, personId, from);
    const name = personOf(personId, contractors, users).name;

    if (freed.length && currentUser) {
      // Below everything already placed, so a pile never lands on the board.
      let lowest = 0;
      for (const j of apartments) if (typeof j.canvasY === 'number') lowest = Math.max(lowest, j.canvasY + 132);
      for (const n of canvasElements) if (!n.board) lowest = Math.max(lowest, n.y + n.h);

      const perRow = Math.min(4, Math.max(1, freed.length));
      const boxW = perRow * (215 + 18) + 18;
      const rows = Math.ceil(freed.length / perRow);
      const top = lowest + 60;

      addCanvasElement({
        id: `CE-${Math.random().toString(36).slice(2, 9)}`,
        type: 'box',
        x: 40, y: top,
        w: boxW, h: rows * (132 + 18) + 54,
        text: `${name} — off the planner`,
        color: '#fef3c7',
        addedAt: new Date().toISOString(),
      });

      freed.forEach((jobId, i) => {
        updateApartment(jobId, {
          canvasX: 40 + 18 + (i % perRow) * (215 + 18),
          canvasY: top + 40 + Math.floor(i / perRow) * (132 + 18),
        }, currentUser);
      });
    }

    /**
     * The row list and the slots move in ONE write.
     *
     * `onChange` for this field spreads the `data` object captured by this
     * render, so calling it after a separate `updateCanvasElement` puts the
     * pre-take-off data straight back and the whole thing silently undoes
     * itself. Writing both at once is the only version that survives.
     *
     * They STAY in the list when they are coming off from a date: the dialog
     * promises the rest of that week stays visible and greyed, and the widget
     * draws that from `offFrom` — but only for somebody it is still being asked
     * to draw a row for. Only "everything, back to the start" takes the row
     * away, because then there is no week left to show.
     */
    const people = scope === 'all' ? value.filter(x => x !== personId) : value;
    updateCanvasElement(el.id, { data: { ...next, people } as Record<string, unknown> });
    setOffering(null);
  }

  /** Putting somebody back restores every slot they had. */
  function putBack(personId: string) {
    const restored = (data.offFrom?.[personId] || data.offKept?.[personId])
      ? putBackOnPlanner(data, personId)
      : data;
    const people = value.includes(personId) ? value : [...value, personId];
    updateCanvasElement(el.id, { data: { ...restored, people } as Record<string, unknown> });
  }

  const choices = [
    ...contractors.filter(c => c.active).map(c => ({
      id: `c:${c.id}`, name: c.name, color: personColor(c.name, c.color), kind: 'Contractor',
    })),
    ...users.filter(u => u.active).map(u => ({
      id: `u:${u.id}`, name: u.name, color: personColor(u.name, u.color), kind: 'Office',
    })),
  ];
  const unused = choices.filter(c => !value.includes(c.id));

  function move(i: number, by: number) {
    const j = i + by;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  return (
    <Row label={label} hint={hint}>
      <div className="space-y-1">
        {value.map((id, i) => {
          const c = choices.find(x => x.id === id);
          const name = c?.name ?? (id.startsWith('n:') ? id.slice(2) : 'Someone who has gone');
          const offOn = data.offFrom?.[id];
          return (
            <div key={id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg border"
              style={{ borderColor: offOn ? '#fcd9d5' : '#e5e7eb', backgroundColor: offOn ? '#fff8f7' : undefined }}>
              <span className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: c?.color ?? personColor(name), opacity: offOn ? 0.4 : 1 }} />
              <span className="flex-1 min-w-0">
                <span className="block truncate text-[12px]"
                  style={{ color: offOn ? '#94a3b8' : '#374151' }}>{name}</span>
                {offOn && (
                  <span className="block text-[10px] text-[#b4342a]">
                    coming off {new Date(`${offOn}T00:00:00`).toLocaleDateString(undefined,
                      { day: 'numeric', month: 'short' })} — the rest of that week stays greyed
                  </span>
                )}
              </span>
              {!offOn && (
                <>
                  <button onClick={() => move(i, -1)} disabled={i === 0} title="Up"
                    className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-30">
                    <ChevronUp size={13} />
                  </button>
                  <button onClick={() => move(i, 1)} disabled={i === value.length - 1} title="Down"
                    className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-30">
                    <ChevronDown size={13} />
                  </button>
                </>
              )}
              {offOn ? (
                <button onClick={() => putBack(id)} title="Put them back on"
                  className="px-1.5 py-0.5 rounded-md text-[10.5px] font-bold text-[#1e3a5f] border border-[#1e3a5f]/25 hover:bg-[#1e3a5f]/5">
                  Put back
                </button>
              ) : (
                <button
                  onClick={() => {
                    // Somebody with nothing in a slot just comes off; the dialog
                    // exists for the case where taking them off would move work.
                    if (slotsFrom(data, id, '0000-01-01') === 0) {
                      onChange(value.filter(x => x !== id));
                    } else {
                      setOffering({ id, name });
                    }
                  }}
                  title="Take off the planner"
                  className="p-0.5 text-gray-300 hover:text-red-500">
                  <X size={12} />
                </button>
              )}
            </div>
          );
        })}

        {unused.length > 0 && (
          <select
            value=""
            onChange={e => { if (e.target.value) putBack(e.target.value); }}
            className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[12.5px] bg-white outline-none"
          >
            <option value="">+ add somebody…</option>
            {unused.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.kind}
                {data.offKept?.[c.id] ? ' · was on here, days kept' : ''}
              </option>
            ))}
          </select>
        )}

        {choices.length === 0 && (
          <p className="text-[10.5px] text-amber-600">
            No contractors or staff yet — add them in app settings first.
          </p>
        )}

        {Object.keys(data.offKept ?? {}).length > 0 && (
          <p className="text-[10.5px] text-gray-400 leading-snug">
            Somebody taken off keeps their days. Adding them back puts every job
            in the slot it came from.
          </p>
        )}
      </div>

      {offering && (
        <PlannerOffDialog
          name={offering.name}
          jobCount={slotsFrom(data, offering.id, '0000-01-01')}
          onCancel={() => setOffering(null)}
          onDone={(scope, date) => takeOff(offering.id, scope, date)}
        />
      )}
    </Row>
  );
}

function Field({ el, field, value, onChange, stages, jobs, contractors }: {
  /** The node being edited. The people picker writes through to it, because
      taking somebody off the planner has to move that person's jobs. */
  el: CanvasElement;
  field: WidgetField;
  value: unknown;
  onChange: (v: unknown) => void;
  stages: Stage[];
  jobs: { id: string; displayName?: string }[];
  contractors: { id: string; name: string }[];
}) {
  const f = field;
  const str = value === undefined || value === null ? '' : String(value);
  const box = 'w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[12.5px] outline-none focus:ring-2 focus:ring-[#1e3a5f]/25';

  const [local, setLocal] = useState(str);
  useEffect(() => setLocal(str), [str]);

  if (f.kind === 'colour') {
    return (
      <Row label={f.label} hint={f.hint}>
        <Swatches value={str} onPick={onChange} clearable={f.key === 'outline'} />
      </Row>
    );
  }

  if (f.kind === 'select') {
    return (
      <Row label={f.label} hint={f.hint}>
        <select value={str} onChange={e => onChange(e.target.value)} className={`${box} bg-white`}>
          {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Row>
    );
  }

  if (f.kind === 'stage' || f.kind === 'job' || f.kind === 'contractor') {
    const rows = f.kind === 'stage' ? stages.map(s => ({ id: s.id, label: s.name }))
      : f.kind === 'job' ? jobs.map(j => ({ id: j.id, label: j.displayName || 'Job' }))
      : contractors.map(c => ({ id: c.id, label: c.name }));
    return (
      <Row label={f.label} hint={f.hint}>
        <select value={str} onChange={e => onChange(e.target.value || undefined)} className={`${box} bg-white`}>
          <option value="">{f.allowNone ?? '—'}</option>
          {rows.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        {rows.length === 0 && (
          <p className="text-[10px] text-amber-600 mt-1">
            Nothing to choose yet — add one in settings first.
          </p>
        )}
      </Row>
    );
  }

  if (f.kind === 'project') {
    return <ProjectField label={f.label} hint={f.hint} value={str} onChange={onChange} />;
  }

  if (f.kind === 'plannerRole') {
    return <PlannerRoleField el={el} label={f.label} hint={f.hint} />;
  }

  if (f.kind === 'jobs') {
    return <JobsField label={f.label} hint={f.hint}
      value={Array.isArray(value) ? value as string[] : []} onChange={onChange} jobs={jobs} />;
  }

  if (f.kind === 'people') {
    return <PeopleField el={el} label={f.label} hint={f.hint}
      value={Array.isArray(value) ? value as string[] : []} onChange={onChange} />;
  }

  if (f.kind === 'percent') {
    // boxOpacity is stored 0..1 because that is what CSS wants; the slider
    // speaks in whole percent because that is what a person wants.
    const asFraction = f.key === 'boxOpacity';
    const raw = str === '' ? (asFraction ? 0.45 : 0) : Number(str);
    const n = asFraction ? Math.round(raw * 100) : (raw || 0);
    return (
      <Row label={f.label} hint={f.hint}>
        <div className="flex items-center gap-2">
          <input type="range" min={0} max={100} value={n}
            onChange={e => onChange(asFraction ? Number(e.target.value) / 100 : Number(e.target.value))}
            className="flex-1 accent-[#1e3a5f]" />
          <span className="text-[12px] font-bold tabular-nums w-9 text-right">{n}%</span>
        </div>
      </Row>
    );
  }

  if (f.kind === 'number') {
    return (
      <Row label={f.label} hint={f.hint}>
        <input type="number" value={local} min={f.min} max={f.max}
          onChange={e => setLocal(e.target.value)}
          onBlur={() => onChange(local === '' ? undefined : Number(local))}
          className={box} />
      </Row>
    );
  }

  if (f.kind === 'datetime') {
    return (
      <Row label={f.label} hint={f.hint}>
        <div className="flex items-center gap-1.5">
          <input type="datetime-local" value={str.slice(0, 16)}
            onChange={e => onChange(e.target.value ? new Date(e.target.value).toISOString() : undefined)}
            className={`${box} flex-1`} />
          {/*
            An empty date field with no way to say "just use now" left the
            widget looking unanchored. The Default button answers with the
            obvious value; once a date is set it becomes a clear (back to the
            default), so the field is never a dead end in either direction.
          */}
          <button type="button"
            onClick={() => onChange(str ? undefined : new Date().toISOString())}
            className="text-[10.5px] font-bold px-2 py-1.5 rounded-lg border border-gray-200
                       text-gray-500 hover:text-[#1e3a5f] hover:border-[#4aa8d8] flex-shrink-0">
            {str ? 'Clear' : 'Default'}
          </button>
        </div>
      </Row>
    );
  }

  if (f.kind === 'image') return <ImageField field={f} value={str} onChange={onChange} />;

  if (f.kind === 'longtext') {
    return (
      <Row label={f.label} hint={f.hint}>
        <textarea rows={3} value={local} placeholder={f.placeholder}
          onChange={e => setLocal(e.target.value)}
          onBlur={() => onChange(local)}
          className={`${box} resize-none`} />
      </Row>
    );
  }

  return (
    <Row label={f.label} hint={f.hint}>
      <input value={local} placeholder={f.placeholder}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => onChange(local)}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className={box} />
    </Row>
  );
}

/**
 * A picture, by link or from the device.
 *
 * Uploads are read as a data URL and capped hard, because a board element goes
 * into Firestore and localStorage — a full-size phone photo pasted in here
 * would blow both. Anything bigger is downscaled before it is stored.
 */
function ImageField({ field, value, onChange }: {
  field: WidgetField; value: string; onChange: (v: unknown) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);

  async function pick(file: File) {
    setBusy(true);
    try {
      const url = await downscale(file, 900);
      onChange(url);
    } finally { setBusy(false); }
  }

  return (
    <Row label={field.label} hint={field.hint}>
      {value && (
        <div className="mb-2 rounded-lg overflow-hidden border border-gray-200" style={{ height: 92 }}>
          <img src={value} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <input
          value={local.startsWith('data:') ? '(uploaded picture)' : local}
          readOnly={local.startsWith('data:')}
          placeholder="https://…"
          onChange={e => setLocal(e.target.value)}
          onBlur={() => { if (!local.startsWith('data:')) onChange(local); }}
          className="flex-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-[12px] outline-none"
        />
        <button onClick={() => fileRef.current?.click()} disabled={busy}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-gray-200 text-[11px] font-semibold text-gray-600 hover:border-[#1e3a5f] disabled:opacity-50">
          <Upload size={11} /> {busy ? '…' : 'Upload'}
        </button>
        {value && (
          <button onClick={() => onChange('')} title="Remove"
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500"><X size={13} /></button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) void pick(f); e.currentTarget.value = ''; }} />
    </Row>
  );
}

function downscale(file: File, maxSide: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That does not look like a picture'));
      img.onload = () => {
        const k = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
