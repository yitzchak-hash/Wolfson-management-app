import { writeFileSync } from 'fs';
import { BUILD, TRAPS } from './buildlist.mjs';

const un = h => h
  .replace(/<code>([^<]*)<\/code>/g, '`$1`')
  .replace(/<strong>([^<]*)<\/strong>/g, '**$1**')
  .replace(/<em>([^<]*)<\/em>/g, '*$1*')
  .replace(/<br><br>/g, '\n\n   ').replace(/<br>/g, '\n   ')
  // Strip real tags FIRST, then decode entities — the other way round turns
  // an escaped placeholder like &lt;apartmentId&gt; into a tag and eats it.
  .replace(/<[^>]+>/g, '')
  .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&middot;/g, '·')
  .replace(/&rsquo;/g, '’').replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”')
  .replace(/&hellip;/g, '…').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

const DECISIONS = [
  [1, 'The plan sits beside the details on a wide screen, a tab on a narrow one', 'The line is 800px of SCREEN width. Above it (sideways Fold 829, sideways iPad 1024, every PC) the plan sits beside the details and the details column gives way. Below it (every phone, Fold upright 690, iPad upright 768) the plan is its own tab next to Details. Turning a tablet moves it from one to the other with the window still open.'],
  [2, 'The plan’s tab row never appears on a preview — any device, anywhere', 'The “Plan ✕ +” strip is gone from every preview: iPhone, Galaxy, Flip, Fold upright and sideways, every iPad, every PC. No exceptions. It stays exactly as it is inside Mark up. On a phone this also removes the second row of tabs sitting under the app’s own Details / Plan / Tasks row.'],
  [3, 'Drive and Zoho stay side by side; their text hides behind the field’s edge', 'The two link boxes stay side by side at every width — they never stack. The long address runs to the end of its box and slips away behind the edge, so a box can never grow past its own column and collide with its neighbour.'],
  [4, 'Below 900px the diagram shows one building at a time', 'Big A1 / A2 / A3 tabs pick the building. Above 900px nothing changes — wide monitors keep all three side by side. This is what takes an apartment cell from 75px wide to 311px, the difference between “G…” and “Goldstein, Menachem · Concealed Units Installed”.'],
  [5, 'The stage bubbles become one stage bar; the loose row of numbers goes', 'Below 900px the top of the diagram is: search + one Filters button (type filter, Changes, Bulk update, Print, clear all live inside it), the building tabs, then one bar showing the whole project — each stage a block sized by how many apartments are in it, tap a block to filter. The eight wrapping bubbles and the separate row of bare numbers are both replaced by that bar. Above 900px the toolbar is untouched.'],
  [6, 'One Close job button, and the task screen shows what the office sent', 'The big green button in the middle of the worker’s screen goes — there is one Close job, at the end. Urgent loses its box (a red dot and the word). The Download button on the plan is repaired. Add File leaves the office’s block.'],
  [7, 'Closing a job is a screen of its own', 'Two things on it: “Tap to add photos, videos, or files” at the top, and one comment box with the paperclip and the microphone INSIDE it. No separate file section. Then “Send and close the job”. The line about pictures is not fixed text — it follows each worker’s own permission, so a photos-optional worker sees no demand, no counter, and is never locked out.'],
  [8, 'The task’s notes become a conversation, the same on phone and computer', 'Office speaks from the left in white, the worker answers from the right in blue. A file is a card you press to open and download; a photo is a preview you press to expand, with download there. One drawing of it, used in the worker’s portal and in the apartment window’s Tasks tab.'],
  [9, 'The closing comment is the last message in that conversation', 'What the worker writes on the closing screen lands in the thread with his photos attached, followed by a green “Job closed · 15:47” marker. One history per task. An empty comment still posts the photos and still closes the job.'],
  [10, 'The conversation carries on after the job is closed', 'Closing is a milestone in the thread, not the end of it. Both sides keep writing underneath the marker. And because the conversation stays open, nothing in it is ever edited or deleted — a correction is simply a new message.'],
  [11, 'A closed job says so — it does not keep offering the button', 'Once a task is closed the green Close job button is replaced by a plain “Job closed” state. The message box above it stays live, because the conversation carries on. Only the button goes.'],
];

let md = `# UI build list — the round sealed 2026-08-30

Eleven decisions the owner approved, and the fifteen changes that build them.
The pictures live in the **UI Decisions** artifact:
https://claude.ai/code/artifact/18d71433-a44e-4268-b63b-29f8bc03fe99

**Nothing in \`src/\` was changed while these were decided** — the round was
design only. Every proposal was built by rearranging the app's own live markup,
so what was approved is reachable with the components that already exist.

**Two thresholds, deliberately different.** 800px decides where the plan sits;
900px decides the diagram. On a sideways Fold (829px) the plan is beside the
details AND the diagram shows one building. That is correct, not a mistake.

---

## The eleven decisions

`;
for (const [n, t, d] of DECISIONS) md += `**${n}. ${t}**  \n${d}\n\n`;

md += `---\n\n## The build list\n\n`;
for (const part of BUILD) {
  md += `### ${un(part.part)}\n*From ${part.from}*\n\n`;
  for (const it of part.items) {
    md += `#### ${it.n}. ${un(it.t)}\n\n`;
    md += it.f.map(f => `\`${f}\``).join(' · ') + '\n\n';
    md += un(it.d) + '\n\n';
  }
}
md += `---\n\n## Rules this build must not break\n\n`;
for (const t of TRAPS) md += `- ${un(t)}\n`;

md += `
---

## How to check it

These harnesses cover this ground and must all stay green:
\`folddrawer\` · \`deskcheck\` · \`plantabs\` · \`planviewer\` · \`planzoom\` ·
\`planphone\` · \`portalround\` · \`multiday\` · \`stagereport\` · \`foldswap\` ·
\`ipadcheck\` (run as \`node scratchpad/<name>.mjs\` with the dev server up;
\`plantabs\` and \`planaddr\` need the keyed server on 5174 —
\`VITE_DRIVE_API_KEY=testkey npx vite --port 5174\`).

Re-run the sweep at 344, 390, 402, 768x1024 and 1024x768
(\`W=344 node scratchpad/shots.mjs\`, \`VIEW=landscape W=1024 H=768 …\`) —
**overflow and clipped must both be 0** at every size.

Run \`node scratchpad/backupaudit.mjs\` after item 15, and \`npx tsc --noEmit\`
throughout.

**Item 8 (the Download button) cannot be proven in the container** — it has no
Drive credentials. It needs one look on a real phone.
`;
writeFileSync('docs/UI-BUILD-LIST.md', md);
console.log('bytes:', md.length);
