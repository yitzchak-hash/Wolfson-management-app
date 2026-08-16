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
  const [phone, setPhone] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = () => setPhone(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return phone;
}
