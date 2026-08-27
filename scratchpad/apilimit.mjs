// Vercel's Hobby plan allows AT MOST 12 serverless functions per deployment.
// Every .js file under /api is one function, and the 13th turns EVERY
// deployment red — while local `tsc && vite build` stays green, because the
// local build never touches /api. That is exactly how production silently
// stopped updating for a full day (photos-cover.js was the 13th).
//
// Run this before shipping anything that adds an /api file. Adding a route
// means folding it into an existing one or retiring another first.
import { readdirSync } from 'node:fs';

const LIMIT = 12;
const fns = readdirSync('api').filter(f => f.endsWith('.js'));
console.log(`${fns.length}/${LIMIT} serverless functions:`, fns.join(', '));
if (fns.length > LIMIT) {
  console.log(`\nFAIL — ${fns.length} functions; Vercel Hobby refuses the deployment past ${LIMIT}.`);
  process.exit(1);
}
console.log('\nOK — within the Hobby limit.');
