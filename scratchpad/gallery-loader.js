
(function () {
  'use strict';
  var SC = '<' + '/script>';
  var app = document.getElementById('app');
  app.innerHTML = document.getElementById('page-src').textContent;

  function readPins() {
    try { return (JSON.parse(document.getElementById('pin-data').textContent).pins) || []; }
    catch (e) { return []; }
  }
  var published = readPins();
  var unsent = [];
  try {
    var stash = JSON.parse(sessionStorage.getItem('dg_unsent') || '[]');
    unsent = stash.filter(function (p) {
      return !published.some(function (q) { return q.id === p.id; });
    });
    sessionStorage.setItem('dg_unsent', JSON.stringify(unsent));
  } catch (e) { unsent = []; }
  function allPins() { return published.concat(unsent); }
  function saveStash() { try { sessionStorage.setItem('dg_unsent', JSON.stringify(unsent)); } catch (e) {} }

  // ── the bottom bar ──
  var bar = document.createElement('div');
  bar.id = 'pinbar';
  bar.innerHTML = '<button id="notemode" type="button">\uD83D\uDCCC Note a change</button>' +
    '<span id="pincount"></span>' +
    '<button id="sendpins" type="button" hidden>Send to Claude</button>' +
    '<span id="pinstatus"></span>';
  document.body.appendChild(bar);
  var modeBtn = document.getElementById('notemode');
  var sendBtn = document.getElementById('sendpins');
  var countEl = document.getElementById('pincount');
  var statusEl = document.getElementById('pinstatus');

  var artifactNS = null, nsReady = false;
  if (window.claude && window.claude.use) {
    window.claude.use('artifact').then(function (ns) { artifactNS = ns; nsReady = true; refresh(); });
  } else { nsReady = true; }

  function refresh() {
    var open = allPins().filter(function (p) { return !p.done; }).length;
    var doneN = allPins().length - open;
    countEl.textContent = open ? (open + ' note' + (open > 1 ? 's' : '') + (doneN ? ' \u00b7 ' + doneN + ' done' : '')) : (doneN ? doneN + ' done' : 'No notes yet');
    countEl.style.font = '600 13.5px Figtree,sans-serif';
    sendBtn.hidden = !(unsent.length && artifactNS);
    sendBtn.textContent = 'Send to Claude (' + unsent.length + ')';
    if (unsent.length && nsReady && !artifactNS) {
      statusEl.textContent = 'Open this page on claude.ai to send your notes.';
    }
    renderPins();
  }

  modeBtn.addEventListener('click', function () {
    document.body.classList.toggle('pinning');
    modeBtn.textContent = document.body.classList.contains('pinning')
      ? 'Tap a spot on a picture\u2026' : '\uD83D\uDCCC Note a change';
  });

  // ── pins on the pictures ──
  function renderPins() {
    var dots = document.querySelectorAll('.pindot');
    for (var i = 0; i < dots.length; i++) dots[i].remove();
    var list = allPins();
    for (var j = 0; j < list.length; j++) {
      var p = list[j];
      var wrap = document.querySelector('.shotwrap[data-shot="' + p.shot + '"]');
      if (!wrap) continue;
      var d = document.createElement('button');
      d.type = 'button';
      d.className = 'pindot' + (p.done ? ' done' : '');
      d.style.left = p.x + '%';
      d.style.top = p.y + '%';
      d.textContent = p.done ? '\u2713' : String(j + 1);
      d.title = p.text;
      (function (pin) {
        d.addEventListener('click', function (e) { e.stopPropagation(); openPopup(pin, null, e.clientX, e.clientY); });
      })(p);
      wrap.appendChild(d);
    }
  }

  app.addEventListener('click', function (e) {
    if (!document.body.classList.contains('pinning')) return;
    var wrap = e.target.closest ? e.target.closest('.shotwrap') : null;
    if (!wrap) return;
    var img = wrap.querySelector('img');
    var r = img.getBoundingClientRect();
    var x = Math.round(((e.clientX - r.left) / r.width) * 1000) / 10;
    var y = Math.round(((e.clientY - r.top) / r.height) * 1000) / 10;
    if (x < 0 || x > 100 || y < 0 || y > 100) return;
    document.body.classList.remove('pinning');
    modeBtn.textContent = '\uD83D\uDCCC Note a change';
    openPopup(null, { shot: wrap.getAttribute('data-shot'), dev: wrap.getAttribute('data-dev'),
      scr: wrap.getAttribute('data-scr'), x: x, y: y }, e.clientX, e.clientY);
  });

  // ── the popup ──
  var popup = null, rec = null;
  function closePopup() {
    if (rec) { try { rec.stop(); } catch (e) {} rec = null; }
    if (popup) { popup.remove(); popup = null; }
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePopup(); });

  function openPopup(existing, fresh, cx, cy) {
    closePopup();
    popup = document.createElement('div');
    popup.id = 'pinpopup';
    var where = existing ? (existing.device + ' \u00b7 ' + existing.screen) : (fresh.dev + ' \u00b7 ' + fresh.scr);
    var ro = existing && published.indexOf(existing) !== -1;
    popup.innerHTML = '<h3>' + (existing ? (existing.done ? 'Done \u2713' : 'Change note') : 'What should change here?') + '</h3>' +
      '<p class="where">' + where + '</p>' +
      '<textarea' + (ro ? ' readonly' : '') + ' placeholder="Type the change\u2026"></textarea>' +
      '<div class="row"></div><p class="pp-note"></p>';
    document.body.appendChild(popup);
    var ta = popup.querySelector('textarea');
    var row = popup.querySelector('.row');
    var note = popup.querySelector('.pp-note');
    if (existing) ta.value = existing.text;
    if (existing && existing.doneNote) note.textContent = 'Claude: ' + existing.doneNote;

    function btn(cls, label, fn) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = cls; b.textContent = label;
      b.addEventListener('click', fn); row.appendChild(b); return b;
    }

    if (!ro) {
      var SRCls = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SRCls) {
        var lang = 'en-US';
        try { lang = localStorage.getItem('dg_lang') || 'en-US'; } catch (e) {}
        var micBtn = btn('pp-mic', '\uD83C\uDFA4 Speak', function () {
          if (rec) { try { rec.stop(); } catch (e) {} return; }
          try {
            rec = new SRCls();
            rec.lang = lang; rec.interimResults = false; rec.continuous = true;
            var base = ta.value;
            rec.onresult = function (ev) {
              var t = '';
              for (var i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
              ta.value = (base ? base + ' ' : '') + t;
            };
            rec.onerror = function () { note.textContent = 'The microphone is not available here \u2014 typing works.'; stopRec(); };
            rec.onend = stopRec;
            micBtn.classList.add('rec'); micBtn.textContent = '\u25A0 Stop';
            rec.start();
          } catch (e) { note.textContent = 'The microphone is not available here \u2014 typing works.'; }
        });
        function stopRec() { rec = null; micBtn.classList.remove('rec'); micBtn.textContent = '\uD83C\uDFA4 Speak'; }
        var langs = [['en-US', 'EN'], ['he-IL', '\u05e2\u05d1']];
        for (var li = 0; li < langs.length; li++) {
          (function (code, label) {
            var lb = btn('pp-lang' + (lang === code ? ' on' : ''), label, function () {
              lang = code;
              try { localStorage.setItem('dg_lang', code); } catch (e) {}
              var ls = row.querySelectorAll('.pp-lang');
              for (var k = 0; k < ls.length; k++) ls[k].classList.remove('on');
              lb.classList.add('on');
            });
          })(langs[li][0], langs[li][1]);
        }
      }
      btn('pp-save', existing ? 'Save' : 'Add note', function () {
        var text = ta.value.trim();
        if (!text) { note.textContent = 'Type or dictate the change first.'; return; }
        if (existing) { existing.text = text; }
        else {
          unsent.push({ id: 'pin-' + Date.now() + '-' + Math.floor(Math.random() * 1e5),
            shot: fresh.shot, device: fresh.dev, screen: fresh.scr,
            x: fresh.x, y: fresh.y, text: text, at: new Date().toISOString(), done: false });
        }
        saveStash(); closePopup(); refresh();
      });
      if (existing) btn('pp-del', 'Delete', function () {
        unsent = unsent.filter(function (p) { return p !== existing; });
        saveStash(); closePopup(); refresh();
      });
    }
    btn('pp-cancel', 'Close', closePopup);
    var w = Math.min(360, window.innerWidth * 0.92);
    popup.style.left = Math.max(8, Math.min(cx - w / 2, window.innerWidth - w - 8)) + 'px';
    popup.style.top = Math.max(8, Math.min(cy + 14, window.innerHeight - 240)) + 'px';
    if (!ro) ta.focus();
  }

  // ── sending: the page publishes a new version of itself ──
  function buildDoc(pins) {
    var pinJson = JSON.stringify({ pins: pins }).replace(/</g, '\\u003c');
    var pageSrc = document.getElementById('page-src').textContent;
    var styleText = document.getElementById('gallery-style').textContent;
    var fontHref = document.getElementById('gallery-fonts').getAttribute('href');
    var loaderText = document.getElementById('gallery-loader').textContent;
    return '<!doctype html>' + String.fromCharCode(10) +
      '<html><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>Device Gallery</title>' +
      '<link id="gallery-fonts" rel="stylesheet" href="' + fontHref + '">' +
      '<style id="gallery-style">' + styleText + '</style>' +
      '</head><body>' +
      '<div class="wrap" id="app"></div>' +
      '<script type="text/x-page" id="page-src">' + pageSrc + SC +
      '<script type="application/json" id="pin-data">' + pinJson + SC +
      '<script id="gallery-loader">' + loaderText + SC +
      '</body></html>';
  }

  var sending = false;
  sendBtn.addEventListener('click', function () {
    if (sending || !artifactNS || !unsent.length) return;
    sending = true;
    saveStash();
    statusEl.textContent = 'Saving your notes\u2026';
    artifactNS.publish(buildDoc(allPins())).then(function () {
      statusEl.textContent = 'Saved.';
    }).catch(function (err) {
      sending = false;
      var code = err && err.code;
      if (code === 'conflict') { statusEl.textContent = 'Someone updated the page \u2014 reloading\u2026'; return; }
      if (code === 'not_writer' || code === 'not_granted') { statusEl.textContent = 'This view is read-only \u2014 notes cannot be saved from here.'; sendBtn.hidden = true; return; }
      if (code === 'rate_limited') { statusEl.textContent = 'Saving too fast \u2014 wait a moment and press again.'; return; }
      statusEl.textContent = 'Saving failed \u2014 press Send again.';
    });
  });

  refresh();
})();
