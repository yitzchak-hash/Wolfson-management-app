// Inline the app's compiled CSS (html/body rules stripped — they would
// repaint the drafting table) into the template. The planbar-sketch manner.
import fs from 'node:fs';
const cssFile = fs.readdirSync('dist/assets').find(f => f.endsWith('.css'));
let css = fs.readFileSync(`dist/assets/${cssFile}`, 'utf8');
css = css.replace(/(^|})\s*(html|body|html,body)[^{}]*\{[^{}]*\}/g, '$1');
const tpl = fs.readFileSync('scratchpad/notebook-strips-plan.template.html', 'utf8');
const SCRATCH = '/tmp/claude-0/-home-user-Wolfson-management-app/b8d14d64-4aa3-5544-895c-576d1b3eced3/scratchpad';
fs.writeFileSync(`${SCRATCH}/notebook-strips.html`, tpl.replace('/*__APP_CSS__*/', css));
console.log('built', `${SCRATCH}/notebook-strips.html`);
