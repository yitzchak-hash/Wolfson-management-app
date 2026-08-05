import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Trash2, Upload, Check, Plus } from 'lucide-react';
import { useStore } from '../../data/store';
import { CanvasElement, Stage, binLabelOf, isBuiltInBin } from '../../types';
import { WIDGET_BY_ID } from '../../data/widgets';
import { WidgetField, WIDGET_FIELDS, ART_FIELDS, TEXT_STYLE_FIELDS } from '../../data/widgetFields';
import { ART_KINDS, ArtKind } from './BoardNodes';
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

  const def = el.widget ? WIDGET_BY_ID.get(el.widget) : undefined;

  const fields: WidgetField[] = useMemo(() => {
    if (el.type === 'widget' && el.widget) return WIDGET_FIELDS[el.widget] ?? [];
    if (el.type === 'clipart') return ART_FIELDS;
    if (el.type === 'note' || el.type === 'box') {
      return [
        { key: 'text', label: el.type === 'box' ? 'Section name' : 'Note', kind: 'longtext', scope: 'element' },
        ...TEXT_STYLE_FIELDS,
      ];
    }
    if (el.type === 'title') {
      return [{ key: 'text', label: 'Heading', kind: 'text', scope: 'element' }, ...TEXT_STYLE_FIELDS];
    }
    if (el.type === 'voice') {
      return [{ key: 'text', label: 'Label', kind: 'text', scope: 'element' }];
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

  const data = (el.data ?? {}) as Record<string, unknown>;

  function setData(key: string, value: unknown) {
    updateCanvasElement(el.id, { data: { ...data, [key]: value } });
  }
  function setEl(key: string, value: unknown) {
    updateCanvasElement(el.id, { [key]: value } as Partial<CanvasElement>);
  }

  const readField = (f: WidgetField) =>
    f.scope === 'element' ? (el as unknown as Record<string, unknown>)[f.key] : data[f.key];
  const writeField = (f: WidgetField, v: unknown) =>
    f.scope === 'element' ? setEl(f.key, v) : setData(f.key, v);

  return (
    <>
      <div className="fixed inset-0 z-[95]" onClick={onClose} />
      <div
        className="fixed z-[96] bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden"
        style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(400px, 94vw)', maxHeight: '82vh' }}
        onPointerDown={e => e.stopPropagation()}
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

          {fields.map(f => (
            <Field
              key={`${f.scope ?? 'data'}.${f.key}`}
              field={f}
              value={readField(f)}
              onChange={v => writeField(f, v)}
              stages={stages}
              jobs={jobs}
              contractors={contractors.filter(c => c.active)}
            />
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
      </div>
    </>
  );

  function BinSettings({ el, stages }: { el: CanvasElement; stages: Stage[] }) {
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
}

// ── pieces ───────────────────────────────────────────────────────────────────

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10.5px] font-bold text-gray-500 mb-1">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-gray-400 mt-1 leading-snug">{hint}</p>}
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

function Swatches({ value, onPick }: { value?: string; onPick: (c: string) => void }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
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

function Field({ field, value, onChange, stages, jobs, contractors }: {
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
    return <Row label={f.label} hint={f.hint}><Swatches value={str} onPick={onChange} /></Row>;
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

  if (f.kind === 'percent') {
    const n = Number(str) || 0;
    return (
      <Row label={f.label} hint={f.hint}>
        <div className="flex items-center gap-2">
          <input type="range" min={0} max={100} value={n}
            onChange={e => onChange(Number(e.target.value))}
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
        <input type="datetime-local" value={str.slice(0, 16)}
          onChange={e => onChange(e.target.value ? new Date(e.target.value).toISOString() : undefined)}
          className={box} />
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
