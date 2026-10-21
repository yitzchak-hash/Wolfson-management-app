// Builds the worker's "undo a task I opened by mistake" guide, English + Russian, as a PDF.
import { chromium } from 'playwright';
import fs from 'node:fs';
const IMG = process.env.IMG, OUT = process.env.OUT;
const img = n => 'data:image/png;base64,' + fs.readFileSync(`${IMG}/${n}.png`).toString('base64');

const T = {
  en: {
    tag: 'For workers · TzviAir app',
    h1: 'Opened a task by mistake? Undo it.',
    lead: 'If you pressed <b>“I’m going to work here”</b> on the wrong apartment, or made yourself a task you did not mean to, you can take it back yourself. You do not need to call the office.',
    steps: [
      ['1', 'Find the task', 'It is in <b>My tasks</b>, like any other task.'],
      ['2', 'Press the undo arrow', 'Open the task. Beside the apartment’s name is a small round arrow <b>↶</b>.'],
      ['3', 'Press “Undo”', 'The app asks first. Press <b>Undo</b> to take it back, or <b>No</b> to keep it.'],
      ['4', 'It is gone', 'The task is off your list, and the apartment is back the way it was.'],
    ],
    whatTitle: 'What happens when you undo',
    what: [
      'The task is deleted, with its photos and messages.',
      'The apartment’s stages go back to exactly how they were before you started.',
      'A stage that another worker’s task depends on stays as it is.',
      'The office sees one line in the history: you undid it.',
    ],
    whenTitle: 'When you will see the arrow',
    when: [
      'On tasks <b>you opened yourself</b>: “I’m going to work here”, “I did work here”, or a task you gave yourself.',
      'On open tasks and on tasks you already closed.',
      '<b>Not</b> on tasks the office gave you, and <b>not</b> on problems. Ask the office for those.',
    ],
    tip: '<b>Right building, wrong apartment?</b> Use the other small icon, the two arrows <b>⇄</b>. It moves your work, with its photos, to the right apartment.',
  },
  ru: {
    tag: 'Для работников · приложение TzviAir',
    h1: 'Открыли задачу по ошибке? Отмените её.',
    lead: 'Если вы нажали <b>«Я иду работать сюда»</b> не в той квартире или создали себе задачу случайно, вы можете отменить это сами. Звонить в офис не нужно.',
    steps: [
      ['1', 'Найдите задачу', 'Она в разделе <b>Мои задачи</b>, как и все остальные.'],
      ['2', 'Нажмите стрелку отмены', 'Откройте задачу. Рядом с названием квартиры есть маленькая круглая стрелка <b>↶</b>.'],
      ['3', 'Нажмите «Отменить»', 'Приложение сначала спросит. Нажмите <b>Отменить</b>, чтобы убрать задачу, или <b>Нет</b>, чтобы оставить.'],
      ['4', 'Готово', 'Задачи больше нет в списке, а квартира стала такой, как была.'],
    ],
    whatTitle: 'Что происходит при отмене',
    what: [
      'Задача удаляется вместе с фото и сообщениями.',
      'Этапы квартиры возвращаются точно к тому, как было до начала вашей работы.',
      'Этап, от которого зависит задача другого работника, остаётся как есть.',
      'Офис видит в истории одну строку: вы отменили задачу.',
    ],
    whenTitle: 'Когда появляется стрелка',
    when: [
      'На задачах, <b>которые вы открыли сами</b>: «Я иду работать сюда», «Я работал здесь» или задача, которую вы дали себе.',
      'На открытых задачах и на уже закрытых.',
      '<b>Не</b> на задачах от офиса и <b>не</b> на проблемах. По ним обращайтесь в офис.',
    ],
    tip: '<b>Правильный корпус, но не та квартира?</b> Нажмите другой значок, две стрелки <b>⇄</b>. Он переносит вашу работу вместе с фото в нужную квартиру.',
  },
};
const shots = ['1-list', '2-sheet', '3-ask', '4-after'];

const page = l => {
  const t = T[l];
  return `<section class="page" lang="${l}">
  <header><div class="brand">TzviAir</div><div class="tag">${t.tag}</div></header>
  <h1>${t.h1}</h1>
  <p class="lead">${t.lead}</p>
  <div class="steps">${t.steps.map(([n, h, p], i) => `
    <figure><div class="shot"><img src="${img(`${l}-${shots[i]}-c`)}"></div>
      <figcaption><span class="num">${n}</span><div><div class="h">${h}</div><div class="cap">${p}</div></div></figcaption></figure>`).join('')}
  </div>
  <div class="cols">
    <div class="box"><h2>${t.whatTitle}</h2><ul>${t.what.map(x => `<li>${x}</li>`).join('')}</ul></div>
    <div class="box"><h2>${t.whenTitle}</h2><ul>${t.when.map(x => `<li>${x}</li>`).join('')}</ul></div>
  </div>
  <p class="tip">${t.tip}</p>
</section>`;
};

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Undo a task opened by mistake</title><style>
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font-family: 'DejaVu Sans', 'Liberation Sans', sans-serif; color: #1f2937; }
.page { width: 210mm; height: 297mm; padding: 11mm 14mm 9mm; overflow: hidden; page-break-after: always; display: flex; flex-direction: column; }
.page:last-child { page-break-after: auto; }
header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2.5px solid #1e3a5f; padding-bottom: 3mm; }
.brand { font-weight: 800; font-size: 15pt; color: #1e3a5f; letter-spacing: .3px; }
.tag { font-size: 9pt; color: #4aa8d8; font-weight: 700; }
h1 { font-size: 19pt; color: #1e3a5f; margin: 4mm 0 1.8mm; line-height: 1.2; }
.lead { font-size: 10.5pt; line-height: 1.45; margin: 0 0 4mm; color: #374151; }
.steps { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm 6mm; align-items: start; }
figure { margin: 0; display: flex; flex-direction: column; }
.shot { border: 1px solid #cbd5e1; border-radius: 3mm; overflow: hidden; background: #f1f5f9; }
.shot img { width: 100%; display: block; }
figcaption { margin-top: 2.2mm; font-size: 9pt; line-height: 1.4; display: flex; gap: 2.5mm; align-items: flex-start; }
figcaption .h { font-weight: 700; font-size: 10pt; color: #1e3a5f; margin-bottom: .5mm; }
.num { display: inline-flex; width: 5.2mm; height: 5.2mm; border-radius: 50%; background: #1e3a5f; color: #fff; font-weight: 700; font-size: 8.5pt; align-items: center; justify-content: center; flex: none; margin-top: .3mm; }
.cap { color: #4b5563; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-top: 3.5mm; }
.box { background: #f1f6fb; border: 1px solid #d6e4f0; border-radius: 3mm; padding: 3mm 4mm; }
h2 { font-size: 11pt; color: #1e3a5f; margin: 0 0 2mm; }
ul { margin: 0; padding-left: 4.5mm; font-size: 8.8pt; line-height: 1.4; }
li { margin-bottom: .7mm; }
.tip { margin: 2.5mm 0 0; font-size: 9pt; line-height: 1.45; background: #fffbeb; border: 1px solid #fde68a; border-radius: 3mm; padding: 3mm 4.5mm; color: #78350f; }
</style></head><body>${page('en')}${page('ru')}</body></html>`;

fs.writeFileSync(`${IMG}/guide.html`, html);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage();
await p.setContent(html, { waitUntil: 'load' });
await p.pdf({ path: OUT, format: 'A4', printBackground: true, preferCSSPageSize: true });
await p.setViewportSize({ width: 794, height: 1123 }); await p.emulateMedia({ media: 'print' });
const secs = await p.$$('section.page'); for (let i = 0; i < secs.length; i++) await secs[i].screenshot({ path: `${IMG}/page${i+1}.png` });
console.log(await p.evaluate(() => [...document.querySelectorAll('section.page')].map(s => s.scrollHeight + '/' + s.clientHeight).join(' ')));
await b.close();
console.log('ok');
