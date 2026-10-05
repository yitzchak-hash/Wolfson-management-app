import React from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { he as heLocale } from 'date-fns/locale';
import { Layers, ClipboardList, Camera, MessageSquare, AlertTriangle, Eye, Pencil } from 'lucide-react';
import { personColor } from '../../types';
import type { ActivityFamily, ActivityLang } from '../../data/activityWords';
import { ACTIVITY_UI } from '../../data/activityWords';

/**
 * The pieces every activity list draws the same way — the Activity page, the
 * apartment window's History tab — so a row cannot read one way in one place
 * and another way in the other. Module level on purpose: a component declared
 * inside a render body is a new type every render.
 */

type IconCmp = React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;

/** One glyph and colour per family — the eye finds "the photos" before reading a word. */
export const FAMILY_LOOK: Record<ActivityFamily, { icon: IconCmp; color: string }> = {
  stages: { icon: Layers, color: '#16a34a' },
  tasks: { icon: ClipboardList, color: '#d97706' },
  photos: { icon: Camera, color: '#2563eb' },
  notes: { icon: MessageSquare, color: '#0891b2' },
  problems: { icon: AlertTriangle, color: '#dc2626' },
  opened: { icon: Eye, color: '#94a3b8' },
  other: { icon: Pencil, color: '#64748b' },
};

/** The person's initial on their own colour — the same colour the planner gives them. */
export function ActivityAvatar({ name, size = 32 }: { name: string; size?: number }) {
  const n = (name || '?').trim() || '?';
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 select-none"
      style={{ width: size, height: size, backgroundColor: personColor(n), fontSize: Math.round(size * 0.42) }}
      aria-hidden="true"
    >
      {n.charAt(0).toUpperCase()}
    </div>
  );
}

/** The family's glyph in a soft tinted circle. */
export function FamilyIcon({ family, size = 26 }: { family: ActivityFamily; size?: number }) {
  const look = FAMILY_LOOK[family] ?? FAMILY_LOOK.other;
  const Icon = look.icon;
  return (
    <span
      className="rounded-full flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: `${look.color}17` }}
      data-activity-family={family}
    >
      <Icon size={Math.round(size * 0.5)} style={{ color: look.color }} />
    </span>
  );
}

export const dateLocale = (lang: ActivityLang) => (lang === 'he' ? heLocale : undefined);

/** "09:12", or "09:12–09:40" for a folded run. */
export function clockRange(newest: string, oldest: string): string {
  const b = new Date(newest);
  const a = new Date(oldest);
  if (Number.isNaN(b.getTime())) return '';
  const fb = format(b, 'HH:mm');
  const fa = Number.isNaN(a.getTime()) ? fb : format(a, 'HH:mm');
  return fa === fb ? fb : `${fa}–${fb}`;
}

/** "Today", "Yesterday", or "Friday 3 October" — the heading over a day's rows. */
export function dayLabel(iso: string, lang: ActivityLang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const ui = ACTIVITY_UI[lang];
  if (isToday(d)) return ui.today;
  if (isYesterday(d)) return ui.yesterday;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return format(d, sameYear ? 'EEEE d MMMM' : 'EEEE d MMMM yyyy', { locale: dateLocale(lang) });
}

/** The local calendar day of a moment — what groups rows under one heading. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : format(d, 'yyyy-MM-dd');
}
