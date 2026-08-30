import { useEffect, useState } from 'react';

/**
 * "Is this a phone-width screen?"
 *
 * Matches Tailwind's `md` breakpoint — the same line the sidebar/MobileNav
 * swap on — so a component asking this always agrees with what the chrome
 * around it is doing. It lived inside ProjectDiagramPage; the drawer and the
 * settings pages need the same answer, and two copies of a breakpoint is how
 * they drift apart.
 *
 * Use this ONLY where a phone needs different markup or a computed size that
 * CSS cannot express (an inline width, a different element tree). Anything a
 * Tailwind `md:` prefix can do should still be done in CSS — that keeps
 * working while React is deciding, and cannot disagree with the media query.
 */
export function usePhone(): boolean {
  return useMedia('(max-width: 767px)');
}

/**
 * A subscribed width test for the lines Tailwind does not have.
 *
 * Same shape as usePhone — a matchMedia LISTENER, never a value cached at
 * mount, because a folding phone changes width with the window still open
 * and anything cached breaks on it first. The query string must be a
 * constant at the call site (it is read once, in the effect's closure).
 */
export function useMedia(query: string): boolean {
  const [on, setOn] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setOn(mq.matches);
    // Catch a width that moved between the first render and the subscription.
    setOn(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return on;
}
