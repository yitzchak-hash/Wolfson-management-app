import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Image as ImageIcon, RefreshCw, Circle, Square, Camera, Video } from 'lucide-react';
import { haptic } from '../../data/haptics';

/**
 * THE CAMERA INSIDE THE APP (owner, 2026-11-08: "is there a function where I can take a bunch of pictures using the
 * camera from inside the app … and then only press Done when I uploaded a few").
 *
 * The phone's own camera, opened from a file box, takes ONE picture and comes back. This is the camera running in the
 * page: the back camera fills the screen, the shutter takes as many pictures as he likes (a buzz and a flash each), a
 * video can be recorded, every shot waits in a strip at the bottom (× takes one back), and nothing goes anywhere until
 * Done. The gallery is one press away. Where a browser refuses the camera, the phone's own camera opens instead.
 */
export function InspectionCamera({ open, isRtl, onDone, onClose, onFallback }: {
  open: boolean; isRtl: boolean;
  onDone: (files: File[]) => void;
  onClose: () => void;
  /** The browser would not give the camera: open the phone's own camera / the gallery instead. */
  onFallback: (kind: 'camera' | 'gallery') => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const pickRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'photo' | 'video'>('photo');
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [shots, setShots] = useState<{ file: File; url: string }[]>([]);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [flash, setFlash] = useState(false);
  const [failed, setFailed] = useState(false);
  const [askDiscard, setAskDiscard] = useState(false);
  const W = isRtl
    ? { photo: 'תמונה', video: 'וידאו', done: 'סיום', gallery: 'גלריה', noCam: 'הדפדפן לא נתן גישה למצלמה.', useCam: 'פתיחת המצלמה של הטלפון', discard: (n: number) => `למחוק ${n} צילומים?`, keep: 'להמשיך לצלם', del: 'מחיקה' }
    : { photo: 'Photo', video: 'Video', done: 'Done', gallery: 'Gallery', noCam: 'The browser did not give the camera.', useCam: "Open the phone's camera", discard: (n: number) => `Throw away ${n} shot${n === 1 ? '' : 's'}?`, keep: 'Keep shooting', del: 'Throw away' };

  // The camera runs while the window is open; a switch of mode (video needs the microphone) or side restarts it.
  useEffect(() => {
    if (!open) return;
    let dead = false;
    setFailed(false);
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: mode === 'video' })
      .then(s => {
        if (dead) { s.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) { videoRef.current.srcObject = s; void videoRef.current.play().catch(() => {}); }
      })
      .catch(() => { if (!dead) setFailed(true); });
    if (!navigator.mediaDevices?.getUserMedia) setFailed(true);
    return () => { dead = true; streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; };
  }, [open, mode, facing]);

  // A fresh window starts empty.
  useEffect(() => { if (!open) { shots.forEach(s => URL.revokeObjectURL(s.url)); setShots([]); setRecording(false); setAskDiscard(false); setMode('photo'); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!recording) return;
    setRecSecs(0);
    const t = window.setInterval(() => setRecSecs(s => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [recording]);

  const add = (file: File) => setShots(prev => [...prev, { file, url: URL.createObjectURL(file) }]);
  const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  function takePhoto() {
    const v = videoRef.current; if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')?.drawImage(v, 0, 0);
    c.toBlob(b => { if (b) add(new File([b], `inspection-${stamp()}.jpg`, { type: 'image/jpeg' })); }, 'image/jpeg', 0.9);
    haptic('tap');
    setFlash(true); window.setTimeout(() => setFlash(false), 140);
  }

  function toggleRecord() {
    if (recording) { recRef.current?.stop(); haptic('tap'); return; }
    const s = streamRef.current; if (!s || typeof MediaRecorder === 'undefined') return;
    const type = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(t => MediaRecorder.isTypeSupported?.(t)) ?? '';
    const rec = new MediaRecorder(s, type ? { mimeType: type } : undefined);
    chunks.current = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
    rec.onstop = () => {
      const mime = rec.mimeType || 'video/webm';
      add(new File(chunks.current, `inspection-${stamp()}.${mime.includes('mp4') ? 'mp4' : 'webm'}`, { type: mime.split(';')[0] }));
      setRecording(false);
    };
    recRef.current = rec; rec.start(500); setRecording(true); haptic('tap');
  }

  function finish() {
    if (recording) return;
    const files = shots.map(s => s.file);
    haptic('success');
    onDone(files);
  }
  function close() {
    if (recording) { recRef.current?.stop(); return; }
    if (shots.length) { setAskDiscard(true); return; }
    onClose();
  }

  if (!open) return null;
  const mm = `${Math.floor(recSecs / 60)}:${String(recSecs % 60).padStart(2, '0')}`;
  return createPortal(
    <div data-inspect-camera className="fixed inset-0 z-[260] bg-black flex flex-col text-white select-none" dir="ltr">
      {/* the top: close, the shot count, flip */}
      <div className="flex items-center justify-between px-4" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))', paddingBottom: 8 }}>
        <button type="button" data-camera-close onClick={close} aria-label="Close" className="w-11 h-11 rounded-full bg-white/15 flex items-center justify-center"><X size={22} /></button>
        {recording
          ? <span className="px-3 py-1 rounded-full bg-red-600 text-[14px] font-bold tabular-nums">● {mm}</span>
          : <span className="text-[14px] font-semibold tabular-nums" data-camera-count>{shots.length ? `${shots.length}` : ''}</span>}
        <button type="button" data-camera-flip onClick={() => setFacing(f => (f === 'environment' ? 'user' : 'environment'))} disabled={recording}
          aria-label="Flip" className="w-11 h-11 rounded-full bg-white/15 flex items-center justify-center disabled:opacity-40"><RefreshCw size={20} /></button>
      </div>

      {/* the viewfinder */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <video ref={videoRef} data-camera-view playsInline muted autoPlay className="absolute inset-0 w-full h-full object-cover" />
        {flash && <div className="absolute inset-0 bg-white/70 pointer-events-none" />}
        {failed && (
          <div data-camera-failed className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center bg-black">
            <Camera size={34} className="text-white/60" />
            <div className="text-[15px] text-white/85">{W.noCam}</div>
            <button type="button" onClick={() => onFallback('camera')} className="px-5 py-3 rounded-xl bg-white text-[#1e3a5f] font-bold">{W.useCam}</button>
          </div>
        )}
      </div>

      {/* the strip of shots waiting */}
      {shots.length > 0 && (
        <div data-camera-strip className="flex gap-2 px-3 py-2 overflow-x-auto">
          {shots.map((s, i) => (
            <div key={s.url} className="relative flex-shrink-0">
              {s.file.type.startsWith('video/')
                ? <div className="w-14 h-14 rounded-lg bg-white/15 flex items-center justify-center"><Video size={20} /></div>
                : <img src={s.url} alt="" className="w-14 h-14 rounded-lg object-cover" />}
              <button type="button" data-camera-remove onClick={() => setShots(prev => { URL.revokeObjectURL(prev[i].url); return prev.filter((_, j) => j !== i); })}
                aria-label="Remove" className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-black/80 border border-white/50 flex items-center justify-center"><X size={12} /></button>
            </div>
          ))}
        </div>
      )}

      {/* the bottom: gallery · shutter · Done, and Photo | Video */}
      <div className="px-5 pt-2" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        <div className="flex justify-center gap-6 mb-3 text-[13px] font-bold tracking-wide">
          {(['photo', 'video'] as const).map(m => (
            <button key={m} type="button" data-camera-mode={m} disabled={recording} onClick={() => setMode(m)}
              className={mode === m ? 'text-yellow-300' : 'text-white/70'}>{m === 'photo' ? W.photo : W.video}</button>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <button type="button" data-camera-gallery disabled={recording} onClick={() => pickRef.current?.click()}
            className="w-14 h-14 rounded-xl bg-white/15 flex flex-col items-center justify-center text-[10px] font-semibold gap-0.5 disabled:opacity-40">
            <ImageIcon size={20} />{W.gallery}
          </button>
          <button type="button" data-camera-shutter disabled={failed} onClick={mode === 'photo' ? takePhoto : toggleRecord}
            aria-label={mode === 'photo' ? W.photo : W.video}
            className="w-[76px] h-[76px] rounded-full border-4 border-white flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40">
            {mode === 'photo'
              ? <Circle size={58} fill="#fff" strokeWidth={0} />
              : recording ? <Square size={30} fill="#dc2626" strokeWidth={0} /> : <Circle size={58} fill="#dc2626" strokeWidth={0} />}
          </button>
          <button type="button" data-camera-done disabled={!shots.length || recording} onClick={finish}
            className="min-w-[56px] h-14 px-3 rounded-xl bg-[#4aa8d8] flex items-center justify-center gap-1 font-bold text-[15px] disabled:opacity-35">
            <Check size={18} />{W.done}
          </button>
        </div>
      </div>
      <input ref={pickRef} type="file" accept="image/*,video/*" multiple className="hidden" data-camera-pick
        onChange={e => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; fs.forEach(add); }} />

      {askDiscard && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center p-6" data-camera-discard>
          <div className="w-full max-w-[320px] rounded-2xl bg-white text-gray-900 p-5" dir={isRtl ? 'rtl' : 'ltr'}>
            <div className="text-[16px] font-bold">{W.discard(shots.length)}</div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setAskDiscard(false)} className="px-4 py-2 rounded-lg bg-gray-100 font-medium">{W.keep}</button>
              <button type="button" data-camera-discard-yes onClick={() => { setAskDiscard(false); onClose(); }} className="px-4 py-2 rounded-lg bg-red-600 text-white font-medium">{W.del}</button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
