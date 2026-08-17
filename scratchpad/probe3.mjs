import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2026-08-16');
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-test', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
  }));
});
const p = await ctx.newPage();
await p.goto('http://localhost:5173/jobs');
await p.waitForTimeout(2600);
// What does the sample world actually resolve to on this board?
console.log(await p.evaluate(async () => {
  const w = await import('/src/data/widgets.tsx');
  const store = (await import('/src/data/store.ts')).useStore.getState();
  const ctx = {
    jobs: store.apartments.filter(a => a.buildingId === 'G' && !a.isUnnamed),
    stages: store.stages,  // exactly what WidgetStore passes
    assignments: store.contractorAssignments, contractors: store.contractors,
    users: store.users, photos: store.contractorPhotos, logs: store.activityLogs,
    update: () => {}, openJob: () => {},
  };
  const s = w.withSampleData(ctx);
  return {
    rawLogs: ctx.logs.length, rawStages: ctx.stages.length, rawJobs: ctx.jobs.length,
    outLogs: s.logs.length,
    stageNames: s.stages.map(x => x.name),
    logMoves: s.logs.filter(l => l.fieldChanged === 'currentStageId')
      .map(l => `${l.apartmentId}: ${l.previousValue}->${l.newValue}`),
    jobIds: s.jobs.map(j => j.id),
  };
}));
await b.close();
