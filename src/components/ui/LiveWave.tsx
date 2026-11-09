import { useEffect, useRef } from 'react';

/**
 * THE LIVE LINE (owner, 2026-11-08: "I don't see a line going there — shows that it's taking the voice and the line
 * frequencies changed by the voice intake … in all places in the line intake"). Bars that scroll from right to left,
 * each as tall as the voice was at that moment — the way ChatGPT shows it is listening. Drawn on a canvas every frame
 * from a level REF (0..1), never React state: a re-render per frame would be the documented loop.
 */
export function LiveWave({ level, color = '#1e3a5f', height = 28, className = '', hook = true }: {
  level: React.MutableRefObject<number>; color?: string; height?: number; className?: string; hook?: boolean;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = cv.current; if (!c) return;
    const g = c.getContext('2d'); if (!g) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const bars: number[] = [];
    let raf = 0, last = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      const w = c.clientWidth, h = c.clientHeight;
      if (!w || !h) return;
      if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      const step = 4, n = Math.floor(w / step);
      if (t - last > 55) { last = t; bars.push(level.current); while (bars.length > n) bars.shift(); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      g.fillStyle = color;
      for (let i = 0; i < n; i++) {
        const v = bars[bars.length - n + i] ?? 0;
        const bh = Math.max(2, Math.min(h, (0.08 + v * 0.92) * h));
        const x = i * step;
        g.globalAlpha = 0.35 + 0.65 * (i / n);
        g.beginPath();
        g.roundRect?.(x, (h - bh) / 2, 2.2, bh, 1.1);
        if (!g.roundRect) g.rect(x, (h - bh) / 2, 2.2, bh);
        g.fill();
      }
      g.globalAlpha = 1;
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [level, color]);
  return <canvas ref={cv} {...(hook ? { 'data-live-wave': '' } : {})} className={`block ${className}`} style={{ height, width: '100%' }} aria-hidden="true" />;
}
