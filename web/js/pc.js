/* Stitch Studio Desktop — PC shell around the shared editor (app.js).
   Adds: menus, docked layers panel with drag-to-reorder, rulers, status bar,
   keyboard shortcuts, drag & drop, clipboard, sew-out simulation, PNG mockups,
   production worksheet, save-to-folder. */
(function () {
  'use strict';
  let ctxPt = null;
  const SS = window.SS; if (!SS) return;
  const $ = s => document.querySelector(s);
  const IN = 25.4, ACTUAL = 96 / 25.4;   // CSS px per mm at 100%
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const inch = mm => (mm / IN).toFixed(2);
  const TYPE = { fill: 'Fill', satin: 'Satin', run: 'Line', text: 'Text', stitches: 'Stitches', import: 'Imported design' };

  // ---------------- dropdown menus
  const closeDD = () => { document.querySelectorAll('.dd.open').forEach(d => d.classList.remove('open')); document.querySelectorAll('.mb.open').forEach(b => b.classList.remove('open')); };
  document.querySelectorAll('[data-dd]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation(); const dd = $('#' + b.dataset.dd), was = dd.classList.contains('open'); closeDD(); $('#menu').classList.remove('open');
    if (was) return; const r = b.getBoundingClientRect(); dd.style.left = r.left + 'px'; dd.style.top = r.bottom + 2 + 'px'; dd.classList.add('open'); b.classList.add('open');
  }));
  $('#bMenu').addEventListener('click', closeDD);
  document.addEventListener('click', e => { if (!e.target.closest('.dd')) closeDD(); });
  document.querySelectorAll('.dd [data-cmd]').forEach(b => b.addEventListener('click', () => { closeDD(); run(b.dataset.cmd); }));

  // ---------------- commands
  let clip = null;
  const selObj = () => SS.sel();
  function moveTo(o, idx) { const d = SS.doc(), i = d.objects.indexOf(o); if (i < 0) return; d.objects.splice(i, 1); d.objects.splice(Math.max(0, Math.min(d.objects.length, idx)), 0, o); SS.commit(); SS.renderSheet(); SS.draw(); }
  // center the selected layer — or the selected picture, or (nothing selected) the whole design — in the hoop
  function centerSel(axis) {
    const o = selObj(), h = SS.hoop(), d = SS.doc();
    const go = (b, apply) => { const dx = axis === 'v' ? 0 : h.w / 2 - (b[0] + b[2]) / 2, dy = axis === 'h' ? 0 : h.h / 2 - (b[1] + b[3]) / 2; apply(dx, dy); };
    if (o) { go(SS.bbox(o), (dx, dy) => SS.translate(o, dx, dy)); SS.commit(); SS.draw(); SS.toast('Centered ' + (o.name || 'layer')); return; }
    if (SS.bgSelected && SS.bgSelected() && d.bg) { const b = d.bg; go([b.x, b.y, b.x + b.w, b.y + b.h], (dx, dy) => { b.x += dx; b.y += dy; }); SS.autosave(); SS.draw(); SS.toast('Centered picture'); return; }
    const ds = SS.design(); if (!ds.count) { SS.toast('Select a layer or the picture first'); return; }
    go(ds.bounds, (dx, dy) => d.objects.forEach(x => SS.translate(x, dx, dy))); SS.commit(); SS.draw(); SS.toast('Centered whole design');
  }
  function centerOf(o) { const b = SS.bbox(o); return b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : null; }
  function run(cmd) {
    const o = selObj(), d = SS.doc(), h = SS.hoop();
    if (!o && SS.bgSelected() && (cmd === 'last' || cmd === 'later')) { SS.picTop(true); return; }
    if (!o && SS.bgSelected() && (cmd === 'first' || cmd === 'earlier')) { SS.picTop(false); return; }
    if (!o && ['dup', 'del', 'earlier', 'later', 'first', 'last'].includes(cmd)) { SS.toast('Select a layer first (click it on the canvas or in Layers)'); return; }
    switch (cmd) {
      case 'undo': SS.undo(); break;
      case 'redo': SS.redo(); break;
      case 'copy': if (!o) { SS.toast('Select a layer first'); break; } if (o) { clip = JSON.stringify(o); SS.toast('Copied ' + (o.name || TYPE[o.type])); } break;
      case 'paste': if (clip) { const c = JSON.parse(clip); delete c.id; SS.translate(c, 4, 4); SS.addObject(c); clip = JSON.stringify(c); } break;
      case 'dup': if (o) { const c = JSON.parse(JSON.stringify(o)); delete c.id; SS.translate(c, 4, 4); SS.addObject(c); } break;
      case 'del': if (o) { d.objects = d.objects.filter(x => x !== o); SS.select(null); SS.commit(); } break;
      case 'earlier': if (o) SS.move(o, -1); break;
      case 'later': if (o) SS.move(o, 1); break;
      case 'first': if (o) { moveTo(o, 0); SS.toast('At the bottom — sews first'); } break;
      case 'last': if (o) { moveTo(o, d.objects.length); SS.toast('On top — sews last'); } break;
      case 'center': centerSel('both'); break;
      case 'centerH': centerSel('h'); break;
      case 'centerV': centerSel('v'); break;
      case 'centerAll': { if (!SS.design().count) { SS.toast('Nothing to center yet'); break; } const ds = SS.design(); if (!ds.count) break; const b = ds.bounds, dx = h.w / 2 - (b[0] + b[2]) / 2, dy = h.h / 2 - (b[1] + b[3]) / 2; d.objects.forEach(x => SS.translate(x, dx, dy)); SS.commit(); SS.draw(); break; }
      case 'deselect': SS.select(null); break;
      case 'fit': SS.fit(); break;
      case 'actual': SS.zoomTo(ACTUAL); break;
      case 'zin': SS.zoomTo(SS.view().s * 1.25); break;
      case 'zout': SS.zoomTo(SS.view().s / 1.25); break;
      case 'real': $('#bReal').click(); break;
      case 'preview': $('#bPreview').click(); break;
      case 'sim': toggleSim(); break;
      case 'pic': SS.toggleBg(); break;
      case 'fabric': fabricModal(); break;
      case 'hoop': $('#hoopChip').click(); break;
      case 'png': exportPNG(); break;
      case 'sheet': worksheet(); break;
      case 'saveas': saveProject(true); break;
      case 'threads': threadModal(); break;
      case 'knockout': { const d = SS.doc(); d.knockout = d.knockout === false; SS.commit(); SS.invalidate(); syncKnock(); SS.draw(); SS.toast(d.knockout === false ? 'Hidden stitches kept (everything sews)' : 'Stitching that a later layer covers is removed'); break; }
      case 'keys': keysModal(); break;
      case 'picTop': SS.picTop(true); break;
      case 'picBottom': SS.picTop(false); break;
      case 'patch': patchModal(); break;
      case 'isolate': { const o2 = SS.sel(); if (o2 && ctxPt) SS.isolateAt(o2, ctxPt); break; }
      case 'wrap': { const o2 = SS.sel(); if (o2 && o2.type === 'fill') { o2.wrap = !o2.wrap; if (o2.wrap) { delete o2.flow; if (!o2.satinLook) { o2.satinLook = true; o2.stitchLen = 12; o2.pullComp = 0.15; } } SS.commit(); SS.renderSheet(); SS.draw(); SS.toast(o2.wrap ? 'Thread now wraps around the shape' : 'Thread back to one straight angle'); } break; }
      case 'restitch': { const o2 = SS.sel(); if (o2 && (o2.type === 'import' || o2.type === 'stitches')) SS.restitch(o2); else SS.toast('Select an imported design first'); break; }
      case 'outline': outlineModal(); break;
      case 'guide': document.querySelector('#menu [data-act=help]').click(); break;
    }
  }

  // ---------------- toolbar buttons
  $('#pOpen').addEventListener('click', openProject);
  $('#pSave').addEventListener('click', () => saveProject(false));
  $('#pVp3').addEventListener('click', () => SS.exportFile('vp3'));
  $('#pDst').addEventListener('click', () => SS.exportFile('dst'));
  $('#zoomSel').addEventListener('change', e => { const v = e.target.value; if (v === 'fit') SS.fit(); else if (v) SS.zoomTo(ACTUAL * +v); e.target.value = ''; });
  $('#pPatch').addEventListener('click', () => run('patch'));
  $('#pOutline').addEventListener('click', () => run('outline'));
  $('#lUp').addEventListener('click', () => run('earlier'));
  $('#lDown').addEventListener('click', () => run('later'));
  $('#lDup').addEventListener('click', () => run('dup'));
  $('#lDel').addEventListener('click', () => run('del'));

  // ---------------- keyboard shortcuts
  let spaceDown = false;
  const typing = e => /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'range';
  window.addEventListener('keydown', e => {
    if (typing(e)) return;
    const k = e.key, c = e.ctrlKey || e.metaKey;
    if (k === ' ') { spaceDown = true; e.preventDefault(); return; }
    if (c && k.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); run('undo'); return; }
    if (c && (k.toLowerCase() === 'y' || (k.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); run('redo'); return; }
    if (c && k.toLowerCase() === 's') { e.preventDefault(); saveProject(e.shiftKey); return; }
    if (c && k.toLowerCase() === 'o') { e.preventDefault(); openProject(); return; }
    if (c && k.toLowerCase() === 'e') { e.preventDefault(); SS.exportFile('vp3'); return; }
    if (c && k.toLowerCase() === 'n') { e.preventDefault(); document.querySelector('#menu [data-act=new]').click(); return; }
    if (c && k.toLowerCase() === 'c' && e.shiftKey) { e.preventDefault(); run('center'); return; }
    if (c && k.toLowerCase() === 'c') { if (selObj()) { e.preventDefault(); run('copy'); } return; }
    if (c && k.toLowerCase() === 'v') { return; }   // handled by paste event (pictures) / below
    if (c && k.toLowerCase() === 'd') { e.preventDefault(); run('dup'); return; }
    if (c && (k === '0')) { e.preventDefault(); run('fit'); return; }
    if (c && (k === '1')) { e.preventDefault(); run('actual'); return; }
    if (c && (k === '=' || k === '+')) { e.preventDefault(); run('zin'); return; }
    if (c && (k === '-' || k === '_')) { e.preventDefault(); run('zout'); return; }
    if (c) return;
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); run('del'); return; }
    if (k === 'Escape') { if (SS.alignCancel) SS.alignCancel(); run('deselect'); return; }
    if (k === '[') { run(e.shiftKey ? 'first' : 'earlier'); return; }
    if (k === ']') { run(e.shiftKey ? 'last' : 'later'); return; }
    if (k === '{') { run('first'); return; }
    if (k === '}') { run('last'); return; }
    if (k === '?') { keysModal(); return; }
    if (k.startsWith('Arrow')) { const o = selObj(); if (!o) return; e.preventDefault(); const st = e.shiftKey ? 1 : 0.1; SS.translate(o, k === 'ArrowLeft' ? -st : k === 'ArrowRight' ? st : 0, k === 'ArrowUp' ? -st : k === 'ArrowDown' ? st : 0); SS.draw(); clearTimeout(nudgeT); nudgeT = setTimeout(() => SS.commit(), 500); return; }
    if (k === 'Enter' && SS.hasDraft && SS.hasDraft()) { e.preventDefault(); SS.finishDraft(); return; }
    const tools = { v: 'select', i: 'pick', b: 'brush', d: 'draw', t: 'text', a: 'auto', l: 'layers', s: 'stream' };
    const t = tools[k.toLowerCase()]; if (t) { document.querySelector(`#tools [data-tool=${t}]`).click(); return; }
    if (k.toLowerCase() === 'r') run('real');
    if (k.toLowerCase() === 'p') run('preview');
    if (k.toLowerCase() === 'g') run('sim');
    if (k.toLowerCase() === 'h') run('pic');
    if (k.toLowerCase() === 'm') run('patch');
    if (k.toLowerCase() === 'o') run('outline');
  });
  let nudgeT = 0;
  window.addEventListener('keyup', e => { if (e.key === ' ') spaceDown = false; });

  // ---------------- pan with space-drag or middle mouse (captured before the editor sees it)
  const stage = $('#stage'); let panning = null;
  stage.addEventListener('pointerdown', e => {
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      e.preventDefault(); e.stopPropagation(); panning = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, mid: e.button === 1 }; stage.setPointerCapture(e.pointerId); stage.style.cursor = 'grabbing';
    }
  }, true);
  stage.addEventListener('pointermove', e => { if (panning) { e.stopPropagation(); SS.pan(e.clientX - panning.x, e.clientY - panning.y); panning = { x: e.clientX, y: e.clientY }; } }, true);
  stage.addEventListener('pointerup', e => {
    if (!panning) return;
    e.stopPropagation();
    const click = panning.mid && Math.hypot(e.clientX - panning.sx, e.clientY - panning.sy) < 5;
    panning = null; stage.style.cursor = '';
    // middle-click (no drag) in Select on a point: line up points (A, then B)
    if (click && SS.tool() === 'select') { const r = SS.cv.getBoundingClientRect(); SS.alignPick(SS.toMM(e.clientX - r.left, e.clientY - r.top)); }
  }, true);
  stage.addEventListener('auxclick', e => e.preventDefault());

  // ---------------- right-click context menu
  const ctx = document.createElement('div'); ctx.className = 'dd'; document.body.appendChild(ctx);
  SS.cv.addEventListener('contextmenu', e => {
    e.preventDefault(); closeDD();
    const r = SS.cv.getBoundingClientRect(), p = SS.toMM(e.clientX - r.left, e.clientY - r.top), o = SS.hitObject(p); ctxPt = p;
    if (o) SS.select(o.id);
    ctx.innerHTML = o ? `<div class="small" style="padding:4px 10px">${esc(o.name || TYPE[o.type])}</div>
      <button class="it" data-c="last"><b>Bring to top</b><span class="k">Shift+]</span></button><button class="it" data-c="first">Send to bottom<span class="k">Shift+[</span></button><hr>
      <button class="it" data-c="copy">Copy<span class="k">Ctrl+C</span></button><button class="it" data-c="dup">Duplicate<span class="k">Ctrl+D</span></button>
      <button class="it" data-c="center">Center in hoop</button>${(o.type === 'fill' && o.paths.length > 1) || (o.type === 'import' && o.blocks.length > 1) ? `<button class="it" data-c="isolate"><b>✂ Isolate this ${o.type === 'import' ? 'colour' : 'part'}</b></button>` : ''}${o.type === 'fill' ? `<button class="it" data-c="wrap">${o.wrap ? 'Straight thread angle' : '↻ Wrap thread around shape'}</button>` : ''}${o.type === 'import' || o.type === 'stitches' ? '<button class="it" data-c="restitch"><b>✨ Re-stitch at this size</b></button>' : ''}<hr>
      <button class="it" data-c="later">Bring forward one</button><button class="it" data-c="earlier">Send back one</button><hr>
      <button class="it" data-c="del">Delete<span class="k">Del</span></button>${SS.doc().bg ? (SS.doc().bgOnTop ? '<hr><button class="it" data-c="picBottom">Send picture to bottom</button>' : '<hr><button class="it" data-c="picTop">Bring picture to top</button>') : ''}`
      : `${clip ? '<button class="it" data-c="paste">Paste layer<span class="k">Ctrl+V</span></button>' : ''}<button class="it" data-c="fit">Fit hoop</button><button class="it" data-c="centerAll">Center whole design</button><button class="it" data-c="pic">Show / hide picture</button>${SS.doc().bg ? (SS.doc().bgOnTop ? '<hr><button class="it" data-c="picBottom"><b>Send picture to bottom</b></button>' : '<hr><button class="it" data-c="picTop"><b>Bring picture to top</b></button>') : ''}`;
    ctx.style.left = e.clientX + 'px'; ctx.style.top = e.clientY + 'px'; ctx.classList.add('open');
    ctx.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => { ctx.classList.remove('open'); run(b.dataset.c); }));
  });
  document.addEventListener('pointerdown', e => { if (!e.target.closest('.dd')) ctx.classList.remove('open'); });

  // ---------------- clipboard: paste a picture (screenshot / copied image) or a copied layer
  window.addEventListener('paste', e => {
    if (typing(e)) return;
    const items = [...(e.clipboardData ? e.clipboardData.items : [])], img = items.find(i => i.type.startsWith('image/'));
    if (img) { const f = img.getAsFile(), r = new FileReader(); r.onload = () => { SS.loadImageDataURL(r.result, 'Pasted picture'); SS.toast('Picture pasted — trace it or Auto-digitize'); }; r.readAsDataURL(f); e.preventDefault(); return; }
    if (clip) { run('paste'); e.preventDefault(); }
  });

  // ---------------- drag & drop files
  let dragDepth = 0;
  window.addEventListener('dragenter', e => { if ([...e.dataTransfer.types].includes('Files')) { dragDepth++; $('#drop').classList.add('on'); } });
  window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#drop').classList.remove('on'); } });
  window.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  window.addEventListener('drop', e => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault(); dragDepth = 0; $('#drop').classList.remove('on');
    [...e.dataTransfer.files].forEach(f => {
      const ext = f.name.split('.').pop().toLowerCase();
      if (f.type.startsWith('image/')) SS.openFileInput('#fImage', f);
      else if (ext === 'vp3' || ext === 'dst') SS.openFileInput('#fEmb', f);
      else if (ext === 'json' || ext === 'stitch') SS.openFileInput('#fProject', f);
      else SS.toast('Not a file Stitch Studio can open: ' + f.name);
    });
  });

  // ---------------- save / open with real files (File System Access API when available)
  let fileHandle = null;
  async function saveProject(asNew) {
    const data = JSON.stringify(Object.assign({ app: 'StitchStudio', v: 1 }, SS.doc()));
    if (window.showSaveFilePicker) {
      try {
        if (!fileHandle || asNew) fileHandle = await showSaveFilePicker({ suggestedName: SS.safeName() + '.stitch.json', types: [{ description: 'Stitch Studio project', accept: { 'application/json': ['.json'] } }] });
        const w = await fileHandle.createWritable(); await w.write(data); await w.close();
        SS.toast('Saved ' + fileHandle.name); return;
      } catch (err) { if (err && err.name === 'AbortError') return; }
    }
    SS.saveBytes(SS.safeName() + '.stitch.json', new TextEncoder().encode(data), 'application/json');
  }
  async function openProject() {
    if (window.showOpenFilePicker) {
      try {
        const [h] = await showOpenFilePicker({ types: [{ description: 'Stitch Studio project', accept: { 'application/json': ['.json'] } }] });
        const f = await h.getFile(); const d = JSON.parse(await f.text()); delete d.app; delete d.v;
        SS.setDoc(d); fileHandle = h; SS.toast('Opened ' + f.name); return;
      } catch (err) { if (err && err.name === 'AbortError') return; }
    }
    $('#fProject').click();
  }

  // ---------------- layers panel (always visible), drag to reorder
  let layerSig = '', dragFrom = null;
  function renderLayers() {
    const d = SS.doc(), sid = SS.selId();
    const sig = JSON.stringify(d.objects.map(o => [o.id, o.name, o.color, o.hidden, o.type, o.blocks ? o.blocks.map(b => b.color) : 0])) + '|' + sid + '|' + !!d.bg + !!d.bgOnTop + !!d.bgHidden + SS.bgSelected();
    if (sig === layerSig) return; layerSig = sig;
    const box = $('#pcLayers');
    if (!d.objects.length && !d.bg) { box.innerHTML = '<div class="small" style="padding:12px">No layers yet. Open a picture (Ctrl+O / drop it here), then trace it, Pick colours or Auto-digitize.</div>'; return; }
    box.innerHTML = d.objects.map((o, i) => {
      const dot = o.type === 'import' ? `conic-gradient(${o.blocks.map((b, k) => `${b.color} ${k / o.blocks.length * 100}% ${(k + 1) / o.blocks.length * 100}%`).join(',')})` : o.color;
      return `<div class="lr ${o.id === sid ? 'on' : ''} ${o.hidden ? 'hid' : ''}" draggable="true" data-id="${o.id}">
        <span class="num">${i + 1}</span><span class="dot" style="background:${dot}"></span>
        <span class="nm"><b>${esc(o.name || TYPE[o.type])}</b><small>${TYPE[o.type] || o.type}${o.type === 'fill' ? (o.satinLook ? ' · satin' : ' · tatami') : ''}</small></span>
        <button class="eye" data-eye="1" title="Show / hide"><svg viewBox="0 0 24 24">${o.hidden ? '<path d="M3 3l18 18"/><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" opacity=".4"/>' : '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'}</svg></button></div>`;
    }).join('');
    if (d.bg) {
      const row = `<div class="lr ${SS.bgSelected() ? 'on' : ''} ${d.bgHidden ? 'hid' : ''}" data-pic="1"><span class="num">–</span><span class="dot" style="background:#666;border-radius:4px"></span>
        <span class="nm"><b>Picture (not stitched)</b><small>${d.bgOnTop ? 'on top · see-through' : 'underneath'}</small></span>
        <button class="eye" data-pt="1" title="${d.bgOnTop ? 'Send to bottom' : 'Bring to top'}"><svg viewBox="0 0 24 24">${d.bgOnTop ? '<path d="m6 9 6 6 6-6"/>' : '<path d="m6 15 6-6 6 6"/>'}</svg></button>
        <button class="eye" data-pe="1" title="Show / hide"><svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button></div>`;
      box.innerHTML = d.bgOnTop ? box.innerHTML + row : row + box.innerHTML;
      const pr = box.querySelector('[data-pic]');
      pr.addEventListener('click', e => { if (e.target.closest('[data-pt]')) { SS.picTop(); return; } if (e.target.closest('[data-pe]')) { SS.toggleBg(); layerSig = ''; renderLayers(); return; } if (SS.tool() !== 'select') SS.setTool('select', true); SS.selectPic(); });
    }
    box.querySelectorAll('.lr[data-id]').forEach(el => {
      const o = d.objects.find(x => x.id === +el.dataset.id);
      el.addEventListener('click', e => { if (e.target.closest('[data-eye]')) { o.hidden = !o.hidden; SS.commit(); SS.draw(); return; } if (SS.tool() !== 'select') SS.setTool('select', true); SS.select(o.id); });
      el.addEventListener('dblclick', e => { if (e.target.closest('[data-eye]')) return; const n = prompt('Layer name', o.name || ''); if (n != null) { o.name = n; SS.commit(); SS.renderSheet(); SS.draw(); } });
      el.addEventListener('dragstart', e => { dragFrom = o; e.dataTransfer.effectAllowed = 'move'; });
      el.addEventListener('dragover', e => { if (dragFrom) { e.preventDefault(); el.classList.add('dragover'); } });
      el.addEventListener('dragleave', () => el.classList.remove('dragover'));
      el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('dragover'); if (dragFrom && dragFrom !== o) { moveTo(dragFrom, d.objects.indexOf(o)); } dragFrom = null; });
    });
  }

  // ---------------- status bar + rulers
  let statSig = '', statT = 0, cursor = null;
  function updateStats() {
    const d = SS.doc(), sig = JSON.stringify(d.objects.map(o => [o.id, o.hidden, o.color])) + d.objects.length + (SS.doc().nextId) + '|' + JSON.stringify(SS.hoop());
    if (sig === statSig) return; statSig = sig;
    clearTimeout(statT); statT = setTimeout(() => {
      let ds; try { ds = SS.design(); } catch (e) { return; }
      const b = ds.bounds;
      $('#stN').textContent = ds.count.toLocaleString(); $('#stC').textContent = ds.colors.length; $('#stT').textContent = ds.trims;
      $('#stS').textContent = ds.count ? `${inch(b[2] - b[0])} × ${inch(b[3] - b[1])} in` : '–';
      $('#stM').textContent = ds.count ? '~' + Math.round(ds.count / 600 + ds.trims * 0.1 + ds.colors.length * 0.5) + ' min' : '–';
      const fi = SS.fitInfo(ds), el = $('#stFit');
      el.className = fi ? (fi.fits || fi.fitsRot ? 'fit-ok' : 'fit-bad') : '';
      el.textContent = fi ? (fi.fits ? '✓ fits ' + SS.hoopDef().name : fi.fitsRot ? '⟳ fits ' + SS.hoopDef().name + ' if rotated' : fi.machine ? '✗ too big for ' + SS.hoopDef().name : '✗ bigger than the Topaz 30 field') : '';
    }, 350);
  }
  function rulers() {
    const v = SS.view(), dpr = window.devicePixelRatio || 1;
    const draw1 = (cv, horiz) => {
      const r = cv.getBoundingClientRect(); if (!r.width || !r.height) return;
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
      const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#1b1e25'; g.fillRect(0, 0, r.width, r.height);
      g.strokeStyle = '#4a5163'; g.fillStyle = '#98a1b1'; g.font = '10px system-ui'; g.lineWidth = 1;
      const len = horiz ? r.width : r.height, off = horiz ? v.x : v.y, ppi = v.s * IN;
      const step = ppi > 160 ? 1 / 16 : ppi > 80 ? 1 / 8 : ppi > 40 ? 1 / 4 : ppi > 18 ? 1 / 2 : 1;
      const start = Math.floor(-off / ppi / step) * step;
      g.beginPath();
      for (let t = start; t * ppi + off < len; t += step) {
        const p = Math.round(t * ppi + off) + 0.5; if (p < 0) continue;
        const whole = Math.abs(t - Math.round(t)) < 1e-6, half = Math.abs(t * 2 - Math.round(t * 2)) < 1e-6;
        const L = whole ? 22 : half ? 11 : 6;
        if (horiz) { g.moveTo(p, 22); g.lineTo(p, 22 - L); } else { g.moveTo(22, p); g.lineTo(22 - L, p); }
        if (whole) { if (horiz) g.fillText(Math.round(t) + '"', p + 3, 10); else { g.save(); g.translate(10, p + 3); g.rotate(-Math.PI / 2); g.fillText(Math.round(t) + '"', -18, 0); g.restore(); } }
      }
      g.stroke();
      if (cursor) { const c = horiz ? cursor[0] * v.s + v.x : cursor[1] * v.s + v.y; g.strokeStyle = '#f2b134'; g.beginPath(); if (horiz) { g.moveTo(c, 0); g.lineTo(c, 22); } else { g.moveTo(0, c); g.lineTo(22, c); } g.stroke(); }
    };
    draw1($('#rulerT'), true); draw1($('#rulerL'), false);
    $('#stZ').textContent = Math.round(v.s / ACTUAL * 100) + '%';
  }
  SS.cv.addEventListener('pointermove', e => {
    const r = SS.cv.getBoundingClientRect(); cursor = SS.toMM(e.clientX - r.left, e.clientY - r.top);
    $('#stX').textContent = inch(cursor[0]) + '"'; $('#stY').textContent = inch(cursor[1]) + '"'; rulers();
  });
  SS.cv.addEventListener('pointerleave', () => { cursor = null; rulers(); });
  window.onSSDraw = () => { renderLayers(); updateStats(); rulers(); syncToolbar(); };
  window.addEventListener('resize', () => setTimeout(rulers, 50));
  function syncToolbar() { $('#simPlay').classList.toggle('on', !!sim); }

  // ---------------- sew-out simulation
  let sim = null;
  function toggleSim() {
    if (sim) { cancelAnimationFrame(sim.raf); sim = null; syncToolbar(); return; }
    SS.setPreview(true);
    setTimeout(() => {
      const ds = SS.design(); if (!ds.count) { SS.toast('Nothing to simulate yet'); return; }
      let p = SS.progress(); if (p >= 0.999) p = 0;
      sim = { last: performance.now(), p, n: ds.count };
      const tick = t => {
        if (!sim) return;
        const dt = (t - sim.last) / 1000; sim.last = t;
        sim.p = Math.min(1, sim.p + dt * (+$('#simSpeed').value) / sim.n);
        SS.setProgress(sim.p); $('#simPos').value = Math.round(sim.p * 1000);
        if (sim.p >= 1) { sim = null; syncToolbar(); return; }
        sim.raf = requestAnimationFrame(tick);
      };
      sim.raf = requestAnimationFrame(tick); syncToolbar();
    }, 60);
  }
  $('#simPlay').addEventListener('click', toggleSim);
  $('#simPos').addEventListener('input', e => { if (sim) toggleSim(); SS.setPreview(true); SS.setProgress(+e.target.value / 1000); });

  // ---------------- realistic PNG mockup
  function renderMockup(pxPerMm, withFabric) {
    const ds = SS.design(); if (!ds.count) return null;
    const b = ds.bounds, m = 4, w = Math.ceil((b[2] - b[0] + 2 * m) * pxPerMm), h = Math.ceil((b[3] - b[1] + 2 * m) * pxPerMm);
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    if (withFabric) { g.fillStyle = SS.Render.fabric(g, SS.doc().fabric || '#e9e7e1'); g.fillRect(0, 0, w, h); }
    const layers = []; let ci = 0, cur = null, line = null;
    const nl = () => { cur = { color: ds.colors[ci] ? ds.colors[ci].color : '#000', lines: [] }; layers.push(cur); line = null; };
    nl();
    for (const s of ds.stitches) { if (s.c === 3) { ci++; nl(); continue; } if (s.c === 0) { if (!line) { line = []; cur.lines.push(line); } line.push([s.x, s.y]); } else { line = [[s.x, s.y]]; cur.lines.push(line); } }
    SS.Render.draw(g, layers, { s: pxPerMm, x: (m - b[0]) * pxPerMm, y: (m - b[1]) * pxPerMm }, { thread: 0.46 });
    return c;
  }
  function syncKnock() { const el = document.getElementById('miKnock'); if (el) el.textContent = (SS.doc().knockout === false ? '   ' : '✓ ') + 'Remove hidden stitches'; }
  setTimeout(syncKnock, 0);
  function exportPNG() {
    SS.busy(true);
    setTimeout(() => {
      const c = renderMockup(24, true); SS.busy(false);
      if (!c) { SS.toast('Nothing to export yet'); return; }
      c.toBlob(async bl => { const buf = new Uint8Array(await bl.arrayBuffer()); SS.saveBytes(SS.safeName() + '_mockup.png', buf, 'image/png'); }, 'image/png');
    }, 30);
  }

  // ---------------- production worksheet (print / save as PDF)
  function colourStops(ds) {
    const out = []; let ci = 0, n = 0, tr = 0;
    for (const s of ds.stitches) { if (s.c === 3) { out.push({ c: ds.colors[ci], n, tr }); ci++; n = 0; tr = 0; } else if (s.c === 0) n++; else if (s.c === 2) tr++; }
    out.push({ c: ds.colors[ci], n, tr });
    return out.filter(x => x.c && x.n);
  }
  function worksheet() {
    const ds = SS.design(); if (!ds.count) { SS.toast('Nothing to print yet'); return; }
    const c = renderMockup(14, true), img = c ? c.toDataURL('image/png') : '';
    const b = ds.bounds, d = SS.doc(), stops = colourStops(ds);
    const rows = stops.map((s, i) => { const t = SS.nearestThread(s.c.color); return `<tr><td>${i + 1}</td><td><span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:${s.c.color};border:1px solid #999;vertical-align:middle"></span></td><td>${esc(s.c.name && !s.c.name.startsWith('#') ? s.c.name : t[1])}</td><td>${s.c.color}</td><td>${t[1]}</td><td style="text-align:right">${s.n.toLocaleString()}</td></tr>`; }).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.name)} — worksheet</title><style>
      body{font:13px system-ui,Segoe UI,Arial;margin:24px;color:#111} h1{font-size:20px;margin:0 0 4px} .muted{color:#666}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start} img{max-width:100%;border:1px solid #ddd;border-radius:6px}
      table{border-collapse:collapse;width:100%} td,th{border-bottom:1px solid #ddd;padding:6px;text-align:left} th{background:#f4f4f4}
      .stats td:first-child{color:#666;width:45%} @media print{button{display:none}}</style></head><body>
      <button onclick="print()" style="float:right;padding:8px 14px">Print / Save as PDF</button>
      <h1>${esc(d.name)}</h1><div class="muted">Stitch Studio production worksheet · ${new Date().toLocaleDateString()}</div><br>
      <div class="grid"><div><img src="${img}"></div><div><table class="stats">
      <tr><td>Size</td><td><b>${inch(b[2] - b[0])} × ${inch(b[3] - b[1])} in</b> (${(b[2] - b[0]).toFixed(1)} × ${(b[3] - b[1]).toFixed(1)} mm)</td></tr>
      <tr><td>Stitches</td><td><b>${ds.count.toLocaleString()}</b></td></tr><tr><td>Thread changes</td><td>${stops.length}</td></tr>
      <tr><td>Trims</td><td>${ds.trims}</td></tr><tr><td>Hoop</td><td>${esc(SS.hoopDef().name)} (${inch(SS.hoop().w)} × ${inch(SS.hoop().h)} in)</td></tr>
      <tr><td>Est. sew time</td><td>~${Math.round(ds.count / 600 + ds.trims * 0.1 + stops.length * 0.5)} min at 600 spm</td></tr>
      <tr><td>Machine</td><td>Husqvarna Viking Designer Topaz 30 · VP3</td></tr></table></div></div>
      <h2 style="font-size:15px;margin-top:22px">Thread sequence</h2>
      <table><tr><th>#</th><th></th><th>Colour</th><th>Hex</th><th>Nearest chart thread</th><th style="text-align:right">Stitches</th></tr>${rows}</table>
      <p class="muted" style="margin-top:18px">Stabilizer: cutaway for dense satin. Needle 75/11. 40 wt polyester or rayon on top, 60–90 wt bobbin.</p></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { SS.toast('Allow pop-ups to open the worksheet'); return; }
    w.document.write(html); w.document.close();
  }

  // ---------------- small dialogs
  function modal(html) { $('#modalBox').innerHTML = html + '<div class="btns" style="margin-top:14px;justify-content:flex-end"><button class="btn primary" id="mClose">Close</button></div>'; $('#modal').classList.add('open'); $('#mClose').onclick = () => $('#modal').classList.remove('open'); }
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') $('#modal').classList.remove('open'); });
  function keysModal() {
    const K = [['V / I / B / D / T / A / L', 'Select, Pick, Brush, Draw, Text, Auto, Order'], ['Ctrl+Z / Ctrl+Y', 'Undo / Redo'], ['Ctrl+S / Ctrl+Shift+S', 'Save / Save as (choose a folder)'], ['Ctrl+O', 'Open project'], ['Ctrl+E', 'Export VP3'], ['Ctrl+C / Ctrl+V', 'Copy / paste layer · Ctrl+V also pastes a screenshot as the picture'], ['Ctrl+D', 'Duplicate layer'], ['Del', 'Delete layer'], ['Arrows / Shift+Arrows', 'Nudge 0.1 mm / 1 mm'], ['[  ]  /  Shift+[  ]', 'Sew earlier / later / first / last'], ['Ctrl+Shift+C', 'Center layer in hoop'], ['Ctrl+0 / Ctrl+1', 'Fit hoop / actual size'], ['Ctrl+ + / Ctrl+ −, mouse wheel', 'Zoom'], ['Space+drag or middle-drag', 'Pan'], ['Middle-click point A, then point B', 'Line up every point between them (Select tool)'], ['R / P / G / H', 'Realistic view / Preview / Play simulation / Hide picture'], ['M / O', 'Patch maker / Outline'], ['Right-click', 'Layer menu'], ['Double-click a layer', 'Rename it'], ['Esc', 'Deselect / cancel']];
    modal('<h2>Keyboard shortcuts</h2><table>' + K.map(([k, v]) => `<tr><td style="white-space:nowrap"><kbd>${k}</kbd></td><td>${v}</td></tr>`).join('') + '</table>');
  }
  function threadModal() {
    const ds = SS.design(); if (!ds.count) { SS.toast('Nothing yet'); return; }
    modal('<h2>Thread sequence</h2><table>' + colourStops(ds).map((s, i) => { const t = SS.nearestThread(s.c.color); return `<tr><td>${i + 1}</td><td><span class="sw" style="display:inline-block;background:${s.c.color}"></span></td><td>${esc(s.c.name && !s.c.name.startsWith('#') ? s.c.name : t[1])}</td><td class="small">${s.c.color} · nearest ${t[1]}</td><td style="text-align:right">${s.n.toLocaleString()} st</td></tr>`; }).join('') + '</table>');
  }
  function fabricModal() {
    const F = [['#f4f3ef', 'White'], ['#e9e7e1', 'Natural'], ['#1a1a1c', 'Black'], ['#1c2541', 'Navy'], ['#2648a8', 'Royal blue'], ['#8e1b1b', 'Red'], ['#7d8086', 'Gray'], ['#c8b48a', 'Khaki'], ['#2f4f2f', 'Forest'], ['#4a2c5e', 'Purple'], ['#c96a1b', 'Orange'], ['#5a3b24', 'Brown']];
    modal('<h2>Fabric colour</h2><div class="swatches">' + F.map(([c, n]) => `<button class="sw" data-f="${c}" title="${n}" style="width:40px;height:40px;background:${c}"></button>`).join('') + '</div>');
    $('#modalBox').querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => { SS.doc().fabric = b.dataset.f; SS.autosave(); SS.draw(); $('#modal').classList.remove('open'); }));
  }

  // ---------------- PATCHES & OUTLINES
  const T = window.Trace;
  const FAVC = () => { try { const v = JSON.parse(localStorage.getItem('ss_favs')); if (Array.isArray(v)) return v; } catch (e) {} return ['#000000', '#ffffff', '#c8102e', '#f2a900', '#0b2a5b', '#e35205', '#7a7a7a']; };
  const PALETTE = () => [...new Set(FAVC().concat(['#000000', '#ffffff', '#0b2a5b', '#1f3a93', '#c8102e', '#8b0f14', '#f2a900', '#ffd23f', '#2e7d32', '#7a7a7a', '#c0c0c0', '#e35205']))];
  // union of everything stitched (or given layers) -> loops offset outward by `off` mm, inside corners rounded by `round` mm
  function outlineLoops(objs, off, round) {
    const PX = 8, list = SS.expand(objs).filter(o => !o.hidden);
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    const P = list.map(o => SS.pieces(o));
    P.forEach(ps => ps.forEach(pc => pc.pts.forEach(q => { a = Math.min(a, q[0]); b = Math.min(b, q[1]); c = Math.max(c, q[0]); d = Math.max(d, q[1]); })));
    if (a === Infinity) return [];
    const m = off + round + 3; a -= m; b -= m; c += m; d += m;
    const w = Math.ceil((c - a) * PX), h = Math.ceil((d - b) * PX);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
    g.lineCap = g.lineJoin = 'round'; g.strokeStyle = '#000'; g.fillStyle = '#000';
    const X = q => [(q[0] - a) * PX, (q[1] - b) * PX];
    g.lineWidth = 0.9 * PX;
    P.forEach(ps => ps.forEach(pc => { g.beginPath(); pc.pts.forEach((q, i) => { const [x, y] = X(q); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); }));
    const grab = () => { const dd = g.getImageData(0, 0, w, h).data, M = new Uint8Array(w * h); for (let k = 0; k < w * h; k++) M[k] = dd[k * 4 + 3] > 100 ? 1 : 0; return M; };
    const outer = loops => { if (!loops.length) return loops; const ar = loops.map(l => T.area(l)); const big = ar.reduce((i, v, k) => Math.abs(v) > Math.abs(ar[i]) ? k : i, 0); const sg = Math.sign(ar[big]); return loops.filter((l, k) => Math.sign(ar[k]) === sg && Math.abs(ar[k]) > 4 * PX * PX); };
    const paint = (loops, lw, erase) => { g.globalCompositeOperation = erase ? 'destination-out' : 'source-over'; g.lineWidth = lw; g.beginPath(); loops.forEach(l => { l.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath(); }); if (!erase) g.fill('nonzero'); g.stroke(); g.globalCompositeOperation = 'source-over'; };
    // solid silhouette (holes filled), grown by off + round, shrunk by round
    let L = outer(T.contours(grab(), w, h)); g.clearRect(0, 0, w, h); paint(L, 2 * (off + round) * PX, false);
    L = outer(T.contours(grab(), w, h)); g.clearRect(0, 0, w, h); g.beginPath(); L.forEach(l => { l.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath(); }); g.fill('nonzero');
    if (round > 0) paint(L, 2 * round * PX, true);
    L = outer(T.contours(grab(), w, h));
    return L.map(l => T.smoothLoop(l, 1.2, 60).map(q => [a + q[0] / PX, b + q[1] / PX]));
  }
  function shapeLoop(kind, cx, cy, W, H) {
    const pts = [], N = 160;
    if (kind === 'circle' || kind === 'oval') { for (let i = 0; i < N; i++) { const t = i / N * 2 * Math.PI; pts.push([cx + W / 2 * Math.cos(t), cy + H / 2 * Math.sin(t)]); } return pts; }
    if (kind === 'rect' || kind === 'rounded') {
      const r = kind === 'rect' ? Math.min(W, H) * 0.04 : Math.min(W, H) * 0.18, x0 = cx - W / 2, y0 = cy - H / 2, x1 = cx + W / 2, y1 = cy + H / 2;
      const arc = (ax, ay, a0) => { for (let i = 0; i <= 10; i++) { const t = a0 + i / 10 * Math.PI / 2; pts.push([ax + r * Math.cos(t), ay + r * Math.sin(t)]); } };
      arc(x1 - r, y0 + r, -Math.PI / 2); arc(x1 - r, y1 - r, 0); arc(x0 + r, y1 - r, Math.PI / 2); arc(x0 + r, y0 + r, Math.PI); return pts;
    }
    if (kind === 'shield') {
      const x0 = cx - W / 2, x1 = cx + W / 2, y0 = cy - H / 2, y1 = cy + H / 2, r = W * 0.06;
      pts.push([x0 + r, y0], [x1 - r, y0]);
      for (let i = 1; i <= 6; i++) { const t = -Math.PI / 2 + i / 6 * Math.PI / 2; pts.push([x1 - r + r * Math.cos(t), y0 + r + r * Math.sin(t)]); }
      for (let i = 0; i <= 40; i++) { const t = i / 40; const x = x1 - (x1 - cx) * t * t * 0.0 - (W / 2) * Math.pow(t, 2.2), y = y0 + H * 0.42 + (y1 - y0 - H * 0.42) * t; pts.push([x, y]); }
      for (let i = 39; i >= 0; i--) { const t = i / 40; const x = x0 + (W / 2) * Math.pow(t, 2.2), y = y0 + H * 0.42 + (y1 - y0 - H * 0.42) * t; pts.push([x, y]); }
      for (let i = 0; i <= 6; i++) { const t = Math.PI + i / 6 * Math.PI / 2; pts.push([x0 + r + r * Math.cos(t), y0 + r + r * Math.sin(t)]); }
      return pts;
    }
    return pts;
  }
  const loopBox = l => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; l.forEach(q => { a = Math.min(a, q[0]); b = Math.min(b, q[1]); c = Math.max(c, q[0]); d = Math.max(d, q[1]); }); return [a, b, c, d]; };
  const insetLoop = (l, k) => { const bb = loopBox(l), cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2; return l.map(q => { const dx = q[0] - cx, dy = q[1] - cy, dd = Math.hypot(dx, dy) || 1; return [q[0] - dx / dd * k, q[1] - dy / dd * k]; }); };
  const closeRun = l => l.concat([l[0]]);
  function swRow(id, cur) { return `<div class="swatches" id="${id}">${PALETTE().map(c => `<button class="sw ${c === cur ? 'on' : ''}" data-c="${c}" style="background:${c}"></button>`).join('')}<span class="sw swc" style="background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red)"><input type="color" value="${cur}"></span></div>`; }
  function bindSw(id, fn) { const el = $('#' + id); el.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => { el.querySelectorAll('.sw').forEach(x => x.classList.remove('on')); b.classList.add('on'); fn(b.dataset.c); })); el.querySelector('input').addEventListener('input', e => fn(e.target.value)); }
  const tg = (id, val, opts) => `<div class="toggle" id="${id}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(v) === String(val) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  function bindTg(id, fn) { const el = $('#' + id); el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { el.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); fn(b.dataset.v); })); }

  const patch = { shape: 'around', w: 3.5, h: 3.5, margin: 0.15, bg: 'stitch', bgColor: '#0b2a5b', border: 4, borderColor: '#f2a900', density: 0.42 };
  function patchModal() {
    const ds = SS.design(), has = ds.count > 0;
    if (has && patch.shape !== 'around') { const b = ds.bounds; patch.w = +((b[2] - b[0]) / IN + 0.6).toFixed(2); patch.h = +((b[3] - b[1]) / IN + 0.6).toFixed(2); }
    const P = patch;
    modal(`<h2>Patch maker</h2>
      <p class="small" style="margin:0 0 10px">Builds a patch the way pros sew it: background first, your design on top, then a thick satin edge last. ${has ? 'It wraps around your current design.' : 'Add your design or text after, and it will sew between the background and the edge.'}</p>
      <div class="row"><label>Shape</label>${tg('ptShape', P.shape, [['around', 'Around design'], ['circle', 'Circle'], ['oval', 'Oval'], ['rounded', 'Rounded'], ['rect', 'Rectangle'], ['shield', 'Shield']])}</div>
      <div class="row" id="ptSizeRow"><label>Size</label><input type="number" id="ptW" step="0.1" min="1" value="${P.w}" style="width:90px"> × <input type="number" id="ptH" step="0.1" min="1" value="${P.h}" style="width:90px"> in</div>
      <div class="row" id="ptMarRow"><label>Margin</label><input type="number" id="ptM" step="0.05" min="0" value="${P.margin}" style="width:90px"> in around the design</div>
      <div class="row"><label>Background</label>${tg('ptBg', P.bg, [['stitch', 'Stitched (full)'], ['twill', 'Twill appliqué'], ['none', 'None (fabric)']])}</div>
      <p class="small" id="ptBgNote" style="margin:0 0 6px"></p>
      <div id="ptBgCol"><div class="row"><label>Background colour</label></div>${swRow('ptBgC', P.bgColor)}</div>
      <div class="row" style="margin-top:12px"><label>Edge</label>${tg('ptB', P.border, [[3, 'Thin 3 mm'], [4, 'Medium 4 mm'], [5, 'Bold 5 mm'], [6, 'Merrow-look 6 mm']])}</div>
      <div class="row"><label>Edge colour</label></div>${swRow('ptBC', P.borderColor)}
      <div class="btns" style="margin-top:14px"><button class="btn primary" id="ptGo">Create patch</button></div>`);
    const sync = () => {
      $('#ptSizeRow').style.display = P.shape === 'around' ? 'none' : ''; $('#ptMarRow').style.display = P.shape === 'around' ? '' : 'none';
      $('#ptBgCol').style.display = P.bg === 'none' ? 'none' : '';
      $('#ptBgNote').textContent = P.bg === 'stitch' ? 'Whole patch is filled with thread (classic embroidered patch).' : P.bg === 'twill' ? 'Machine sews a placement line and STOPS: lay twill fabric over it, continue; it tacks it down and stops again so you can trim close, then sews the design and edge. Fewer stitches, faster.' : 'Design and edge only, straight onto the garment or patch fabric.';
    };
    bindTg('ptShape', v => { P.shape = v; sync(); }); bindTg('ptBg', v => { P.bg = v; sync(); }); bindTg('ptB', v => P.border = +v);
    bindSw('ptBgC', c => P.bgColor = c); bindSw('ptBC', c => P.borderColor = c); sync();
    $('#ptGo').addEventListener('click', () => { P.w = +$('#ptW').value || P.w; P.h = +$('#ptH').value || P.h; P.margin = +$('#ptM').value; $('#modal').classList.remove('open'); makePatch(); });
  }
  function makePatch() {
    const P = patch, d = SS.doc(), h = SS.hoop(), bw = P.border, objs = d.objects.filter(o => !o.hidden);
    let edge, inside;   // inside(k): the cut edge moved k mm inwards
    if (P.shape === 'around') {
      if (!SS.design().count) { SS.toast('Add a design first, or pick a shape like Circle'); return; }
      SS.busy(true);
      const big = L => L.length ? L.reduce((x, y) => Math.abs(T.area(y)) > Math.abs(T.area(x)) ? y : x) : null;
      const out = P.margin * IN + bw, R = 3 + bw;
      edge = big(outlineLoops(objs, out, R));
      const cache = {};
      inside = k => cache[k] || (cache[k] = big(outlineLoops(objs, Math.max(0.2, out - k), R + k)) || insetLoop(edge, k));
      SS.busy(false);
      if (!edge) { SS.toast('Could not find the design outline'); return; }
    } else {
      const ds = SS.design(), b = ds.count ? ds.bounds : [h.w / 2, h.h / 2, h.w / 2, h.h / 2];
      edge = shapeLoop(P.shape, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2, P.w * IN, (P.shape === 'circle' ? P.w : P.h) * IN);
      inside = k => insetLoop(edge, k);
    }
    const added = [];
    const mk = o => { const id = d.nextId++; o.id = id; added.push(o); return o; };
    // satin edge: centre line half the edge width inside the cut line
    const centre = inside(bw / 2);
    if (P.bg === 'stitch') {
      d.objects.unshift(mk({ type: 'fill', name: 'Patch background', paths: [inside(bw * 0.4)], angle: 45, spacing: P.density, stitchLen: 3.5, underlay: true, pullComp: 0.15, color: P.bgColor }));
    } else if (P.bg === 'twill') {
      const tack = inside(bw * 0.45);
      d.objects.unshift(
        mk({ type: 'run', name: 'Twill placement line', points: closeRun(edge), stitchLen: 2.5, passes: 1, curve: false, color: P.bgColor, threadName: 'Placement - then lay twill', stopBefore: true }),
        mk({ type: 'run', name: 'Twill tack-down', points: closeRun(tack), stitchLen: 2.5, passes: 1, curve: false, color: P.bgColor, threadName: 'Tack-down - then trim twill', stopBefore: true }),
        mk({ type: 'satin', name: 'Twill tack zig-zag', points: closeRun(tack).concat([tack[1]]).map(q => [q[0], q[1], 1.4]), spacing: 1.6, underlay: false, pullComp: 0, color: P.bgColor, threadName: 'Tack-down - then trim twill' }),
      );
    }
    d.objects.push(mk({ type: 'satin', name: 'Patch edge', points: closeRun(centre).concat([centre[1]]).map(q => [q[0], q[1], bw]), spacing: 0.36, underlay: true, pullComp: 0.15, color: P.borderColor, threadName: 'Patch edge', stopBefore: P.bg === 'twill' }));
    SS.commit(); SS.select(added[added.length - 1].id); SS.draw();
    const bb = loopBox(edge);
    SS.toast(`Patch ${inch(bb[2] - bb[0])} × ${inch(bb[3] - bb[1])} in created — background sews first, edge last`);
  }

  const outl = { off: 0.08, style: 'run', width: 2, color: '#000000', target: 'all' };
  function outlineModal() {
    const O = outl, o = selObj();
    modal(`<h2>Outline / offset</h2>
      <p class="small" style="margin:0 0 10px">Adds an outline that follows your shapes at a set distance — for borders, “halo” outlines, or a cut line.</p>
      <div class="row"><label>Around</label>${tg('olT', O.target, [['all', 'Whole design'], ['sel', o ? 'Selected layer' : 'Selected layer (none)']])}</div>
      <div class="row"><label>Distance</label><input type="number" id="olD" step="0.02" min="0" value="${O.off}" style="width:90px"> in</div>
      <div class="row"><label>Stitch</label>${tg('olS', O.style, [['run', 'Run (thin)'], ['bean', 'Bean (bold)'], ['satin', 'Satin']])}</div>
      <div class="row"><label>Satin width</label><input type="number" id="olW" step="0.5" min="1" max="8" value="${O.width}" style="width:90px"> mm</div>
      <div class="row"><label>Colour</label></div>${swRow('olC', O.color)}
      <div class="btns" style="margin-top:14px"><button class="btn primary" id="olGo">Add outline</button></div>`);
    bindTg('olT', v => O.target = v); bindTg('olS', v => O.style = v); bindSw('olC', c => O.color = c);
    $('#olGo').addEventListener('click', () => {
      O.off = +$('#olD').value || 0; O.width = +$('#olW').value || 2; $('#modal').classList.remove('open');
      const d = SS.doc(), objs = O.target === 'sel' && o ? [o] : d.objects.filter(x => !x.hidden);
      SS.busy(true);
      setTimeout(() => {
        const half = O.style === 'satin' ? O.width / 2 : 0.2;
        const L = outlineLoops(objs, O.off * IN + half, 0.6 + half); SS.busy(false);
        if (!L.length) { SS.toast('Nothing to outline'); return; }
        let last = null;
        L.forEach(l => {
          if (O.style === 'satin') last = SS.addObject({ type: 'satin', name: 'Outline', points: closeRun(l).concat([l[1]]).map(q => [q[0], q[1], O.width]), spacing: 0.38, underlay: true, pullComp: 0.12, color: O.color });
          else last = SS.addObject({ type: 'run', name: 'Outline', points: closeRun(l), stitchLen: 2.2, passes: O.style === 'bean' ? 3 : 1, curve: false, color: O.color });
        });
        SS.toast('Outline added (sews last)');
      }, 30);
    });
  }
  window.PCX = { patchModal, outlineModal };

  // ---------------- start
  document.body.classList.add('pc');
  setTimeout(() => { SS.fit(); renderLayers(); updateStats(); rulers(); }, 60);
})();
