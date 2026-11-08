/**
 * A SMALL BUZZ IN THE HAND (owner, 2026-11-08: "add like vibrations to the phone for physical feedback … when moving
 * the floors, but in more places").
 *
 * Android's browsers vibrate on command (navigator.vibrate). An iPhone's Safari does not let a page vibrate the phone;
 * the one thing it does is give the light "tick" of its own switch control when one is toggled, so on an iPhone a
 * hidden switch is toggled instead — a gentle tap, not a buzz, and only where iOS supports that switch (iOS 18+).
 * Anywhere else it simply does nothing: never an error.
 */
type Kind = 'tick' | 'tap' | 'success' | 'warn';
const PATTERN: Record<Kind, number | number[]> = { tick: 8, tap: 14, success: [12, 60, 18], warn: [30, 50, 30] };

let iosSwitch: HTMLLabelElement | null = null;
function iosTick() {
  try {
    if (!iosSwitch) {
      const label = document.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      label.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      label.appendChild(input);
      document.body.appendChild(label);
      iosSwitch = label;
    }
    iosSwitch.click();
  } catch { /* nothing to do */ }
}

export function haptic(kind: Kind = 'tap') {
  if (typeof window === 'undefined') return;
  try {
    const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
    if (typeof nav.vibrate === 'function') { nav.vibrate(PATTERN[kind]); return; }
  } catch { /* fall through to the iPhone's tick */ }
  if (/iP(hone|ad|od)/.test(navigator.userAgent)) iosTick();
}
