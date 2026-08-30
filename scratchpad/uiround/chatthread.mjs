/**
 * The task thread, drawn WhatsApp-style, injected into the running app.
 *
 * Returned as a string so the same builder runs in the worker's portal and in
 * the office's drawer — the owner asked for one conversation, the same in both
 * places, so there must be one drawing of it and not two.
 */
export const THREAD_JS = `(function (opts) {
  const NAVY = '#1e3a5f', ACCENT = '#4aa8d8';
  const F = 'Figtree,system-ui,sans-serif';

  // a stand-in site photo, drawn — the container has no real uploads
  function photo(w, h, tint) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, tint[0]); g.addColorStop(1, tint[1]);
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 3;
    x.strokeRect(w * .12, h * .3, w * .34, h * .5);
    x.beginPath(); x.moveTo(w * .55, h * .8); x.lineTo(w * .72, h * .34); x.lineTo(w * .9, h * .8);
    x.closePath(); x.stroke();
    return c.toDataURL('image/png');
  }

  const wrap = document.createElement('div');
  wrap.setAttribute('data-thread', '');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;padding:12px 10px;'
    + 'background:#f2f5f8;border-radius:14px;border:1px solid #e3e9f0';

  function bubble(side, o) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:' + (side === 'in' ? 'flex-start' : 'flex-end');
    const b = document.createElement('div');
    b.style.cssText = 'max-width:82%;border-radius:14px;padding:8px 10px 6px;font:14.5px/1.45 ' + F
      + ';box-shadow:0 1px 2px rgba(16,32,58,.09);'
      + (side === 'in'
          ? 'background:#fff;border:1px solid #e6ecf3;border-top-left-radius:5px'
          : 'background:#e3f2fb;border:1px solid #c9e6f8;border-top-right-radius:5px');
    if (side === 'in' && o.who) {
      const n = document.createElement('div');
      n.textContent = o.who;
      n.style.cssText = 'font:700 12.5px ' + F + ';color:' + ACCENT + ';margin-bottom:2px';
      b.appendChild(n);
    }
    if (o.img) {
      const im = document.createElement('img');
      im.src = o.img;
      im.style.cssText = 'display:block;width:100%;max-width:230px;border-radius:9px;margin-bottom:6px;cursor:pointer';
      b.appendChild(im);
      const hint = document.createElement('div');
      hint.textContent = 'Tap to open \\u00b7 download';
      hint.style.cssText = 'font:11.5px ' + F + ';color:#8a99a8;margin:-3px 0 5px';
      b.appendChild(hint);
    }
    if (o.file) {
      const f = document.createElement('div');
      f.style.cssText = 'display:flex;align-items:center;gap:9px;background:#f4f7fa;border:1px solid #e2e9f1;'
        + 'border-radius:10px;padding:8px 10px;margin-bottom:6px;cursor:pointer';
      f.innerHTML = '<span style="width:30px;height:34px;border-radius:5px;background:' + NAVY
        + ';color:#fff;font:700 9.5px ' + F + ';display:flex;align-items:center;justify-content:center;flex:0 0 auto">PDF</span>'
        + '<span style="min-width:0"><span style="display:block;font:600 13.5px ' + F
        + ';color:#1f2c3d;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + o.file + '</span>'
        + '<span style="display:block;font:11.5px ' + F + ';color:#8a99a8">' + o.size + ' \\u00b7 tap to open</span></span>'
        + '<span style="margin-left:auto;color:' + ACCENT + ';font-size:17px;flex:0 0 auto">\\u2913</span>';
      b.appendChild(f);
    }
    if (o.text) {
      const t = document.createElement('div');
      t.textContent = o.text;
      t.style.cssText = 'color:#1f2c3d';
      b.appendChild(t);
    }
    const m = document.createElement('div');
    m.textContent = o.at;
    m.style.cssText = 'font:11px ' + F + ';color:#93a2b1;text-align:right;margin-top:3px';
    b.appendChild(m);
    row.appendChild(b);
    return row;
  }

  function marker(text) {
    const d = document.createElement('div');
    d.style.cssText = 'display:flex;justify-content:center;margin:2px 0';
    d.innerHTML = '<span style="background:#dff3e6;color:#177a4b;border:1px solid #bfe6cf;border-radius:999px;'
      + 'padding:4px 12px;font:700 12px ' + F + '">' + text + '</span>';
    return d;
  }

  wrap.appendChild(bubble('in', { who: 'Esther \\u00b7 office',
    text: 'Riser is on the north wall \\u2014 Shimon has the key to the shaft.', at: '09:14' }));
  wrap.appendChild(bubble('in', { who: 'Esther \\u00b7 office',
    file: 'drain-detail-rev-C.pdf', size: '412 KB',
    text: 'Updated drain detail from the engineer.', at: '11:02' }));
  wrap.appendChild(bubble('out', {
    text: 'Got it. Starting on the riser now.', at: '11:20' }));
  if (opts && opts.closed) {
    wrap.appendChild(bubble('out', {
      img: photo(460, 300, ['#7f9bb5', '#4c6784']),
      text: 'Concealed unit in, drain run to the riser and pressure tested.', at: '15:47' }));
    wrap.appendChild(marker('\\u2713 Job closed \\u00b7 15:47'));
  }
  return wrap;
})`;
