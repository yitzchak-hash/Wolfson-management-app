// The close's ONE picture step, sorted afterwards (lib/sortPhotos.js, owner 2026-11-01):
// pictures go to the stage the AI picks, a video to the furthest stage, one stage
// needs no AI; each photo is tagged in the cloud and its file moved to Photos/<stage>.
// Stand-ins: the cloud (a fake Firestore REST), Drive and the AI. Run: node scratchpad/sortphotos-test.mjs
import { sortPhotos } from '../lib/sortPhotos.js';
let fails = 0;
const check = (ok, l, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${x ? ' — ' + x : ''}`); if (!ok) fails++; };
const J = v => JSON.stringify(v);
function world() {
  const files = { P: { name: 'Photos', parents: ['FLAT'], folder: true }, PIPE: { name: 'Piping', parents: ['P'], folder: true },
    'FILE-F1': { parents: ['PIPE'] }, 'FILE-F2': { parents: ['PIPE'] }, 'FILE-F3': { parents: ['PIPE'] }, 'FILE-F4': { parents: ['P'] } };
  let n = 0;
  const drive = { files: {
    get: async ({ fileId }) => ({ data: { id: fileId, ...files[fileId] } }),
    list: async ({ q }) => { const name = q.match(/name = '(.*?)'/)[1], par = q.match(/'([^']+)' in parents/)[1];
      return { data: { files: Object.entries(files).filter(([, f]) => f.folder && f.name === name && f.parents.includes(par)).map(([id]) => ({ id })) } }; },
    create: async ({ requestBody }) => { const id = `NEW${++n}`; files[id] = { name: requestBody.name, parents: requestBody.parents, folder: true }; return { data: { id } }; },
    update: async ({ fileId, addParents, removeParents }) => { files[fileId].parents = [...files[fileId].parents.filter(p => !removeParents.split(',').includes(p)), addParents]; return { data: {} }; },
  } };
  const cloud = {}; const thumbs = [];
  const fetchImpl = async (url, opt = {}) => {
    if (url.startsWith('https://drive.google.com/thumbnail')) { thumbs.push(url); return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }); }
    const m = url.match(/documents\/([^/]+)\/([^?]+)/);
    cloud[`${m[1]}/${m[2]}`] = JSON.parse(opt.body).fields.stageId.stringValue;
    return new Response('{}', { status: 200 });
  };
  const folderOf = id => files[files[id].parents[0]].name;
  return { drive, cloud, thumbs, fetchImpl, folderOf };
}
const env = { FIRESTORE_REST_BASE: 'http://x/v1/projects/p/databases/(default)/documents', VITE_FIREBASE_API_KEY: 'k' };
const STAGES = [{ id: 's1-piping', name: 'Piping', order: 3 }, { id: 's1-concealed', name: 'Concealed Units', order: 5 }, { id: 's1-fans', name: 'Fans', order: 6 }];

{ // pictures by AI, a video to the furthest stage
  const w = world(); let asked;
  const askAi = async q => { asked = q; return { 'PHOTO-A': 's1-concealed', 'PHOTO-B': 's1-piping', 'PHOTO-D': 'not-a-stage' }; };
  const r = await sortPhotos({ col: 'contractorPhotos', stages: STAGES, photos: [
    { id: 'PHOTO-A', driveFileId: 'FILE-F1' }, { id: 'PHOTO-B', driveFileId: 'FILE-F2' }, { id: 'PHOTO-C', driveFileId: 'FILE-F3', video: true }, { id: 'PHOTO-D', driveFileId: 'FILE-F4' }] },
    { drive: w.drive, env, fetchImpl: w.fetchImpl, askAi });
  check(r.ok, 'it runs');
  check(asked.images.length === 3 && !asked.images.some(i => i.id === 'PHOTO-C'), 'the AI sees the pictures, never the video', J(asked.images.map(i => i.id)));
  check(asked.stages.some(s => s.id === 's1-concealed' && /CEILING/.test(s.looks)), 'the AI is told what each stage looks like');
  check(w.cloud['contractorPhotos/PHOTO-A'] === 's1-concealed' && w.cloud['contractorPhotos/PHOTO-B'] === 's1-piping', 'each picture is tagged with the stage the AI picked', J(w.cloud));
  check(w.cloud['contractorPhotos/PHOTO-C'] === 's1-fans', 'the video goes with the furthest stage of the close (Fans)');
  check(!('contractorPhotos/PHOTO-D' in w.cloud), 'an answer that is not one of the close\'s stages changes nothing');
  check(w.folderOf('FILE-F1') === 'Concealed Units' && w.folderOf('FILE-F2') === 'Piping' && w.folderOf('FILE-F3') === 'Fans', 'each file moved to Photos/<its stage>', [w.folderOf('FILE-F1'), w.folderOf('FILE-F2'), w.folderOf('FILE-F3')].join(','));
  check(w.folderOf('FILE-F4') === 'Photos', 'the undecided one stays where it was');
}
{ // one stage: no AI at all
  const w = world(); let called = false;
  await sortPhotos({ col: 'netiv_contractorPhotos', stages: [STAGES[1]], photos: [{ id: 'PHOTO-A', driveFileId: 'FILE-F1' }] },
    { drive: w.drive, env, fetchImpl: w.fetchImpl, askAi: async () => { called = true; return {}; } });
  check(!called && w.cloud['netiv_contractorPhotos/PHOTO-A'] === 's1-concealed' && w.folderOf('FILE-F1') === 'Concealed Units', 'one stage: tagged and moved without asking the AI');
}
{ // refuses what is not a photo list
  const w = world();
  const r = await sortPhotos({ col: 'users', stages: STAGES, photos: [{ id: 'PHOTO-A', driveFileId: 'FILE-F1' }] }, { drive: w.drive, env, fetchImpl: w.fetchImpl });
  check(!r.ok && !Object.keys(w.cloud).length, 'any other collection is refused, nothing written');
}
{ // a workspace made in settings has a dashed id (map C20)
  const w = world();
  const r = await sortPhotos({ col: 'my-new-site_contractorPhotos', stages: [STAGES[1]], photos: [{ id: 'PHOTO-A', driveFileId: 'FILE-F1' }] },
    { drive: w.drive, env, fetchImpl: w.fetchImpl });
  check(r.ok && w.cloud['my-new-site_contractorPhotos/PHOTO-A'] === 's1-concealed', 'a dashed workspace id (my-new-site) is sorted like any other', J(w.cloud));
  for (const col of ['-site_contractorPhotos', 'site-_contractorPhotos', 'a--b_contractorPhotos', 'My-Site_contractorPhotos', 'a_b_contractorPhotos', 'my-site_users', 'my-site_contractorPhotos/x']) {
    const w2 = world();
    const r2 = await sortPhotos({ col, stages: STAGES, photos: [{ id: 'PHOTO-A', driveFileId: 'FILE-F1' }] }, { drive: w2.drive, env, fetchImpl: w2.fetchImpl });
    check(!r2.ok && !Object.keys(w2.cloud).length, `still refused: ${col}`);
  }
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
