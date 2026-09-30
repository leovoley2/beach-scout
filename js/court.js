/* Beach Scout — dibujo de la cancha (SVG): zonas, flechas de dirección y mapa de calor.
 * Coordenadas en metros con el local abajo (ver Model.COURT). */
(function () {
  'use strict';
  const M = window.Model;
  const { W, L, NET } = M.COURT;
  const EV_HEX = { '#': '#1f9d55', '+': '#7cc36b', '!': '#9aa5ae', '-': '#f0a33a', '/': '#d9692e', '=': '#d63a3a' };
  const VB = { x: -2.5, y: -3.2, w: W + 5, h: L + 6.4 };

  const flipP = (p) => ({ x: W - p.x, y: L - p.y });
  const r1 = (n) => Math.round(n * 100) / 100;

  function zoneRect(z, bottom) {
    const c = M.zoneCenter(z, bottom), t = W / 3;
    return { x: c.x - t / 2, y: c.y - t / 2, w: t, h: t };
  }

  /* opts: {
   *   uid: prefijo único (markers), flip: bool,
   *   items: [{ id, from, to, ev, faded, strong }],   // puntos YA en el marco a dibujar (antes de flip)
   *   heat: { bottom:{z:n}, top:{z:n} },               // opcional
   *   labels: { top, bottom }, zones: bool, hint: string
   * } */
  function svg(opts) {
    const uid = opts.uid || 'c';
    const d = (p) => (opts.flip ? flipP(p) : p);
    const parts = [];
    parts.push(`<svg class="court" viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}" xmlns="http://www.w3.org/2000/svg" data-uid="${uid}">`);
    parts.push('<defs>' + Object.entries(EV_HEX).map(([e, c], i) =>
      `<marker id="${uid}-m${i}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" fill="${c}" stroke="#111" stroke-width=".8"/></marker>`).join('') + '</defs>');
    // arena, cancha, zonas, red
    parts.push(`<rect x="${VB.x}" y="${VB.y}" width="${VB.w}" height="${VB.h}" fill="#e6d3a6"/>`);
    parts.push(`<rect x="0" y="0" width="${W}" height="${L}" fill="#d6b877"/>`);
    if (opts.heat) {
      for (const [side, counts] of Object.entries(opts.heat)) {
        const max = Math.max(1, ...Object.values(counts));
        for (const [z, n] of Object.entries(counts)) {
          if (!n) continue;
          let bottom = side === 'bottom';
          if (opts.flip) bottom = !bottom;
          const r = zoneRect(Number(z), bottom);
          parts.push(`<rect x="${r1(r.x)}" y="${r1(r.y)}" width="${r1(r.w)}" height="${r1(r.h)}" fill="#f5b53d" fill-opacity="${(0.15 + 0.6 * n / max).toFixed(2)}"/>`);
          parts.push(`<text x="${r1(r.x + r.w - 0.25)}" y="${r1(r.y + 0.75)}" class="heat-n" text-anchor="end">${n}</text>`);
        }
      }
    }
    if (opts.zones !== false) {
      const t = W / 3;
      for (const k of [1, 2]) {
        parts.push(`<line x1="${r1(k * t)}" y1="0" x2="${r1(k * t)}" y2="${L}" class="zl"/>`);
        parts.push(`<line x1="0" y1="${r1(NET - k * t)}" x2="${W}" y2="${r1(NET - k * t)}" class="zl"/>`);
        parts.push(`<line x1="0" y1="${r1(NET + k * t)}" x2="${W}" y2="${r1(NET + k * t)}" class="zl"/>`);
      }
      for (const bottom of [true, false]) {
        for (let z = 1; z <= 9; z++) {
          const c = M.zoneCenter(z, bottom);
          parts.push(`<text x="${c.x}" y="${r1(c.y + 0.35)}" class="zn" text-anchor="middle">${z}</text>`);
        }
      }
    }
    parts.push(`<rect x="0" y="0" width="${W}" height="${L}" fill="none" stroke="#fff" stroke-width=".12"/>`);
    parts.push(`<line x1="-0.8" y1="${NET}" x2="${W + 0.8}" y2="${NET}" stroke="#1b2a3a" stroke-width=".22"/>`);
    if (opts.labels) {
      const top = opts.flip ? opts.labels.bottom : opts.labels.top, bot = opts.flip ? opts.labels.top : opts.labels.bottom;
      if (top) parts.push(`<text x="${W / 2}" y="-2.3" class="side-l" text-anchor="middle">${esc(top)}</text>`);
      if (bot) parts.push(`<text x="${W / 2}" y="${L + 2.9}" class="side-l" text-anchor="middle">${esc(bot)}</text>`);
    }
    // flechas / puntos
    const evIdx = (e) => Math.max(0, M.EVALS.indexOf(e));
    for (const it of opts.items || []) {
      const col = EV_HEX[it.ev] || '#1b2a3a';
      const op = it.faded ? 0.35 : 1, sw = it.strong ? 0.2 : 0.13;
      const g = [`<g class="arrow${it.id ? ' hit' : ''}" data-id="${it.id || ''}" opacity="${op}">`];
      if (it.from && it.to) {
        const a = d(it.from), b = d(it.to);
        g.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#111" stroke-opacity=".45" stroke-width="${sw + 0.12}" stroke-linecap="round"/>`);
        g.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" marker-end="url(#${uid}-m${evIdx(it.ev)})"/>`);
        g.push(`<circle cx="${a.x}" cy="${a.y}" r="${it.strong ? 0.3 : 0.22}" fill="${col}" stroke="#111" stroke-width=".06"/>`);
        g.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="transparent" stroke-width="0.9"/>`); // zona de clic
      } else {
        const p = d(it.to || it.from);
        g.push(`<circle cx="${p.x}" cy="${p.y}" r="${it.strong ? 0.42 : 0.32}" fill="${col}" stroke="#111" stroke-width=".07"/>`);
        if (it.to && !it.from) g.push(`<circle cx="${p.x}" cy="${p.y}" r="${it.strong ? 0.62 : 0.5}" fill="none" stroke="${col}" stroke-width=".08"/>`);
      }
      g.push('</g>');
      parts.push(g.join(''));
    }
    if (opts.preview) {
      const a = d(opts.preview.from), b = d(opts.preview.to);
      parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#fff" stroke-width=".15" stroke-dasharray=".4 .3"/>`);
    }
    parts.push('</svg>');
    return parts.join('');
  }

  // Punto del mouse en metros (marco guardado: local abajo), deshaciendo el "invertir".
  function pointFromEvent(svgEl, e, flip) {
    const pt = svgEl.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svgEl.getScreenCTM().inverse());
    let q = { x: Math.max(-2.4, Math.min(W + 2.4, p.x)), y: Math.max(-3, Math.min(L + 3, p.y)) };
    if (flip) q = flipP(q);
    return { x: Math.round(q.x * 10) / 10, y: Math.round(q.y * 10) / 10 };
  }

  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  window.Court = { svg, pointFromEvent, flipP, EV_HEX };
})();
