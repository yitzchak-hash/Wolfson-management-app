import React, { useEffect, useState } from 'react';
import { X, Pin, PinOff, AlignLeft, AlignCenter, AlignRight, Italic, Underline } from 'lucide-react';
import { CanvasElement } from '../../types';

const SIZES = [16, 22, 30, 40, 54, 72];
const WEIGHTS: { label: string; v: number }[] = [
  { label: 'Regular', v: 400 }, { label: 'Medium', v: 600 },
  { label: 'Bold', v: 800 }, { label: 'Heavy', v: 900 },
];
const COLORS = ['#0f172a', '#1e3a5f', '#ea6b13', '#dc2626', '#16a34a', '#7c3aed', '#0891b2', '#64748b'];

/**
 * The title editor.
 *
 * A title is the one node whose whole purpose is how it reads, so editing it in
 * a 12px inline textarea was the wrong shape for the job. This gives it the
 * type controls it actually needs and shows the result at real size while you
 * change it — what you are adjusting is right there, not a preview of it.
 *
 * Pinning is the one non-typographic control, and it belongs here because it
 * is the other thing that decides where a title reads from.
 */
export function TitleEditor({ el, onChange, onClose, onDelete }: {
  el: CanvasElement;
  onChange: (patch: Partial<CanvasElement>) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const [text, setText] = useState(el.text);
  useEffect(() => setText(el.text), [el.id]);

  const size = el.fontSize ?? 30;
  const weight = el.fontWeight ?? 800;
  const align = el.align ?? 'left';
  const colour = el.color || '#0f172a';

  const Seg = ({ on, onClick, title, children }: {
    on: boolean; onClick: () => void; title: string; children: React.ReactNode;
  }) => (
    <button onClick={onClick} title={title}
      className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors"
      style={on ? { backgroundColor: '#1e3a5f', color: '#fff' } : { color: '#64748b', backgroundColor: '#f1f5f9' }}>
      {children}
    </button>
  );

  return (
    <>
      <div className="fixed inset-0 bg-black/45 z-[70]" onClick={onClose} />
      <div
        className="fixed z-[80] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(640px, 94vw)' }}
      >
        <div className="flex items-center gap-3 px-4 py-3 bg-[#1e3a5f] text-white flex-shrink-0">
          <span className="font-bold text-sm">Title</span>
          <span className="flex-1" />
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10"><X size={17} /></button>
        </div>

        {/* At real size, on the board's own surface. */}
        <div className="px-5 py-6 border-b border-gray-100"
          style={{ background: 'repeating-linear-gradient(45deg,#fafafa 0 8px,#f4f4f5 8px 16px)' }}>
          <input
            autoFocus
            value={text}
            onChange={e => { setText(e.target.value); onChange({ text: e.target.value }); }}
            placeholder="Type the heading…"
            className="w-full bg-transparent outline-none leading-tight"
            style={{
              fontSize: size, fontWeight: weight, color: colour, textAlign: align,
              fontStyle: el.italic ? 'italic' : 'normal',
              textDecoration: el.underline ? 'underline' : 'none',
            }}
          />
        </div>

        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Size</div>
              <div className="flex gap-1">
                {SIZES.map(v => (
                  <Seg key={v} on={size === v} onClick={() => onChange({ fontSize: v })} title={`${v}px`}>
                    {v}
                  </Seg>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Weight</div>
              <div className="flex gap-1">
                {WEIGHTS.map(w => (
                  <Seg key={w.v} on={weight === w.v} onClick={() => onChange({ fontWeight: w.v })} title={w.label}>
                    {w.label}
                  </Seg>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Align</div>
              <div className="flex gap-1">
                {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([a, Icon]) => (
                  <Seg key={a} on={align === a} onClick={() => onChange({ align: a })} title={a}>
                    <Icon size={13} />
                  </Seg>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Style</div>
              <div className="flex gap-1">
                <Seg on={!!el.italic} onClick={() => onChange({ italic: !el.italic })} title="Italic">
                  <Italic size={13} />
                </Seg>
                <Seg on={!!el.underline} onClick={() => onChange({ underline: !el.underline })} title="Underline">
                  <Underline size={13} />
                </Seg>
              </div>
            </div>
            <div>
              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Colour</div>
              <div className="flex gap-1.5">
                {COLORS.map(c => (
                  <button key={c} onClick={() => onChange({ color: c })}
                    className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                    style={{ backgroundColor: c, borderColor: colour === c ? '#1e3a5f' : 'rgba(0,0,0,.12)' }} />
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 p-3">
            <button
              onClick={() => onChange({ pinned: !el.pinned })}
              className="flex items-center gap-2 text-[12px] font-bold"
              style={{ color: el.pinned ? '#1e3a5f' : '#64748b' }}
            >
              {el.pinned ? <Pin size={14} /> : <PinOff size={14} />}
              {el.pinned ? 'Pinned to the top of the screen' : 'Sits on the board like any other node'}
            </button>
            <p className="text-[11px] text-gray-500 mt-1.5 leading-snug">
              {el.pinned
                ? 'It keeps its place across the board so it pans and zooms sideways with the column it labels, but stays put as you scroll up and down. Unpin it to drag it anywhere.'
                : 'Drag it wherever you like. Pin it to keep it visible at the top while you scroll down the board.'}
            </p>
          </div>

          <div className="flex gap-2">
            <button onClick={onDelete}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50">
              Delete
            </button>
            <span className="flex-1" />
            <button onClick={onClose}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5a8e)' }}>
              Done
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
