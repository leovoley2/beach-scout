/* Beach Scout — editor de correcciones sobre un fotograma (flechas, trayectorias, foco, texto, íconos).
 * Las figuras se guardan como vectores en coordenadas normalizadas (0–1), así se pueden editar después. */
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);

  const COLORS = ['#ffd400', '#ff3b30', '#34c759', '#0a84ff', '#ffffff', '#111111'];
  const ICONS = ['✅', '❌', '⚠️', '🏐', '👀', '👣', '✋', '💪', '🎯', '⭐', '❓', '🛑', '👍', '🔁', '⬆️', '⬇️', '1️⃣', '2️⃣'];
  const TOOLS = [
    { id: 'select', label: '🖐 Mover', key: 'v' },
    { id: 'arrow', label: '➚ Flecha', key: 'f' },
    { id: 'curve', label: '↝ Trayectoria', key: 'r' },
    { id: 'line', label: '╱ Línea', key: 'l' },
    { id: 'ellipse', label: '◯ Círculo', key: 'o' },
    { id: 'rect', label: '▭ Rectángulo', key: 'q' },
    { id: 'spot', label: '🔦 Foco', key: 's' },
    { id: 'pen', label: '✎ Lápiz', key: 'p' },
    { id: 'text', label: 'T Texto', key: 't' },
    { id: 'icon', label: '★ Ícono', key: 'i' },
  ];

  // ------------------------------------------------------------- dibujo
  const bboxes = new WeakMap();
  const px = (W, w) => (w * W) / 800;          // grosor relativo al ancho de la imagen

  function arrowHead(ctx, x1, y1, x2, y2, lw) {
    const a = Math.atan2(y2 - y1, x2 - x1), len = lw * 3.2 + 8;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - len * Math.cos(a - 0.45), y2 - len * Math.sin(a - 0.45));
    ctx.lineTo(x2 - len * Math.cos(a + 0.45), y2 - len * Math.sin(a + 0.45));
    ctx.closePath(); ctx.fill();
  }

  function smoothPath(ctx, pts) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    const l = pts[pts.length - 1]; ctx.lineTo(l[0], l[1]);
  }

  function drawShape(ctx, s, W, H) {
    const lw = px(W, s.w || 5);
    ctx.save();
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = lw;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = lw * 1.2;
    if (s.dash) ctx.setLineDash([lw * 2.5, lw * 2]);
    const X = (v) => v * W, Y = (v) => v * H;
    let bb;
    switch (s.type) {
      case 'arrow': case 'line': {
        const x1 = X(s.x1), y1 = Y(s.y1), x2 = X(s.x2), y2 = Y(s.y2);
        const a = Math.atan2(y2 - y1, x2 - x1), back = s.type === 'arrow' ? lw * 2 : 0;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - back * Math.cos(a), y2 - back * Math.sin(a)); ctx.stroke();
        ctx.setLineDash([]);
        if (s.type === 'arrow') arrowHead(ctx, x1, y1, x2, y2, lw);
        bb = [Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.max(s.x1, s.x2), Math.max(s.y1, s.y2)];
        break;
      }
      case 'rect': case 'ellipse': case 'spot': {
        const x = X(Math.min(s.x1, s.x2)), y = Y(Math.min(s.y1, s.y2));
        const w = Math.abs(X(s.x2) - X(s.x1)), h = Math.abs(Y(s.y2) - Y(s.y1));
        ctx.beginPath();
        if (s.type === 'rect') ctx.rect(x, y, w, h);
        else ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
        bb = [Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.max(s.x1, s.x2), Math.max(s.y1, s.y2)];
        break;
      }
      case 'pen': {
        const pts = s.points.map(([a, b]) => [X(a), Y(b)]);
        if (pts.length < 2) break;
        smoothPath(ctx, pts); ctx.stroke(); ctx.setLineDash([]);
        if (s.arrow) {
          const k = Math.max(0, pts.length - 4);
          arrowHead(ctx, pts[k][0], pts[k][1], pts[pts.length - 1][0], pts[pts.length - 1][1], lw);
        }
        const xs = s.points.map((p) => p[0]), ys = s.points.map((p) => p[1]);
        bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
        break;
      }
      case 'text': {
        const fs = px(W, (s.w || 5) * 5.5);
        ctx.font = `600 ${fs}px -apple-system, "Segoe UI", sans-serif`;
        ctx.textBaseline = 'top';
        const tw = ctx.measureText(s.text).width, pad = fs * 0.3;
        const x = X(s.x), y = Y(s.y);
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(0,0,0,.7)';
        ctx.beginPath(); ctx.roundRect(x - pad, y - pad, tw + pad * 2, fs * 1.15 + pad * 2, pad); ctx.fill();
        ctx.fillStyle = s.color; ctx.fillText(s.text, x, y);
        bb = [(x - pad) / W, (y - pad) / H, (x + tw + pad) / W, (y + fs * 1.15 + pad) / H];
        break;
      }
      case 'icon': {
        const fs = px(W, (s.w || 5) * 10);
        ctx.font = `${fs}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(s.icon, X(s.x), Y(s.y));
        bb = [(X(s.x) - fs * 0.6) / W, (Y(s.y) - fs * 0.6) / H, (X(s.x) + fs * 0.6) / W, (Y(s.y) + fs * 0.6) / H];
        break;
      }
    }
    ctx.restore();
    if (bb) bboxes.set(s, bb);
  }

  // Oscurece todo excepto los focos (se combinan en una sola capa).
  function drawSpots(ctx, spots, W, H) {
    if (!spots.length) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, H);
    for (const s of spots) {
      const cx = ((s.x1 + s.x2) / 2) * W, cy = ((s.y1 + s.y2) / 2) * H;
      const rx = (Math.abs(s.x2 - s.x1) / 2) * W, ry = (Math.abs(s.y2 - s.y1) / 2) * H;
      ctx.moveTo(cx + rx, cy); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    }
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fill('evenodd');
    ctx.restore();
  }

  function render(ctx, img, shapes, W, H) {
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0, W, H);
    drawSpots(ctx, shapes.filter((s) => s.type === 'spot'), W, H);
    for (const s of shapes) drawShape(ctx, s, W, H);
  }

  // Dibuja la imagen final en un canvas nuevo (maxW limita el tamaño, p. ej. miniaturas).
  function compose(img, shapes, maxW) {
    const W0 = img.width, H0 = img.height;
    const k = maxW && W0 > maxW ? maxW / W0 : 1;
    const c = document.createElement('canvas');
    c.width = Math.round(W0 * k); c.height = Math.round(H0 * k);
    render(c.getContext('2d'), img, shapes, c.width, c.height);
    return c;
  }

  // ------------------------------------------------------------- editor
  const st = {
    img: null, shapes: [], history: [], tool: 'arrow', color: COLORS[0], w: 5, dash: false, icon: ICONS[0],
    draft: null, sel: null, drag: null, opts: null,
  };
  let els = null;
  const EDIT_MAX_W = 1920;

  function snapshot() { st.history.push(JSON.stringify(st.shapes)); if (st.history.length > 100) st.history.shift(); }
  function undo() { if (!st.history.length) return; st.shapes = JSON.parse(st.history.pop()); st.sel = null; redraw(); }

  let rafId = 0;
  function redraw() {
    if (!rafId) rafId = requestAnimationFrame(() => { rafId = 0; draw(); });
  }
  function draw() {
    if (!st.img) return;
    const c = els.canvas, ctx = c.getContext('2d');
    const all = st.draft ? [...st.shapes, st.draft] : st.shapes;
    render(ctx, st.img, all, c.width, c.height);
    if (st.sel !== null && st.shapes[st.sel]) {
      const bb = bboxes.get(st.shapes[st.sel]);
      if (bb) {
        const W = c.width, H = c.height, p = 8;
        ctx.save(); ctx.setLineDash([6, 4]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.strokeRect(bb[0] * W - p, bb[1] * H - p, (bb[2] - bb[0]) * W + 2 * p, (bb[3] - bb[1]) * H + 2 * p);
        ctx.restore();
      }
    }
  }

  function toNorm(e) {
    const r = els.canvas.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  }

  function hit(p) {
    const pad = 0.012;
    for (let i = st.shapes.length - 1; i >= 0; i--) {
      const bb = bboxes.get(st.shapes[i]);
      if (bb && p[0] >= bb[0] - pad && p[0] <= bb[2] + pad && p[1] >= bb[1] - pad && p[1] <= bb[3] + pad) return i;
    }
    return null;
  }

  function translate(s, dx, dy) {
    if ('x1' in s) { s.x1 += dx; s.x2 += dx; s.y1 += dy; s.y2 += dy; }
    if ('x' in s) { s.x += dx; s.y += dy; }
    if (s.points) s.points = s.points.map(([a, b]) => [a + dx, b + dy]);
  }

  function onDown(e) {
    e.preventDefault(); // evita que el clic mueva el foco al diálogo (rompe la caja de texto)
    if (!els.text.classList.contains('hidden')) commitText();
    const p = toNorm(e);
    els.canvas.setPointerCapture(e.pointerId);
    const base = { color: st.color, w: st.w, dash: st.dash };
    switch (st.tool) {
      case 'select': {
        st.sel = hit(p);
        if (st.sel !== null) { snapshot(); st.drag = p; }
        break;
      }
      case 'arrow': case 'line': case 'rect': case 'ellipse': case 'spot':
        st.draft = { type: st.tool, ...base, x1: p[0], y1: p[1], x2: p[0], y2: p[1] };
        break;
      case 'pen': case 'curve':
        st.draft = { type: 'pen', arrow: st.tool === 'curve', ...base, points: [p] };
        break;
      case 'text':
        openText(e, p);
        return;
      case 'icon':
        snapshot();
        st.shapes.push({ type: 'icon', icon: st.icon, x: p[0], y: p[1], w: st.w, color: st.color });
        break;
    }
    redraw();
  }

  function onMove(e) {
    if (!st.draft && !st.drag) return;
    const p = toNorm(e);
    if (st.drag && st.sel !== null) {
      translate(st.shapes[st.sel], p[0] - st.drag[0], p[1] - st.drag[1]);
      st.drag = p;
    } else if (st.draft) {
      if (st.draft.points) {
        const l = st.draft.points[st.draft.points.length - 1];
        if (Math.hypot(p[0] - l[0], p[1] - l[1]) > 0.004) st.draft.points.push(p);
      } else { st.draft.x2 = p[0]; st.draft.y2 = p[1]; }
    }
    redraw();
  }

  function onUp() {
    if (st.draft) {
      const d = st.draft;
      const big = d.points ? d.points.length > 2 : Math.hypot(d.x2 - d.x1, d.y2 - d.y1) > 0.01;
      if (big) { snapshot(); st.shapes.push(d); }
      st.draft = null;
    }
    st.drag = null;
    redraw();
  }

  function openText(e, p) {
    const r = els.stage.getBoundingClientRect();
    els.text.style.left = `${e.clientX - r.left}px`;
    els.text.style.top = `${e.clientY - r.top}px`;
    els.text.style.color = st.color;
    els.text.dataset.x = p[0]; els.text.dataset.y = p[1];
    els.text.value = '';
    els.text.classList.remove('hidden');
    els.text.focus();
    setTimeout(() => els.text.focus(), 50);
  }
  function commitText() {
    const v = els.text.value.trim();
    els.text.value = '';
    els.text.classList.add('hidden');
    if (!v) return;
    snapshot();
    st.shapes.push({ type: 'text', text: v, x: Number(els.text.dataset.x), y: Number(els.text.dataset.y), color: st.color, w: st.w });
    redraw();
  }

  function setTool(t) {
    st.tool = t; st.sel = t === 'select' ? st.sel : null;
    els.tools.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('sel', b.dataset.tool === t));
    els.canvas.style.cursor = t === 'select' ? 'move' : t === 'text' ? 'text' : 'crosshair';
    redraw();
  }

  function applyToSelected(prop, val) {
    if (st.sel === null || !st.shapes[st.sel]) return;
    snapshot(); st.shapes[st.sel][prop] = val; redraw();
  }

  function build() {
    const d = $('#annotDialog');
    els = {
      dialog: d, canvas: $('#annotCanvas'), stage: $('.annot-stage', d), text: $('#annotText'),
      tools: $('#annotTools'), colors: $('#annotColors'), icons: $('#annotIcons'),
      width: $('#annotWidth'), dash: $('#annotDash'),
      title: $('#annotTitle'), note: $('#annotNote'), player: $('#annotPlayer'), action: $('#annotAction'),
    };
    els.tools.innerHTML = TOOLS.map((t) => `<button class="btn small" data-tool="${t.id}" title="Tecla ${t.key.toUpperCase()}">${t.label}</button>`).join('');
    els.colors.innerHTML = COLORS.map((c) => `<button class="swatch" data-color="${c}" style="background:${c}"></button>`).join('');
    els.icons.innerHTML = ICONS.map((i) => `<button class="icon-btn" data-icon="${i}">${i}</button>`).join('');

    els.tools.onclick = (e) => { const b = e.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); };
    els.colors.onclick = (e) => {
      const b = e.target.closest('[data-color]'); if (!b) return;
      st.color = b.dataset.color; markSwatch(); applyToSelected('color', st.color);
    };
    els.icons.onclick = (e) => {
      const b = e.target.closest('[data-icon]'); if (!b) return;
      st.icon = b.dataset.icon; markIcon(); setTool('icon');
    };
    els.width.oninput = () => { st.w = Number(els.width.value); applyToSelected('w', st.w); };
    els.dash.onchange = () => { st.dash = els.dash.checked; applyToSelected('dash', st.dash); };
    $('#annotUndo').onclick = undo;
    $('#annotClear').onclick = () => { if (!st.shapes.length) return; snapshot(); st.shapes = []; st.sel = null; redraw(); };
    $('#annotDelShape').onclick = () => { if (st.sel === null) return; snapshot(); st.shapes.splice(st.sel, 1); st.sel = null; redraw(); };

    els.canvas.addEventListener('pointerdown', onDown);
    els.canvas.addEventListener('pointermove', onMove);
    els.canvas.addEventListener('pointerup', onUp);
    els.canvas.addEventListener('pointercancel', onUp);
    els.text.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); commitText(); }
      if (e.key === 'Escape') { e.preventDefault(); els.text.value = ''; commitText(); }
    });
    els.text.addEventListener('blur', commitText);

    d.addEventListener('keydown', (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopPropagation(); undo(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && st.sel !== null) { e.preventDefault(); $('#annotDelShape').click(); return; }
      const t = TOOLS.find((x) => x.key === e.key.toLowerCase());
      if (t && !e.metaKey && !e.ctrlKey) setTool(t.id);
    });

    $('#annotSave').onclick = () => finish('save');
    $('#annotPng').onclick = () => {
      const c = compose(st.img, st.shapes);
      c.toBlob((b) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = (els.title.value.trim() || 'correccion').replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/g, '').replace(/\s+/g, '_') + '.png';
        a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }, 'image/png');
    };
    const dirty = () => st.history.length > 0 || els.title.value !== ((st.opts && st.opts.title) || '') || els.note.value !== ((st.opts && st.opts.note) || '');
    const confirmClose = () => !dirty() || confirm('Hay cambios sin guardar. ¿Cerrar sin guardar?');
    $('#annotCancel').onclick = () => { if (confirmClose()) d.close(); };
    d.addEventListener('cancel', (e) => { if (!confirmClose()) e.preventDefault(); });
    $('#annotDelete').onclick = () => finish('delete');
    d.addEventListener('close', () => { els.text.classList.add('hidden'); st.opts = null; st.img = null; });
  }

  function markSwatch() { els.colors.querySelectorAll('[data-color]').forEach((b) => b.classList.toggle('sel', b.dataset.color === st.color)); }
  function markIcon() { els.icons.querySelectorAll('[data-icon]').forEach((b) => b.classList.toggle('sel', b.dataset.icon === st.icon)); }

  function finish(kind) {
    const o = st.opts; if (!o) return;
    if (kind === 'delete') {
      if (!confirm('¿Eliminar esta captura?')) return;
      els.dialog.close(); o.onDelete && o.onDelete();
      return;
    }
    const result = {
      shapes: JSON.parse(JSON.stringify(st.shapes)),
      title: els.title.value.trim(), note: els.note.value.trim(), player: els.player.value,
      thumb: compose(st.img, st.shapes, 480).toDataURL('image/jpeg', 0.8),
    };
    els.dialog.close();
    o.onSave(result);
  }

  /* opts: { image, shapes, title, note, player, players:[{value,label}], actionLabel, isNew, onSave(result), onDelete() } */
  function open(opts) {
    if (!els) build();
    st.opts = opts; st.img = opts.image;
    st.shapes = JSON.parse(JSON.stringify(opts.shapes || []));
    st.history = []; st.sel = null; st.draft = null;
    const k = Math.min(1, EDIT_MAX_W / opts.image.width); // la pizarra trabaja a ≤1920 px; el PNG sale en resolución completa
    els.canvas.width = Math.round(opts.image.width * k); els.canvas.height = Math.round(opts.image.height * k);
    els.title.value = opts.title || '';
    els.note.value = opts.note || '';
    els.player.innerHTML = opts.players.map((p) => `<option value="${p.value}">${p.label.replace(/</g, '&lt;')}</option>`).join('');
    els.player.value = opts.player || '';
    els.action.textContent = opts.actionLabel || 'Sin acción vinculada';
    els.width.value = st.w; els.dash.checked = st.dash;
    $('#annotDelete').classList.toggle('hidden', !!opts.isNew);
    markSwatch(); markIcon(); setTool(st.shapes.length ? 'select' : 'arrow');
    els.dialog.showModal();
    redraw();
  }

  window.Annotator = { open, compose };
})();
