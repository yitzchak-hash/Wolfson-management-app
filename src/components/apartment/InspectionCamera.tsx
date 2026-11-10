import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Image as ImageIcon, RefreshCw, Circle, Square, Camera, Video } from 'lucide-react';
import { haptic } from '../../data/haptics';
import { progressiveMp4 } from '../../data/fmp4';

/**
 * The kinds of film to ask the browser for, best first. An iPhone and current Chrome write MP4 (H.264 + AAC), which
 * plays everywhere and on Drive; older browsers only write WebM.
 */
const FILM_TYPES = [
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4;codecs=avc1.42E01F,mp4a.40.2',
  // A Chrome without an AAC encoder: the H.264 picture still plays everywhere, Opus sound in MP4 in every current browser.
  'video/mp4;codecs=avc1,opus',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];
function filmType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const t of FILM_TYPES) { try { if (MediaRecorder.isTypeSupported(t)) return t; } catch { /* a browser that throws here has no say */ } }
  return '';
}

/**
 * The film's sound: the microphone RAW. A web page's default microphone is the phone-call one — echo cancellation,
 * noise suppression and automatic gain, mono — which flattened the inspection films into a muffled voice track. Off,
 * the site's real sound comes through (stereo where the phone has it, at 48 kHz).
 */
const FILM_AUDIO: MediaTrackConstraints = {
  echoCancellation: false, noiseSuppression: false, autoGainControl: false,
  channelCount: { ideal: 2 }, sampleRate: { ideal: 48000 },
};

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
  /** The phone's own camera, for a film (see toggleRecord). */
  const filmRef = useRef<HTMLInputElement>(null);
  /**
   * The phone's own PHOTO camera too (owner, 2026-11-09: "can we use the actual picture camera just like the video
   * camera?"): its full quality, focus and flash. It brings back ONE picture a trip — each lands in the strip and they
   * all go up together at Done. The shutter here stays for a quick run of many.
   */
  const snapRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'photo' | 'video'>('photo');
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [shots, setShots] = useState<{ file: File; url: string }[]>([]);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [flash, setFlash] = useState(false);
  const [failed, setFailed] = useState(false);
  const [askDiscard, setAskDiscard] = useState(false);
  /** The stream has the microphone and this browser can record it: Video records here. Otherwise the phone's camera. */
  const [canFilm, setCanFilm] = useState(false);
  /** A stopped film is being finished (made into an ordinary MP4) — Done waits for it. */
  const [saving, setSaving] = useState(false);
  /** Bumped each time the window opens, so a film that finishes after the window closed is not added to the next one. */
  const session = useRef(0);
  const W = isRtl
    ? { photo: 'תמונה', video: 'וידאו', done: 'סיום', gallery: 'גלריה', noCam: 'הדפדפן לא נתן גישה למצלמה.', useCam: 'פתיחת המצלמה של הטלפון', discard: (n: number) => `למחוק ${n} צילומים?`, keep: 'להמשיך לצלם', del: 'מחיקה', phoneCam: 'מצלמת הטלפון' }
    : { photo: 'Photo', video: 'Video', done: 'Done', gallery: 'Gallery', noCam: 'The browser did not give the camera.', useCam: "Open the phone's camera", discard: (n: number) => `Throw away ${n} shot${n === 1 ? '' : 's'}?`, keep: 'Keep shooting', del: 'Throw away', phoneCam: 'Phone camera' };

  // The camera runs while the window is open; a switch of mode (video needs the microphone) or side restarts it.
  useEffect(() => {
    if (!open) return;
    let dead = false;
    setFailed(false);
    setCanFilm(false);
    const video: MediaTrackConstraints = { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } };
    const show = (s: MediaStream) => {
      if (dead) { s.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = s;
      if (videoRef.current) { videoRef.current.srcObject = s; void videoRef.current.play().catch(() => {}); }
    };
    const md = navigator.mediaDevices;
    if (!md?.getUserMedia) setFailed(true);
    else if (mode === 'video' && filmType() !== null) {
      /**
       * A FILM IS RECORDED HERE AGAIN, at full quality (owner, 2026-11-10). The phone's own camera, opened from a file
       * box, looked like the safe road — but an iPhone SHRINKS what it hands a web page that way: the films came back
       * 480×360. So Video asks for the camera at 1080p with the microphone raw (FILM_AUDIO) and records it in the page.
       * If the microphone is refused, the viewfinder still runs and the shutter opens the phone's camera instead.
       */
      md.getUserMedia({ video, audio: FILM_AUDIO })
        .then(s => { show(s); if (!dead) setCanFilm(s.getAudioTracks().length > 0); })
        .catch(() => md.getUserMedia({ video, audio: false }).then(show).catch(() => { if (!dead) setFailed(true); }));
    } else {
      // Photo: the viewfinder only, no microphone asked for.
      md.getUserMedia({ video, audio: false }).then(show).catch(() => { if (!dead) setFailed(true); });
    }
    return () => { dead = true; streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; };
  }, [open, mode, facing]);

  // A fresh window starts empty. A film still recording when the window shuts is stopped and thrown away.
  useEffect(() => {
    session.current++;
    if (!open) {
      const r = recRef.current; recRef.current = null;
      if (r && r.state !== 'inactive') { r.ondataavailable = null; r.onstop = null; try { r.stop(); } catch { /* already stopped */ } }
      shots.forEach(s => URL.revokeObjectURL(s.url)); setShots([]); setRecording(false); setSaving(false); setAskDiscard(false); setMode('photo');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

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

  /**
   * Video's shutter. (owner, 2026-11-09: "it's saving videos with really bad sound … really bad quality"; 2026-11-10:
   * full quality with real sound.) The two faults of recording in the page are answered here, not by leaving it:
   * the sound by the raw microphone (FILM_AUDIO), and the iPhone's "length unknown" file — a FRAGMENTED MP4 that a
   * player must read to the end before it can start — by rewriting it as an ordinary MP4 when it stops
   * (progressiveMp4). Where this browser cannot record (no MediaRecorder, no microphone, the recorder refuses), the
   * phone's own camera opens as before, so nothing is worse than it was.
   */
  function toggleRecord() {
    if (recording) { recRef.current?.stop(); haptic('tap'); return; }
    haptic('tap');
    const stream = streamRef.current; const type = filmType();
    if (!canFilm || !stream || type === null) { filmRef.current?.click(); return; }
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 160_000 });
    } catch {
      filmRef.current?.click(); return;
    }
    const mine = session.current;
    chunks.current = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
    rec.onstop = async () => {
      recRef.current = null; setRecording(false);
      const kind = rec.mimeType || type || chunks.current[0]?.type || 'video/webm';
      const raw = new Blob(chunks.current, { type: kind.split(';')[0] });
      chunks.current = [];
      if (!raw.size || mine !== session.current) return;
      const mp4 = /mp4/.test(kind);
      let film: Blob = raw;
      if (mp4) {
        setSaving(true);
        // A remux that cannot read the file keeps the film as it was recorded — never lose a film over its index.
        try { film = await progressiveMp4(raw); } catch { film = raw; }
        setSaving(false);
      }
      if (mine !== session.current) return;
      add(new File([film], `video-${stamp()}.${mp4 ? 'mp4' : 'webm'}`, { type: mp4 ? 'video/mp4' : 'video/webm' }));
    };
    try { rec.start(1000); } catch { filmRef.current?.click(); return; }
    recRef.current = rec;
    setRecording(true);
  }

  function finish() {
    if (recording || saving) return;
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
          : (
            <div className="flex items-center gap-3">
              <span className="text-[14px] font-semibold tabular-nums" data-camera-count>{shots.length ? `${shots.length}` : ''}</span>
              {mode === 'photo' && (
                <button type="button" data-camera-phone onClick={() => { haptic('tap'); snapRef.current?.click(); }}
                  className="h-11 px-3.5 rounded-full bg-white/15 flex items-center gap-1.5 text-[13px] font-semibold">
                  <Camera size={17} />{W.phoneCam}
                </button>
              )}
            </div>
          )}
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
            <button type="button" onClick={() => (mode === 'video' ? filmRef.current?.click() : onFallback('camera'))} className="px-5 py-3 rounded-xl bg-white text-[#1e3a5f] font-bold">{W.useCam}</button>
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
          <button type="button" data-camera-shutter disabled={failed || saving} onClick={mode === 'photo' ? takePhoto : toggleRecord}
            aria-label={mode === 'photo' ? W.photo : W.video}
            className="w-[76px] h-[76px] rounded-full border-4 border-white flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40">
            {mode === 'photo'
              ? <Circle size={58} fill="#fff" strokeWidth={0} />
              : recording ? <Square size={30} fill="#dc2626" strokeWidth={0} /> : <Circle size={58} fill="#dc2626" strokeWidth={0} />}
          </button>
          <button type="button" data-camera-done disabled={!shots.length || recording || saving} onClick={finish}
            className="min-w-[56px] h-14 px-3 rounded-xl bg-[#4aa8d8] flex items-center justify-center gap-1 font-bold text-[15px] disabled:opacity-35">
            <Check size={18} />{W.done}
          </button>
        </div>
      </div>
      <input ref={filmRef} type="file" accept="video/*" capture="environment" className="hidden" data-camera-film
        onChange={e => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; fs.forEach(add); }} />
      <input ref={snapRef} type="file" accept="image/*" capture="environment" className="hidden" data-camera-snap
        onChange={e => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; fs.forEach(add); }} />
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
