// SORT A CLOSE'S PHOTOS (owner, 2026-11-01).
//
// The worker took the pictures of the day's work in ONE step; this files each
// one under the stage it shows:
//  - one stage in the close: every photo is that stage, no AI;
//  - a video: the furthest stage of the close (a video shows the work "up
//    until that stage");
//  - a picture: the AI looks at it and picks one of the close's stages (the
//    stage's own "what goes in here" words, plus the owner's definitions).
// Each photo's `stageId` is written in the cloud and its Drive file moved to
// <the flat's Photos folder>/<stage name>, the same folder an upload to that
// stage would use. Anything that cannot be decided stays as it was.
import { firestoreBase } from './fullBackup.js';

const ID = /^[A-Za-z0-9_-]{6,100}$/;
const COL = /^([a-z0-9]+_)?contractorPhotos$/;
const FOLDER = 'application/vnd.google-apps.folder';

/** The owner's words for what each stage looks like (2026-11-01). */
const LOOKS = {
  's-drilling': 'drilling AND piping: openings chiselled in walls (often above windows), round core-drilled holes, a photo of the flat number by the door; copper refrigerant pipes (usually insulated, white or grey) run along the bare ceiling or walls, soldering, connections, BU boxes',
  's-drains': 'condensate drain pipes being glued together, any drain work',
  's1-concealed': 'indoor AC units hung on the CEILING (ducted units, often inside a metal drywall frame, with a plenum box and flexible silver ducts), their electrics and gas connections',
  's1-fans': 'ventilation: round inline fans on ducts, vent ducting, vent electrics',
  's4-wall': 'WALL-MOUNTED split units hung on a wall (the classic white indoor unit), their electrics and gas connections',
  's4-outdoor': 'outdoor condenser units, their metal stand or bracket, the main gas line to them, their electric and communication lines',
  's7-registers': 'finished grilles / registers in the ceiling or wall',
  's7-panels': 'access panel doors in the drywall',
  's7-thermostats': 'thermostats on the wall, switching the system on',
};

export async function sortPhotos(body, { drive, env = process.env, fetchImpl = fetch, askAi } = {}) {
  const col = String(body.col ?? '');
  const photos = (Array.isArray(body.photos) ? body.photos : []).slice(0, 40)
    .filter(p => ID.test(String(p?.id ?? '')) && ID.test(String(p?.driveFileId ?? '')));
  const stages = (Array.isArray(body.stages) ? body.stages : []).slice(0, 20)
    .filter(s => ID.test(String(s?.id ?? '')) && typeof s.name === 'string' && s.name.trim())
    .map(s => ({ id: s.id, name: s.name.trim().slice(0, 80), order: Number(s.order) || 0, includes: (Array.isArray(s.includes) ? s.includes : []).map(String).slice(0, 12) }));
  if (!COL.test(col) || !photos.length || !stages.length) return { ok: false, error: 'Nothing to sort' };
  const last = [...stages].sort((a, b) => b.order - a.order)[0];

  // 1 · which stage each photo is
  const pick = {};
  for (const p of photos) if (stages.length === 1 || p.video) pick[p.id] = stages.length === 1 ? stages[0].id : last.id;
  const pictures = photos.filter(p => !pick[p.id]);
  if (pictures.length && askAi) {
    const images = [];
    for (const p of pictures) {
      try {
        const r = await fetchImpl(`https://drive.google.com/thumbnail?id=${p.driveFileId}&sz=w800`);
        const type = (r.headers.get('content-type') || '').split(';')[0];
        if (!r.ok || !/^image\/(jpeg|png|webp|gif)$/.test(type)) continue;
        images.push({ id: p.id, type, data: Buffer.from(await r.arrayBuffer()).toString('base64') });
      } catch { /* that one stays as it was */ }
    }
    if (images.length) {
      const answer = await askAi({ stages: stages.map(s => ({ ...s, looks: LOOKS[s.id] ?? '' })), images });
      for (const img of images) if (stages.some(s => s.id === answer?.[img.id])) pick[img.id] = answer[img.id];
    }
  }

  // 2 · tag it in the cloud, and move its file into the stage's folder
  const base = firestoreBase(env);
  const key = env.FIREBASE_API_KEY || env.VITE_FIREBASE_API_KEY;
  const folderCache = new Map();
  const out = [];
  for (const p of photos) {
    const stageId = pick[p.id];
    if (!stageId) { out.push({ id: p.id, sorted: false }); continue; }
    const r = { id: p.id, stageId, tagged: false, moved: false };
    try {
      const url = `${base}/${col}/${p.id}?updateMask.fieldPaths=stageId&currentDocument.exists=true${key ? `&key=${encodeURIComponent(key)}` : ''}`;
      const w = await fetchImpl(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { stageId: { stringValue: stageId } } }) });
      r.tagged = w.ok;
    } catch { /* stays untagged */ }
    if (drive) {
      try {
        const name = stages.find(s => s.id === stageId).name;
        const f = await drive.files.get({ fileId: p.driveFileId, fields: 'parents', supportsAllDrives: true });
        const parent = f.data.parents?.[0];
        if (parent) {
          const pf = await drive.files.get({ fileId: parent, fields: 'id,name,parents', supportsAllDrives: true });
          // The file sits in Photos/<a stage> — or in Photos itself.
          const photosId = /photo|תמונות/i.test(pf.data.name ?? '') ? pf.data.id : pf.data.parents?.[0];
          if (photosId) {
            const ck = `${photosId}|${name}`;
            let target = folderCache.get(ck);
            if (!target) {
              const q = `name = '${name.replace(/'/g, "\\'")}' and '${photosId}' in parents and mimeType = '${FOLDER}' and trashed = false`;
              const found = await drive.files.list({ q, fields: 'files(id)', supportsAllDrives: true, includeItemsFromAllDrives: true });
              target = found.data.files?.[0]?.id
                ?? (await drive.files.create({ requestBody: { name, mimeType: FOLDER, parents: [photosId] }, fields: 'id', supportsAllDrives: true })).data.id;
              folderCache.set(ck, target);
            }
            if (target === parent) r.moved = true;
            else {
              await drive.files.update({ fileId: p.driveFileId, addParents: target, removeParents: f.data.parents.join(','), fields: 'id', supportsAllDrives: true });
              r.moved = true;
            }
          }
        }
      } catch (err) { r.moveError = err.message; }
    }
    out.push(r);
  }
  return { ok: true, results: out };
}

/** The AI's question: one answer per picture, a stage id from the list. */
export function claudeAsker(anthropic, model) {
  return async ({ stages, images }) => {
    const list = stages.map(s => `- ${s.id}: "${s.name}"${s.looks ? ` — ${s.looks}` : ''}${s.includes.length ? ` (includes: ${s.includes.join(', ')})` : ''}`).join('\n');
    const content = [{ type: 'text', text: `These are photos an HVAC installer took at the end of his day in one apartment. He worked on these stages:\n${list}\n\nFor each photo, say which ONE of these stages it shows. Answer with JSON only: {"<photo id>": "<stage id>", ...}.` }];
    for (const img of images) {
      content.push({ type: 'text', text: `Photo id: ${img.id}` });
      content.push({ type: 'image', source: { type: 'base64', media_type: img.type, data: img.data } });
    }
    const msg = await anthropic.messages.create({ model, max_tokens: 1500, messages: [{ role: 'user', content }] });
    const text = msg.content.filter(c => c.type === 'text').map(c => c.text).join('');
    const m = text.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : {};
  };
}
