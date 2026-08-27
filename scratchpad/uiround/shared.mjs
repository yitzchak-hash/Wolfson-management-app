import { readFileSync, existsSync } from 'fs';
export const img = f => existsSync('scratchpad/' + f)
  ? `data:image/png;base64,${readFileSync('scratchpad/' + f).toString('base64')}` : null;

/** The one look both pages share. Company navy/blue, orange for the owner's
 *  own notes (the same orange his pins wear in the gallery), green for locked. */
export const STYLE = `
:root{
  --paper:#f1f4f8; --card:#ffffff; --ink:#182838; --muted:#5b6b7d;
  --navy:#1e3a5f; --blue:#4aa8d8; --line:#d9e1ea;
  --good:#177a4b; --good-bg:#e5f4ec;
  --pin:#c2560f; --pin-bg:#fdf1e7; --pin-line:#f0c9a8;
  --shot-bg:#e6ecf3;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --paper:#0e1826; --card:#16233a; --ink:#e8eef5; --muted:#9fb0c2;
    --navy:#7db4dd; --blue:#4aa8d8; --line:#28374e;
    --good:#5ecb96; --good-bg:#12311f;
    --pin:#f0a163; --pin-bg:#2a1a0d; --pin-line:#5a3a1c;
    --shot-bg:#0a1420;
  }
}
:root[data-theme="dark"]{
  --paper:#0e1826; --card:#16233a; --ink:#e8eef5; --muted:#9fb0c2;
  --navy:#7db4dd; --blue:#4aa8d8; --line:#28374e;
  --good:#5ecb96; --good-bg:#12311f;
  --pin:#f0a163; --pin-bg:#2a1a0d; --pin-line:#5a3a1c;
  --shot-bg:#0a1420;
}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.6 Figtree,system-ui,sans-serif}
.wrap{max-width:820px;margin:0 auto;padding:36px 18px 72px}
h1{font-family:Archivo,system-ui,sans-serif;font-size:clamp(28px,5.4vw,40px);font-weight:800;line-height:1.14;margin:8px 0 10px;text-wrap:balance}
h2{font-family:Archivo,system-ui,sans-serif;font-size:20px;font-weight:700;line-height:1.2;margin:0 0 6px;text-wrap:balance}
h3{font-family:Archivo,system-ui,sans-serif;font-size:15.5px;font-weight:700;margin:0 0 4px}
.eyebrow{font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--blue)}
.lede{max-width:60ch;color:var(--muted);font-size:17px;margin:0 0 26px}
p{max-width:64ch}
.tag{display:inline-block;font-size:12px;font-weight:700;padding:3px 10px;border-radius:999px;letter-spacing:.02em}
.tag.pin{background:var(--pin-bg);color:var(--pin)}
.tag.good{background:var(--good-bg);color:var(--good)}
.tag.wait{background:var(--line);color:var(--muted)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin:0 0 18px}
.card p{color:var(--muted);margin:8px 0 0}
.card p strong{color:var(--ink)}
.quote{border-left:3px solid var(--pin);background:var(--pin-bg);border-radius:0 8px 8px 0;padding:10px 14px;margin:12px 0 0;font-size:15px;color:var(--ink)}
.quote .who{display:block;font-size:11.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--pin);margin-bottom:3px}
.crop{display:block;width:100%;max-width:260px;border-radius:8px;border:1px solid var(--line);background:var(--shot-bg);margin:12px 0 0}
.pair{display:grid;grid-template-columns:1fr;gap:14px;margin:14px 0 0}
@media (min-width:660px){ .pair{grid-template-columns:1fr 1fr} }
.pane{min-width:0}
.pane img{display:block;width:100%;border-radius:8px;border:1px solid var(--line);background:var(--shot-bg)}
.plabel{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;margin:0 0 7px}
.plabel .dot{width:9px;height:9px;border-radius:50%;flex:0 0 auto}
.now .dot{background:#c0392b} .now{color:#c0392b}
.aft .dot{background:var(--good)} .aft{color:var(--good)}
.cap{font-size:13px;color:var(--muted);margin:7px 0 0}
.rule{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--blue);border-radius:12px;padding:18px 20px;margin:18px 0}
.rule h3{color:var(--blue)}
table{width:100%;border-collapse:collapse;margin:12px 0 0;font-size:14.5px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line)}
th{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:700}
td:last-child{font-weight:600}
.scroll{overflow-x:auto}
section{margin:0 0 40px;border-top:1px solid var(--line);padding-top:24px}
.ask{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin:26px 0 0}
.ask ol{margin:10px 0 0;padding-left:20px;color:var(--muted)}
.ask li{margin:6px 0}
.ask li strong{color:var(--ink)}
.empty{border:1.5px dashed var(--line);border-radius:12px;padding:30px 20px;text-align:center;color:var(--muted)}
.empty .big{font-family:Archivo;font-weight:700;font-size:18px;color:var(--ink);margin-bottom:6px}
`;
export const HEAD = (title) => `<title>${title}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Figtree:wght@400;500;600;700&display=swap">
<style>${STYLE}</style>`;
