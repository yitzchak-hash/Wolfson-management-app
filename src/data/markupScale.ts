import { useEffect, useState } from 'react';

/**
 * How big the markup studio's controls are ON THIS MACHINE.
 *
 * The big touchscreen wants buttons half again the desk size; a desk does not.
 * That is a fact about the screen in front of you, not about the office's
 * data, so it lives in localStorage beside `drive_desktop_root` and
 * `tzviair_helper_installed` and must never reach the synced store — a synced
 * value would push the touchscreen's giant buttons onto every desktop.
 *
 * It multiplies with any `touchScale` a host already passes (the wallboard),
 * clamped to the same [1, 2.2] band the studio's chrome is designed for.
 */
const KEY = 'markup_ui_scale';
const EVENT = 'markup-ui-scale';

export function getMarkupScale(): number {
  try {
    const v = parseFloat(localStorage.getItem(KEY) || '1');
    return Number.isFinite(v) ? Math.min(2.2, Math.max(1, v)) : 1;
  } catch { return 1; }
}

export function setMarkupScale(v: number): void {
  try { localStorage.setItem(KEY, String(Math.min(2.2, Math.max(1, v)))); } catch { /* private mode */ }
  // An open studio follows the slider live — same-tab writes fire no storage event.
  window.dispatchEvent(new Event(EVENT));
}

export function useMarkupScale(): number {
  const [v, setV] = useState(getMarkupScale);
  useEffect(() => {
    const on = () => setV(getMarkupScale());
    window.addEventListener(EVENT, on);
    window.addEventListener('storage', on);
    return () => {
      window.removeEventListener(EVENT, on);
      window.removeEventListener('storage', on);
    };
  }, []);
  return v;
}
