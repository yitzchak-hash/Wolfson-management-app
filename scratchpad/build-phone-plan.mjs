// Inline the app's compiled CSS (html/body rules stripped — they would
// repaint the drafting table) and the real logo into the template.
import fs from 'node:fs';
const cssFile = fs.readdirSync('dist/assets').find(f => f.endsWith('.css'));
let css = fs.readFileSync(`dist/assets/${cssFile}`, 'utf8');
css = css.replace(/(^|})\s*(html|body|html,body)[^{}]*\{[^{}]*\}/g, '$1');
const logo = 'data:image/png;base64,' + fs.readFileSync('public/tzviair-logo.png').toString('base64');
const tpl = fs.readFileSync('scratchpad/phone-plan.template.html', 'utf8');
const SCRATCH = '/tmp/claude-0/-home-user-Wolfson-management-app/b8d14d64-4aa3-5544-895c-576d1b3eced3/scratchpad';
fs.writeFileSync(`${SCRATCH}/phone-plan.html`, tpl.replace('/*__APP_CSS__*/', css).replaceAll('__LOGO__', logo));
console.log('built', `${SCRATCH}/phone-plan.html`, (fs.statSync(`${SCRATCH}/phone-plan.html`).size / 1024).toFixed(0), 'KB');
