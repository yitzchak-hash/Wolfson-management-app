import {
  Apartment, Contractor, ContractorAssignment, Stage, aptLabel, getStageName,
} from '../types';

/**
 * A task, written out for WhatsApp.
 *
 * The office assigns a job in the app and then tells the contractor about it on
 * WhatsApp, retyping the address, the date and the plan link every time — which
 * is both the slowest part of giving out work and the part that gets a digit
 * wrong. This produces the whole message in one go.
 *
 * WhatsApp's formatting is not markdown: *one star* is bold, _underscores_ are
 * italic, and ```three backticks``` is monospace. Markdown's **two stars** show
 * up as literal asterisks, which is exactly the kind of detail that makes a
 * pasted message look careless, so it is worth getting right.
 */

export interface TaskShareInput {
  task: ContractorAssignment;
  apartment?: Apartment;
  contractor?: Contractor;
  stage?: Stage;
  /** The workspace's name, so a message says which site it is about. */
  projectName?: string;
  isRtl?: boolean;
}

/** Bold, the way WhatsApp means it. */
const b = (s: string) => `*${s}*`;

function prettyDate(iso: string | null | undefined, isRtl: boolean): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.toLocaleDateString(isRtl ? 'he-IL' : undefined, {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  const rel = diff === 0 ? (isRtl ? ' (היום)' : ' (today)')
    : diff === 1 ? (isRtl ? ' (מחר)' : ' (tomorrow)')
    : diff < 0 ? (isRtl ? ` (באיחור ${-diff} ימים)` : ` (${-diff} days late)`)
    : '';
  return day + rel;
}

export function taskShareText(input: TaskShareInput): string {
  const { task, apartment, contractor, stage, projectName } = input;
  const he = !!input.isRtl;
  const L = he
    ? { job: 'עבודה', where: 'כתובת', who: 'עבור', when: 'לתאריך', stage: 'שלב',
        plan: 'תוכנית', folder: 'תיקייה', notes: 'הערות', files: 'קבצים' }
    : { job: 'Job', where: 'Address', who: 'For', when: 'Due', stage: 'Stage',
        plan: 'Plan', folder: 'Folder', notes: 'Notes', files: 'Files' };

  const lines: string[] = [];

  // The emoji sits OUTSIDE the bold, like every other line — WhatsApp bolds
  // the run between the stars, and wrapping the emoji in it reads as a slip.
  if (task.priority === 'urgent') lines.push(`🔴 ${b(he ? 'דחוף' : 'URGENT')}`);

  // The task itself, first and in bold — it is the thing being asked for.
  lines.push(`🔧 ${b(task.taskDescription.trim() || (he ? 'עבודה' : 'Work'))}`);
  lines.push('');

  const where = apartment ? aptLabel(apartment) : '';
  if (where) {
    const site = [projectName, apartment?.buildingId !== 'G' ? apartment?.buildingId : '']
      .filter(Boolean).join(' · ');
    lines.push(`📍 ${b(L.job)}: ${where}${site ? ` — ${site}` : ''}`);
  }
  if (apartment?.address?.trim()) lines.push(`🏠 ${L.where}: ${apartment.address.trim()}`);
  if (contractor?.name) lines.push(`👷 ${L.who}: ${contractor.name}`);
  if (task.dueDate) lines.push(`📅 ${b(L.when)}: ${prettyDate(task.dueDate, he)}`);
  if (stage) lines.push(`🧩 ${L.stage}: ${getStageName(stage, he)}`);

  if (apartment?.plansPdfLink) lines.push(`📐 ${L.plan}: ${apartment.plansPdfLink}`);
  if (apartment?.driveLink) lines.push(`📂 ${L.folder}: ${apartment.driveLink}`);

  const files = task.attachments ?? [];
  if (files.length) {
    lines.push('');
    lines.push(`📎 ${b(L.files)}`);
    for (const f of files) {
      lines.push(f.driveUrl ? `• ${f.filename} — ${f.driveUrl}` : `• ${f.filename}`);
    }
  }

  if (apartment?.generalNotes?.trim()) {
    lines.push('');
    lines.push(`📝 ${b(L.notes)}`);
    lines.push(apartment.generalNotes.trim());
  }

  // Trailing blank lines read as a mistake in a chat window.
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Put it on the clipboard.
 *
 * `navigator.clipboard` needs a secure context and is refused in a few
 * embedded browsers, so there is a fallback — a copy that silently does
 * nothing is worse than one that asks you to press Ctrl+C.
 */
export async function copyTaskShare(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
