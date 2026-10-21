// The worker's "delete a task you opened" guide — three steps, English then Russian, as a PDF.
import { chromium } from 'playwright';
import fs from 'node:fs';
const IMG = process.env.IMG, OUT = process.env.OUT;
const img = n => 'data:image/png;base64,' + fs.readFileSync(`${IMG}/${n}.png`).toString('base64');

const T = {
  en: {
    h1: 'How to delete a task you opened',
    steps: ['Open the task you started.', 'Press the trash can.', 'Press <b>Delete</b>.'],
    warn: 'This deletes the task with <b>all its messages, photos and files</b>.',
  },
  ru: {
    h1: 'Как удалить задачу, которую вы открыли',
    steps: ['Откройте задачу, которую вы начали.', 'Нажмите на корзину.', 'Нажмите <b>Удалить</b>.'],
    warn: 'Задача удалится <b>вместе со всеми сообщениями, фото и файлами</b>.',
  },
};
const shots = ['1-list', '2-sheet', '3-ask'];

const page = l => {
  const t = T[l];
  return `<section class="page" lang="${l}">
  <div class="brand">TzviAir</div>
  <h1>${t.h1}</h1>
  ${t.steps.map((s, i) => `<div class="step"><div class="txt"><span class="num">${i + 1}</span><p>${s}</p></div>
    <div class="shot"><img src="${img(`${l}-${shots[i]}-c`)}"></div></div>`).join('')}
  <div class="warn"><span class="ic">⚠</span><p>${t.warn}</p></div>
</section>`;
};

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Delete a task you opened</title><style>
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font-family: 'DejaVu Sans', 'Liberation Sans', sans-serif; color: #1f2937; }
.page { width: 210mm; height: 297mm; padding: 13mm 16mm 10mm; page-break-after: always; overflow: hidden; display: flex; flex-direction: column; gap: 5mm; }
.page:last-child { page-break-after: auto; }
.brand { font-weight: 800; font-size: 13pt; color: #1e3a5f; border-bottom: 2.5px solid #1e3a5f; padding-bottom: 2.5mm; }
h1 { font-size: 22pt; color: #1e3a5f; margin: 1mm 0 0; line-height: 1.2; }
.step { display: grid; grid-template-columns: 66mm 1fr; gap: 6mm; align-items: center; }
.txt { display: flex; gap: 3.5mm; align-items: center; }
.txt p { margin: 0; font-size: 15pt; line-height: 1.3; font-weight: 600; color: #111827; }
.num { flex: none; width: 11mm; height: 11mm; border-radius: 50%; background: #1e3a5f; color: #fff; font-weight: 800; font-size: 16pt; display: flex; align-items: center; justify-content: center; }
.shot { border: 1px solid #cbd5e1; border-radius: 3mm; overflow: hidden; }
.shot img { width: 100%; display: block; }
.warn { display: flex; gap: 4mm; align-items: center; background: #fef2f2; border: 2px solid #fca5a5; border-radius: 3mm; padding: 4mm 5mm; margin-top: auto; }
.warn .ic { font-size: 20pt; color: #dc2626; }
.warn p { margin: 0; font-size: 14pt; line-height: 1.35; color: #7f1d1d; }
</style></head><body>${page('en')}${page('ru')}</body></html>`;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage();
await p.setContent(html, { waitUntil: 'load' });
await p.pdf({ path: OUT, format: 'A4', printBackground: true, preferCSSPageSize: true });
await p.setViewportSize({ width: 794, height: 1123 }); await p.emulateMedia({ media: 'print' });
const secs = await p.$$('section.page'); for (let i = 0; i < secs.length; i++) await secs[i].screenshot({ path: `${IMG}/page${i + 1}.png` });
console.log(await p.evaluate(() => [...document.querySelectorAll('section.page')].map(s => s.scrollHeight + '/' + s.clientHeight).join(' ')));
await b.close();
