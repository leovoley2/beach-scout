/* Beach Scout — interfaz: video, registro de acciones, clips y reporte. */
(function () {
  'use strict';
  const M = window.Model;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  const STORE_KEY = 'beachscout.v1';
  const EV_CLASS = { '#': 'dp', '+': 'p', '!': 'n', '-': 'm', '/': 's', '=': 'dm' };
  const EV_COLOR = { '#': 'var(--e-dp)', '+': 'var(--e-p)', '!': 'var(--e-n)', '-': 'var(--e-m)', '/': 'var(--e-s)', '=': 'var(--e-dm)' };

  // ---------------------------------------------------------------- estado
  // Segundos antes/después del momento registrado, por fundamento. En playa un rally es muy rápido
  // (saque → recepción → armado → ataque en ~4 s), así que un margen único haría que el clip de un
  // ataque empiece en el saque rival.
  const CLIP_DEFAULT = {
    S: { pre: 2, post: 3 }, R: { pre: 2, post: 2 }, E: { pre: 1.5, post: 2 }, A: { pre: 2, post: 2.5 },
    B: { pre: 2, post: 2 }, D: { pre: 2, post: 2 }, F: { pre: 2, post: 2 }, P: { pre: 3, post: 1 },
  };
  let store = { matches: [], currentId: null, settings: { clip: JSON.parse(JSON.stringify(CLIP_DEFAULT)), merge: true } };
  const ui = {
    view: 'scout', panel: 'entry',
    sel: { team: null, player: null, skill: null, type: '' },
    pendingTime: null,
    undo: [],
    filters: { players: new Set(), skills: new Set(), evals: new Set(), types: new Set(), sets: new Set() },
    playlist: null, clipIdx: 0,
    captures: [],
    videoName: '',        // archivo cargado ahora en el reproductor
    playlistSource: null, // 'clips' cuando la playlist viene del panel de clips
  };

  const video = $('#video');
  const km = () => store.settings.keymap;
  const keyLabel = (k) => Keymap.pretty(k);

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function match() { return store.matches.find((m) => m.id === store.currentId) || null; }
  function teamName(m, team) { return m.teams[team].name || (team ? 'Visita' : 'Local'); }
  function playerName(m, team, p) { return m.teams[team].players[p - 1] || `J${p}`; }
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function fmtTime(t) {
    if (!isFinite(t)) t = 0;
    const m = Math.floor(t / 60), s = t - m * 60;
    return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
  }
  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function pct(v) { return v === null || v === undefined ? '–' : `${Math.round(v)}%`; }
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 1800);
  }

  // ---------------------------------------------------------- persistencia
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        store = Object.assign(store, data, { settings: Object.assign({}, store.settings, data.settings) });
      }
    } catch (e) { console.warn('No se pudo leer el almacenamiento', e); }
    store.settings.keymap = Keymap.merge(store.settings.keymap);
    const clip = JSON.parse(JSON.stringify(CLIP_DEFAULT));
    for (const k of Object.keys(clip)) Object.assign(clip[k], (store.settings.clip || {})[k]);
    store.settings.clip = clip;
    delete store.settings.pre; delete store.settings.post; // margen único de versiones anteriores
  }
  let saveTimer = null;
  function flush() {
    clearTimeout(saveTimer); saveTimer = null;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); }
    catch (e) { toast('⚠️ No se pudo guardar (exporta el partido a .json)'); }
  }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 200);
  }

  function newMatchData(f) {
    return {
      id: uid(), name: f.name || 'Partido', date: f.date || today(),
      teams: [
        { name: f.h_name || 'Local', players: [f.h_p1 || 'Local 1', f.h_p2 || 'Local 2'] },
        { name: f.a_name || 'Visita', players: [f.a_p1 || 'Visita 1', f.a_p2 || 'Visita 2'] },
      ],
      videoName: '', currentSet: 1, actions: [],
    };
  }

  // ------------------------------------------------------------- render top
  function renderMatchSelect() {
    const sel = $('#matchSelect');
    sel.innerHTML = store.matches.map((m) =>
      `<option value="${m.id}" ${m.id === store.currentId ? 'selected' : ''}>${esc(m.date)} · ${esc(teamName(m, 0))} vs ${esc(teamName(m, 1))}${m.name ? ' · ' + esc(m.name) : ''}</option>`
    ).join('');
  }

  function renderAll() {
    renderMatchSelect();
    renderEntryButtons();
    renderActions();
    renderScore();
    renderFilters();
    renderClipTimes();
    renderClips();
    if (ui.view === 'report') renderReport();
    if (ui.view === 'corr') renderCorrections();
    const m = match();
    $('#setSelect').value = String(m ? m.currentSet : 1);
    $('#videoHint').textContent = m && m.videoName
      ? `Video de este partido: ${m.videoName}`
      : 'MP4 / MOV. El video se queda en tu computadora.';
  }

  // ------------------------------------------------------------ registro
  function renderEntryButtons() {
    const m = match(); if (!m) return;
    const s = ui.sel;
    const k = km();
    const keys = [k.idle.p01, k.idle.p02, k.idle.p11, k.idle.p12].map(keyLabel);
    $('#playerButtons').innerHTML = [[0, 1], [0, 2], [1, 1], [1, 2]].map(([t, p], i) =>
      `<button class="btn pbtn ${t ? 'away' : 'home'} ${s.team === t && s.player === p ? 'sel' : ''}" data-team="${t}" data-player="${p}">
        <span class="key">${keys[i]}</span>${esc(playerName(m, t, p))}</button>`
    ).join('');
    $('#skillButtons').innerHTML = M.SKILL_ORDER.map((sk) =>
      `<button class="btn sbtn ${s.skill === sk ? 'sel' : ''}" data-skill="${sk}"><span class="key">${esc(keyLabel(k.skills[sk]))}</span>${M.SKILLS[sk].name}</button>`
    ).join('');
    const types = s.skill ? M.TYPES[s.skill] : {};
    $('#typeButtons').innerHTML = Object.keys(types).length
      ? Object.entries(types).map(([t, v]) =>
          `<button class="btn tbtn ${s.type === t ? 'sel' : ''}" data-type="${t}"><span class="key">${esc(keyLabel(k.types[s.skill][t]))}</span>${v}</button>`).join('')
      : `<span class="muted small">${s.skill ? 'Sin tipos para este fundamento' : 'Elige un fundamento'}</span>`;
    $('#evalButtons').innerHTML = M.EVALS.map((e) => {
      const meaning = s.skill ? M.EVAL_MEANING[s.skill][e] : M.EVAL_NAME[e];
      return `<button class="btn ebtn" data-eval="${esc(e)}" title="${esc(M.EVAL_NAME[e])}"><span class="key">${esc(keyLabel(k.evals[e]))}</span>${esc(e)} <small>${esc(meaning)}</small></button>`;
    }).join('');
    // resaltar la etapa que espera tecla
    const stage = entryStage();
    $('#playerButtons').classList.toggle('stage-on', stage === 'idle');
    $('#skillButtons').classList.toggle('stage-on', stage === 'skill');
    $('#typeButtons').classList.toggle('stage-on', stage === 'eval');
    $('#evalButtons').classList.toggle('stage-on', stage === 'eval');
    if (!$('#codeInput').value) {
      const m2 = match();
      $('#codePreview').textContent = stage === 'idle' ? 'Teclado: jugador → fundamento → (tipo) → evaluación. Esc cancela, ⌫ paso atrás.'
        : `${playerName(m2, s.team, s.player)} › ${s.skill ? M.SKILLS[s.skill].name + (s.type ? ' ' + M.TYPES[s.skill][s.type] : '') + ' › evaluación…' : 'fundamento…'}`;
    }
  }

  function capturePending(fresh = false) {
    if (fresh || ui.pendingTime === null) {
      ui.pendingTime = video.currentTime || 0;
      $('#pendingTime').textContent = '⏱ ' + fmtTime(ui.pendingTime);
    }
  }
  function clearPending() {
    ui.pendingTime = null;
    $('#pendingTime').textContent = '';
  }
  function entryStage() {
    const s = ui.sel;
    return s.team === null ? 'idle' : !s.skill ? 'skill' : 'eval';
  }
  function selectPlayer(team, player) {
    capturePending(ui.sel.team === null && ui.sel.skill === null); // una acción nueva toma el tiempo actual
    ui.sel.team = team; ui.sel.player = player;
    setPanel('entry');
    renderEntryButtons();
  }
  function selectSkill(skill) {
    capturePending();
    ui.sel.skill = skill; ui.sel.type = '';
    renderEntryButtons();
  }
  function toggleType(type) {
    ui.sel.type = ui.sel.type === type ? '' : type;
    renderEntryButtons();
  }
  function commitEval(ev) {
    const s = ui.sel;
    if (s.team === null || !s.skill) { toast('Elige jugador y fundamento'); return; }
    addAction({ team: s.team, player: s.player, skill: s.skill, type: s.type, eval: ev });
  }
  function stepBack() {
    const s = ui.sel;
    if (s.type) s.type = '';
    else if (s.skill) s.skill = null;
    else { cancelEntry(); return; }
    renderEntryButtons();
  }
  function nextSet() {
    const m = match(); if (!m) return;
    m.currentSet = Math.min(3, m.currentSet + 1);
    $('#setSelect').value = String(m.currentSet);
    save(); renderScore(); toast(`Set ${m.currentSet}`);
  }

  function cancelEntry() {
    ui.sel = { team: null, player: null, skill: null, type: '' };
    clearPending();
    renderEntryButtons();
  }

  function addAction(parsed) {
    const m = match(); if (!m) return;
    const t = ui.pendingTime !== null ? ui.pendingTime : (video.currentTime || 0);
    const a = {
      id: uid(), t: Math.round(t * 100) / 100, set: m.currentSet,
      team: parsed.team, player: parsed.player, skill: parsed.skill, type: parsed.type || '', eval: parsed.eval || '',
    };
    m.actions.push(a);
    m.actions.sort((x, y) => x.t - y.t);
    ui.undo.push(a.id);
    ui.sel = { team: null, player: null, skill: null, type: '' };
    clearPending();
    save();
    renderEntryButtons(); renderActions(); renderScore(); renderFilters(); renderClips();
    toast(`${M.actionCode(a)}  ·  ${describe(m, a)}`);
  }

  function describe(m, a) {
    if (a.skill === 'P') return `Punto ${teamName(m, a.team)}`;
    const type = a.type ? ' ' + M.TYPES[a.skill][a.type] : '';
    return `${playerName(m, a.team, a.player)} · ${M.SKILLS[a.skill].name}${type} · ${M.EVAL_NAME[a.eval]}`;
  }

  function evBadge(e) { return e ? `<span class="ev ev-${EV_CLASS[e]}">${esc(e)}</span>` : ''; }

  function renderActions() {
    const m = match(); if (!m) return;
    const list = [...m.actions].reverse();
    $('#actionCount').textContent = `(${m.actions.length})`;
    $('#actionList').innerHTML = list.map((a) => `
      <div class="arow ${a.team ? 'away' : 'home'} ${a.skill === 'P' ? 'point' : ''}" data-id="${a.id}">
        <span class="t">S${a.set} ${fmtTime(a.t)}</span>
        <input class="c" value="${esc(M.actionCode(a))}" title="Edita el código y Enter">
        <span class="d">${evBadge(a.eval)} ${capCount(a.id) ? `📷${capCount(a.id)} ` : ''}${esc(describe(m, a))}</span>
        <span class="ops">
          <button data-op="note" title="Nota / corrección">💬</button>
          <button data-op="retime" title="Mover al tiempo actual del video">⏱</button>
          <button data-op="play" title="Ver clip">▶</button>
          <button data-op="del" title="Eliminar">✕</button>
        </span>
        ${a.note ? `<span class="note">💬 ${esc(a.note)}</span>` : ''}
      </div>`).join('') || '<div class="muted small">Aún no hay acciones. Abre el video y empieza a registrar.</div>';
  }

  function renderScore() {
    const m = match(); if (!m) return;
    const { sets } = M.computeScore(m.actions);
    const cur = sets[m.currentSet] || [0, 0];
    const setsTxt = Object.keys(sets).sort().map((s) => `S${s}: ${sets[s][0]}-${sets[s][1]}`).join(' · ');
    $('#scoreboard').innerHTML = [0, 1].map((t) => `
      <div class="sb-team"><span class="dot" style="background:var(${t ? '--away' : '--home'})"></span>
        <span>${esc(teamName(m, t))}</span><span class="pts">${cur[t]}</span></div>`).join('') +
      `<span class="sb-sets">Set ${m.currentSet}${setsTxt ? ' · ' + setsTxt : ''}</span>`;
  }

  function commitCode(value) {
    const p = M.parseCode(value);
    if (p.error) { $('#codeInput').classList.add('bad'); toast('Código inválido: ' + p.error); return false; }
    addAction(p);
    $('#codeInput').value = '';
    $('#codeInput').classList.remove('bad');
    $('#codePreview').textContent = '';
    return true;
  }

  function previewCode() {
    const inp = $('#codeInput');
    const v = inp.value.trim();
    if (!v) { clearPending(); inp.classList.remove('bad'); $('#codePreview').textContent = ''; return; }
    capturePending(v.length === 1); // el primer carácter marca el momento de la acción
    const p = M.parseCode(v);
    inp.classList.toggle('bad', !!p.error && /[#+!\-/=pP]$/.test(v));
    $('#codePreview').textContent = p.error ? '…' : describe(match(), p);
  }

  // --------------------------------------------------------------- video
  function openVideoFile(file) {
    if (!file) return;
    if (!file.type.startsWith('video/') && !/\.(mp4|mov|m4v|webm|mkv)$/i.test(file.name)) {
      toast('Ese archivo no parece un video'); return;
    }
    stopPlaylist();
    if (video.src) URL.revokeObjectURL(video.src);
    video.src = URL.createObjectURL(file);
    ui.videoName = file.name;
    const m = match();
    if (m) {
      if (m.videoName && m.videoName !== file.name) toast(`Ojo: este partido se registró con "${m.videoName}"`);
      m.videoName = file.name; save();
    }
    $('#videoDrop').classList.add('hidden');
  }

  // Si el video cargado no es el del partido activo, se quita para no mezclar clips/capturas.
  function syncVideoWithMatch() {
    const m = match();
    if (!video.src || !m || m.videoName === ui.videoName) return;
    stopPlaylist();
    video.pause();
    URL.revokeObjectURL(video.src);
    video.removeAttribute('src'); video.load();
    ui.videoName = '';
    $('#videoDrop').classList.remove('hidden');
    updateTime();
    toast(m.videoName ? `Abre el video de este partido: "${m.videoName}"` : 'Abre el video de este partido');
  }

  function seekBy(d) { if (video.src) video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + d)); }
  function play() { const p = video.play(); if (p) p.catch(() => {}); }
  function togglePlay() { if (!video.src) return; video.paused ? play() : video.pause(); }
  function setSpeed(dir) {
    const opts = $$('#speedSelect option').map((o) => Number(o.value));
    const i = opts.indexOf(video.playbackRate);
    const n = opts[Math.max(0, Math.min(opts.length - 1, (i < 0 ? 3 : i) + dir))];
    video.playbackRate = n; $('#speedSelect').value = String(n);
  }

  function updateTime() {
    $('#timeLabel').textContent = `${fmtTime(video.currentTime)} / ${fmtTime(video.duration || 0).slice(0, 5)}`;
    if (video.duration) $('#seekBar').value = String(Math.round((video.currentTime / video.duration) * 1000));
    $('#btnPlay').textContent = video.paused ? '▶' : '❚❚';
    // reproducción de playlist
    if (ui.playlist && !video.paused) {
      const r = ui.playlist[ui.clipIdx];
      if (r && video.currentTime >= r.end) nextClip();
    }
  }

  // ---------------------------------------------------------------- clips
  function filteredActions() {
    const m = match(); if (!m) return [];
    const f = ui.filters;
    return m.actions.filter((a) => a.skill !== 'P'
      && (!f.players.size || f.players.has(`${a.team}|${a.player}`))
      && (!f.skills.size || f.skills.has(a.skill))
      && (!f.evals.size || f.evals.has(a.eval))
      && (!f.types.size || f.types.has(a.skill + a.type))
      && (!f.sets.size || f.sets.has(String(a.set))));
  }

  function clipWindow(a) { return store.settings.clip[a && a.skill] || { pre: 2, post: 2 }; }

  function clipRanges(actions) {
    const { merge } = store.settings;
    const ranges = [];
    for (const a of [...actions].sort((x, y) => x.t - y.t)) {
      const w = clipWindow(a);
      const start = Math.max(0, a.t - w.pre), end = a.t + w.post;
      const last = ranges[ranges.length - 1];
      if (merge && last && start <= last.end) {
        last.start = Math.min(last.start, start); last.end = Math.max(last.end, end); last.actions.push(a);
      } else ranges.push({ start, end, actions: [a] });
    }
    return ranges;
  }

  function chip(key, label, on, cls = '') { return `<button class="chip ${cls} ${on ? 'on' : ''}" data-key="${esc(key)}">${esc(label)}</button>`; }

  function renderFilters() {
    const m = match(); if (!m) return;
    const f = ui.filters;
    $('#fPlayers').innerHTML = [[0, 1], [0, 2], [1, 1], [1, 2]].map(([t, p]) =>
      chip(`${t}|${p}`, playerName(m, t, p), f.players.has(`${t}|${p}`), t ? 'away' : 'home')).join('');
    $('#fSkills').innerHTML = M.SKILL_ORDER.map((k) => chip(k, M.SKILLS[k].name, f.skills.has(k))).join('');
    $('#fEvals').innerHTML = M.EVALS.map((e) => chip(e, `${e} ${M.EVAL_NAME[e]}`, f.evals.has(e))).join('');
    const skillsForTypes = [...new Set([...(f.skills.size ? f.skills : ['S', 'A']), ...[...f.types].map((t) => t[0])])]
      .filter((k) => Object.keys(M.TYPES[k]).length);
    $('#fTypes').innerHTML = skillsForTypes.flatMap((s) =>
      Object.entries(M.TYPES[s]).map(([k, v]) => chip(s + k, `${M.SKILLS[s].short}: ${v}`, f.types.has(s + k)))).join('');
    const sets = [...new Set(m.actions.map((a) => a.set))].sort();
    $('#fSets').innerHTML = sets.map((s) => chip(String(s), `Set ${s}`, f.sets.has(String(s)))).join('');
    $('#skipGap').checked = store.settings.merge;
  }

  function renderClipTimes() {
    const c = store.settings.clip;
    const num = (sk, k) => `<input type="number" step="0.5" min="0" max="15" data-skill="${sk}" data-k="${k}" value="${c[sk][k]}">`;
    $('#clipTimesGrid').innerHTML = '<span></span><b>Antes</b><b>Después</b>' +
      M.SKILL_ORDER.map((sk) => `<span>${M.SKILLS[sk].name}</span>${num(sk, 'pre')}${num(sk, 'post')}`).join('');
  }

  function renderClips() {
    const m = match(); if (!m) return;
    const acts = filteredActions();
    const ranges = clipRanges(acts);
    const counts = M.emptyCounts();
    acts.forEach((a) => { counts.total++; counts[a.eval]++; });
    const dur = ranges.reduce((s, r) => s + (r.end - r.start), 0);
    $('#clipSummary').innerHTML = `${acts.length} acciones · ${ranges.length} clips · duración ${fmtTime(dur).slice(0, 5)}
      ${counts.total ? `<div class="dist">${M.EVALS.map((e) => counts[e] ? `<span title="${e} ${counts[e]}" style="width:${100 * counts[e] / counts.total}%;background:${EV_COLOR[e]}"></span>` : '').join('')}</div>
      <div>${M.EVALS.map((e) => `${evBadge(e)} ${counts[e]}`).join(' &nbsp; ')}</div>` : ''}`;
    $('#clipList').innerHTML = ranges.map((r, i) => `
      <div class="arow ${r.actions[0].team ? 'away' : 'home'} ${ui.playlist && ui.playlistSource === 'clips' && ui.clipIdx === i ? 'playing' : ''}" data-clip="${i}">
        <span class="t">${i + 1}. ${fmtTime(r.start).slice(0, 5)}</span>
        <span class="c">${r.actions.map((a) => esc(M.actionCode(a))).join(' ')}</span>
        <span class="d">${r.actions.length === 1 ? esc(describe(m, r.actions[0])) : r.actions.length + ' acciones'}</span>
        <span class="ops"><button data-op="play" title="Ver">▶</button><button data-op="dl" title="Descargar este clip">⬇</button></span>
      </div>`).join('') || '<div class="muted small">Ninguna acción coincide con los filtros.</div>';
  }

  function startPlaylist(fromIdx = 0) {
    if (!video.src) { toast('Primero abre el video del partido'); return; }
    const ranges = clipRanges(filteredActions());
    if (!ranges.length) { toast('No hay clips con esos filtros'); return; }
    ui.playlist = ranges; ui.clipIdx = fromIdx; ui.playlistSource = 'clips';
    playClip();
  }
  function playClip() {
    const r = ui.playlist[ui.clipIdx];
    const m = match();
    video.currentTime = r.start;
    play();
    const badge = $('#clipBadge');
    badge.classList.remove('hidden');
    badge.innerHTML = `Clip ${ui.clipIdx + 1}/${ui.playlist.length} · ${r.actions.map((a) => `${evBadge(a.eval)} ${esc(describe(m, a))}`).join(' | ')}` +
      r.actions.filter((a) => a.note).map((a) => `<span class="note">💬 ${esc(a.note)}</span>`).join('');
    renderClips();
  }
  function nextClip() {
    if (ui.clipIdx + 1 < ui.playlist.length) { ui.clipIdx++; playClip(); }
    else { stopPlaylist(); video.pause(); toast('Fin de los clips'); }
  }
  function stopPlaylist() {
    ui.playlist = null; ui.playlistSource = null;
    $('#clipBadge').classList.add('hidden');
    renderClips();
  }
  function playSingle(a) {
    if (!video.src) { toast('Primero abre el video del partido'); return; }
    const w = clipWindow(a);
    ui.playlist = [{ start: Math.max(0, a.t - w.pre), end: a.t + w.post, actions: [a] }];
    ui.clipIdx = 0; ui.playlistSource = null; playClip();
  }

  function ffmpegScript() {
    const m = match();
    const ranges = clipRanges(filteredActions());
    if (!ranges.length) { toast('No hay clips con esos filtros'); return; }
    const f = ui.filters;
    const label = [
      ...[...f.players].map((k) => { const [t, p] = k.split('|').map(Number); return playerName(m, t, p); }),
      ...[...f.skills].map((s) => M.SKILLS[s].name), ...[...f.evals].map((e) => ({ '#': 'dp', '+': 'pos', '!': 'neu', '-': 'neg', '/': 'neg2', '=': 'dneg' }[e])),
    ].join('_').replace(/[^\w\-áéíóúñÁÉÍÓÚÑ]+/g, '-') || 'clips';
    const lines = [
      '#!/bin/bash',
      `# Beach Scout — ${ranges.length} clips de: ${teamName(m, 0)} vs ${teamName(m, 1)} (${m.date})`,
      '# Requiere ffmpeg (brew install ffmpeg). Uso:  bash este_archivo.sh "/ruta/al/video.mp4"',
      'set -e',
      `IN="\${1:-${m.videoName || 'video.mp4'}}"`,
      `OUT="${label}.mp4"`,
      'TMP="$(mktemp -d)"',
      ...ranges.map((r, i) =>
        `ffmpeg -loglevel error -y -ss ${r.start.toFixed(2)} -i "$IN" -t ${(r.end - r.start).toFixed(2)} -c:v libx264 -preset veryfast -crf 20 -c:a aac "$TMP/c${String(i + 1).padStart(3, '0')}.mp4"`),
      'for f in "$TMP"/c*.mp4; do echo "file \'$f\'"; done > "$TMP/list.txt"',
      'ffmpeg -loglevel error -y -f concat -safe 0 -i "$TMP/list.txt" -c copy "$OUT"',
      'rm -rf "$TMP"',
      'echo "Listo: $OUT"',
    ];
    download(`${label}.sh`, lines.join('\n') + '\n', 'text/x-shellscript');
  }

  // ------------------------------------------------------ descargar video
  const exportState = { ranges: [], running: false, signal: null, file: null };

  function filtersTitle() {
    const m = match(), f = ui.filters;
    const parts = [
      [...f.players].map((k) => { const [t, p] = k.split('|').map(Number); return playerName(m, t, p); }).join(' y '),
      [...f.skills].map((s) => M.SKILLS[s].name).join(' y '),
      [...f.types].map((t) => M.TYPES[t[0]][t.slice(1)]).join(' y '),
      [...f.evals].map((e) => M.EVAL_NAME[e]).join(' y '),
    ].filter(Boolean);
    return parts.join(' · ') || 'Clips del partido';
  }

  function rangeLabel(m, r) {
    const a0 = r.actions[0];
    const main = r.actions.length === 1
      ? `${describe(m, a0)} (${a0.eval})`
      : r.actions.map((a) => `${a.eval} ${playerName(m, a.team, a.player)} ${M.SKILLS[a.skill].short}`).join('  |  ');
    const note = r.actions.map((a) => a.note).filter(Boolean).join(' · ');
    return { main, note, color: a0.team ? '#e0562f' : '#2f9be0' };
  }

  function openExport(ranges, title) {
    if (!video.src) { toast('Primero abre el video del partido'); return; }
    if (!ranges.length) { toast('No hay clips con esos filtros'); return; }
    if (!ClipExporter.pickType()) { toast('Este navegador no puede crear videos. Usa Chrome o Safari actualizados.'); return; }
    stopPlaylist(); video.pause();
    exportState.ranges = ranges; exportState.file = null;
    const dur = ranges.reduce((s, r) => s + (r.end - r.start), 0);
    $('#expInfo').textContent = `${ranges.length} clip(s) · ${fmtTime(dur).slice(0, 5)} de video · formato ${ClipExporter.pickType().ext.toUpperCase()} · tardará ~${Math.ceil(dur + 3)} s`;
    $('#expTitle').value = title;
    $('#expTitleCard').checked = ranges.length > 1;
    $('#expForm').classList.remove('hidden');
    $('#expProgress').classList.add('hidden');
    $('#expDone').classList.add('hidden');
    $('#expStart').classList.remove('hidden');
    $('#expCancel').textContent = 'Cerrar';
    $('#exportDialog').showModal();
  }

  async function runExport() {
    const m = match();
    const title = $('#expTitle').value.trim() || 'Clips';
    exportState.running = true; exportState.signal = { cancelled: false };
    $('#expForm').classList.add('hidden'); $('#expStart').classList.add('hidden');
    $('#expProgress').classList.remove('hidden'); $('#expCancel').textContent = 'Cancelar';
    $('#expBar').style.width = '0%'; $('#expStatus').textContent = 'Preparando…';
    try {
      const res = await ClipExporter.run({
        src: video.src,
        ranges: exportState.ranges,
        labels: exportState.ranges.map((r) => rangeLabel(m, r)),
        title, subtitle: `${teamName(m, 0)} vs ${teamName(m, 1)} · ${m.date}${m.name && m.name !== 'Partido' ? ' · ' + m.name : ''}`,
        titleCard: $('#expTitleCard').checked, overlay: $('#expOverlay').checked,
        maxHeight: Number($('#expQuality').value),
        signal: exportState.signal,
        onProgress: (p, text) => { $('#expBar').style.width = `${Math.round(p * 100)}%`; $('#expStatus').textContent = `${text} · ${Math.round(p * 100)}%`; },
      });
      exportState.running = false;
      $('#expProgress').classList.add('hidden');
      if (!res) { toast('Exportación cancelada'); $('#exportDialog').close(); return; }
      const name = title.replace(/\s*·\s*/g, ' - ').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) + '.' + res.ext;
      exportState.file = new File([res.blob], name, { type: res.blob.type });
      saveBlob(exportState.file);
      const canShare = navigator.canShare && navigator.canShare({ files: [exportState.file] });
      $('#expDone').innerHTML = `<p>✅ <b>${esc(name)}</b> · ${(res.blob.size / 1048576).toFixed(1)} MB — se descargó a tu carpeta de Descargas.</p>
        <div class="row gap"><button type="button" class="btn" id="expAgain">Descargar otra vez</button>
        ${canShare ? '<button type="button" class="btn primary" id="expShare">Compartir…</button>' : ''}</div>`;
      $('#expDone').classList.remove('hidden');
      $('#expCancel').textContent = 'Cerrar';
      $('#expAgain').onclick = () => saveBlob(exportState.file);
      if (canShare) $('#expShare').onclick = () => navigator.share({ files: [exportState.file], title }).catch(() => {});
    } catch (err) {
      exportState.running = false;
      $('#expProgress').classList.add('hidden');
      $('#expDone').innerHTML = `<p class="bad">No se pudo crear el video: ${esc(err.message || err)}</p>`;
      $('#expDone').classList.remove('hidden');
      $('#expCancel').textContent = 'Cerrar';
    }
  }

  function saveBlob(file) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = file.name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }

  // ---------------------------------------------------------------- reporte
  function reportActions() {
    const scope = $('#reportScope').value;
    const setF = $('#reportSet').value;
    const matches = scope === 'all' ? store.matches : [match()].filter(Boolean);
    const rows = [];
    for (const m of matches) for (const a of m.actions) {
      if (setF && String(a.set) !== setF) continue;
      rows.push({ a, m });
    }
    return { matches, rows };
  }

  function statRow(label, skill, c, link, cls = '') {
    const mt = M.metrics(skill, c);
    const cell = (e) => {
      const n = c[e];
      const attrs = link ? ` class="link ${n ? '' : 'zero'}" data-link='${JSON.stringify({ ...link, eval: e })}'` : (n ? '' : ' class="zero"');
      return `<td${attrs}>${n}</td>`;
    };
    const totAttrs = link ? ` class="link" data-link='${JSON.stringify(link)}'` : '';
    const effCls = mt.eff === null ? '' : mt.eff >= 0 ? 'good' : 'bad';
    return `<tr class="${cls}"><td>${esc(label)}</td><td${totAttrs}><b>${c.total}</b></td>${M.EVALS.map(cell).join('')}
      <td>${pct(mt.pos)}</td><td>${pct(mt.perf)}</td><td>${pct(mt.err)}</td><td class="${effCls}">${pct(mt.eff)}</td>
      <td class="bar"><div class="dist">${M.EVALS.map((e) => c[e] ? `<span style="width:${100 * c[e] / c.total}%;background:${EV_COLOR[e]}"></span>` : '').join('')}</div></td></tr>`;
  }

  function statTable(agg, prefix, linkBase) {
    let html = `<table class="stats"><thead><tr><th>Fundamento</th><th>Tot</th>${M.EVALS.map((e) => `<th title="${M.EVAL_NAME[e]}">${e}</th>`).join('')}
      <th title="(# + +) / total">Pos%</th><th title="# / total (en ataque: % de punto)">#%</th><th title="= / total">Err%</th><th title="Eficiencia (ver ayuda)">Eff%</th><th></th></tr></thead><tbody>`;
    let any = false;
    for (const s of M.SKILL_ORDER) {
      const c = agg.get(`${prefix}|${s}`);
      if (!c) continue;
      any = true;
      html += statRow(M.SKILLS[s].name, s, c, linkBase && { ...linkBase, skill: s });
      for (const t of Object.keys(M.TYPES[s])) {
        const ct = agg.get(`${prefix}|${s}|${t}`);
        if (ct) html += statRow(M.TYPES[s][t], s, ct, linkBase && { ...linkBase, skill: s, type: t }, 'sub');
      }
    }
    html += '</tbody></table>';
    return any ? html : '<div class="muted small">Sin acciones registradas.</div>';
  }

  function renderReport() {
    const { matches, rows } = reportActions();
    const body = $('#reportBody');
    if (!matches.length) { body.innerHTML = '<p class="muted">No hay partidos.</p>'; return; }
    const single = matches.length === 1 && $('#reportScope').value === 'current';
    const m0 = matches[0];

    // Agrupar por nombre de equipo / jugador para poder sumar varios partidos.
    const teamKeys = [], playerKeys = new Map(); // teamName -> [playerName]
    const norm = rows.map(({ a, m }) => {
      const tn = teamName(m, a.team);
      const pn = a.player ? playerName(m, a.team, a.player) : '';
      if (!teamKeys.includes(tn)) teamKeys.push(tn);
      if (pn) { const l = playerKeys.get(tn) || []; if (!l.includes(pn)) l.push(pn); playerKeys.set(tn, l); }
      return { ...a, tn, pn };
    });
    if (single) { // orden fijo local / visita
      teamKeys.length = 0; teamKeys.push(teamName(m0, 0), teamName(m0, 1));
      m0.teams.forEach((t, i) => playerKeys.set(teamName(m0, i), [playerName(m0, i, 1), playerName(m0, i, 2)]));
    }
    const agg = new Map();
    const bump = (key, e) => { let c = agg.get(key); if (!c) agg.set(key, (c = M.emptyCounts())); c.total++; c[e]++; };
    for (const a of norm) {
      if (a.skill === 'P') continue;
      for (const who of [`${a.tn}|`, `${a.tn}|${a.pn}`]) {
        bump(`${who}|${a.skill}`, a.eval);
        if (a.type) bump(`${who}|${a.skill}|${a.type}`, a.eval);
      }
    }

    // Marcador, side-out y origen de los puntos (por partido, luego sumado por nombre de equipo)
    const teamInfo = new Map(teamKeys.map((k) => [k, { pts: 0, recv: 0, sideout: 0, serve: 0, breakpt: 0, ace: 0, kill: 0, block: 0, oppErr: 0, other: 0, errs: 0 }]));
    const setF = $('#reportSet').value;
    const setLines = [];
    for (const m of matches) {
      const acts = m.actions.filter((a) => !setF || String(a.set) === setF);
      const { sets, rallies } = M.computeScore(acts);
      setLines.push({ m, sets });
      const ph = M.computePhases(rallies);
      [0, 1].forEach((t) => {
        const info = teamInfo.get(teamName(m, t)); if (!info) return;
        info.recv += ph[t].recv; info.sideout += ph[t].sideout; info.serve += ph[t].serve; info.breakpt += ph[t].breakpt;
      });
      for (const r of rallies) {
        if (r.winner === null) continue;
        const info = teamInfo.get(teamName(m, r.winner)); if (!info) continue;
        info.pts++;
        const last = r.actions.find((a) => M.rallyWinner(a) !== null);
        if (last.team !== r.winner) info.oppErr++;
        else if (last.skill === 'S') info.ace++;
        else if (last.skill === 'A') info.kill++;
        else if (last.skill === 'B') info.block++;
        else info.other++;
      }
      for (const a of acts) if (a.eval === '=') { const i = teamInfo.get(teamName(m, a.team)); if (i) i.errs++; }
    }

    const header = single
      ? `<div class="r-head"><h1>${esc(teamName(m0, 0))} vs ${esc(teamName(m0, 1))}</h1>
          <div class="muted">${esc(m0.name)} · ${esc(m0.date)}${setF ? ' · Set ' + setF : ''}</div>
          <div>${Object.keys(setLines[0].sets).sort().map((s) => `Set ${s}: <b>${setLines[0].sets[s][0]}-${setLines[0].sets[s][1]}</b>`).join(' &nbsp;·&nbsp; ') || '<span class="muted">Sin puntos registrados</span>'}</div></div>`
      : `<div class="r-head"><h1>Reporte acumulado</h1><div class="muted">${matches.length} partidos${setF ? ' · Set ' + setF : ''}</div></div>`;

    const cards = teamKeys.map((tk, i) => {
      const t = teamInfo.get(tk);
      const col = single ? (i ? 'var(--away)' : 'var(--home)') : 'var(--accent)';
      return `<div class="r-card" style="border-top:3px solid ${col}"><div class="lbl">${esc(tk)}</div>
        <div class="val">${t.pts} pts</div>
        <div class="small">Side-out: <b>${t.recv ? pct(100 * t.sideout / t.recv) : '–'}</b> (${t.sideout}/${t.recv}) ·
        Break: <b>${t.serve ? pct(100 * t.breakpt / t.serve) : '–'}</b> (${t.breakpt}/${t.serve})</div>
        <div class="small muted">Aces ${t.ace} · Ataque ${t.kill} · Bloqueo ${t.block} · Errores rival ${t.oppErr}${t.other ? ` · Otros ${t.other}` : ''} · Errores propios ${t.errs}</div></div>`;
    }).join('');

    const legend = `<div class="legend">${M.EVALS.map((e) => `<span><i style="background:${EV_COLOR[e]}"></i>${e} ${M.EVAL_NAME[e]}</span>`).join('')}
      <span>· Haz clic en un número para ver esos clips</span></div>`;

    const sections = teamKeys.map((tk, ti) => {
      const col = single ? (ti ? 'var(--away)' : 'var(--home)') : 'var(--accent)';
      const players = playerKeys.get(tk) || [];
      const teamLink = single ? { team: ti } : null;
      return `<div class="r-section"><h2><span class="dot" style="background:${col}"></span>${esc(tk)} — total equipo</h2>
          ${statTable(agg, `${tk}|`, teamLink)}</div>` +
        players.map((pn, pi) => `<div class="r-section"><h2><span class="dot" style="background:${col}"></span>${esc(pn)} <span class="muted small">${esc(tk)}</span></h2>
          ${statTable(agg, `${tk}|${pn}`, single ? { team: ti, player: pi + 1 } : null)}</div>`).join('');
    }).join('');

    body.innerHTML = header + `<div class="r-cards">${cards}</div>` + legend + sections;
  }

  function openClipsFromReport(link) {
    const f = ui.filters;
    f.players.clear(); f.skills.clear(); f.evals.clear(); f.types.clear(); f.sets.clear();
    if (link.player) f.players.add(`${link.team}|${link.player}`);
    else { f.players.add(`${link.team}|1`); f.players.add(`${link.team}|2`); }
    if (link.skill) f.skills.add(link.skill);
    if (link.eval) f.evals.add(link.eval);
    if (link.type) f.types.add(link.skill + link.type);
    const setF = $('#reportSet').value; if (setF) f.sets.add(setF);
    setView('scout'); setPanel('clips');
    renderFilters(); renderClips();
  }

  // ------------------------------------------------------------- capturas
  function capCount(actionId) { return ui.captures.filter((c) => c.actionId === actionId).length; }
  function matchById(id) { return store.matches.find((m) => m.id === id) || null; }

  function playerOptions(m) {
    return [
      { value: '', label: '— General —' },
      ...[[0, 1], [0, 2], [1, 1], [1, 2]].map(([t, p]) => ({ value: `${t}|${p}`, label: `${playerName(m, t, p)} (${teamName(m, t)})` })),
      { value: '0|0', label: `Equipo ${teamName(m, 0)}` },
      { value: '1|0', label: `Equipo ${teamName(m, 1)}` },
    ];
  }
  function capPlayerLabel(rec) {
    const m = matchById(rec.matchId);
    if (!m || !rec.player) return 'General';
    const [t, p] = rec.player.split('|').map(Number);
    return p ? playerName(m, t, p) : `Equipo ${teamName(m, t)}`;
  }
  function nearestAction(m, t) {
    let best = null;
    for (const a of m.actions) {
      if (a.skill === 'P') continue;
      const d = Math.abs(a.t - t);
      if (d <= 3 && (!best || d < Math.abs(best.t - t))) best = a;
    }
    return best;
  }

  async function captureFrame() {
    const m = match();
    if (!m || !video.src || !video.videoWidth) { toast('Primero abre el video del partido'); return; }
    video.pause();
    if (video.seeking || video.readyState < 2) {
      await new Promise((r) => { video.addEventListener('seeked', r, { once: true }); video.addEventListener('canplay', r, { once: true }); setTimeout(r, 1500); });
    }
    const c = document.createElement('canvas');
    c.width = video.videoWidth; c.height = video.videoHeight;
    c.getContext('2d').drawImage(video, 0, 0);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
    const image = await createImageBitmap(blob);
    const t = Math.round(video.currentTime * 100) / 100;
    const a = nearestAction(m, t);
    Annotator.open({
      image, shapes: [], isNew: true,
      title: a ? `${M.SKILLS[a.skill].name}${a.type ? ' ' + M.TYPES[a.skill][a.type] : ''} ${a.eval}` : '',
      note: a && a.note ? a.note : '',
      player: a ? `${a.team}|${a.player}` : '',
      players: playerOptions(m),
      actionLabel: a ? `${M.actionCode(a)} · ${fmtTime(a.t)}` : `${fmtTime(t)} (sin acción cerca)`,
      onSave: async (r) => {
        const rec = { id: uid(), matchId: m.id, actionId: a ? a.id : null, t, frame: blob, createdAt: Date.now(), ...r };
        try { await DB.put(rec); } catch (e) { toast('No se pudo guardar la captura'); return; }
        ui.captures.push(rec);
        renderActions();
        toast('📷 Corrección guardada');
      },
    });
  }

  async function editCapture(rec) {
    const m = matchById(rec.matchId);
    const a = m && rec.actionId ? m.actions.find((x) => x.id === rec.actionId) : null;
    const image = await createImageBitmap(rec.frame);
    Annotator.open({
      image, shapes: rec.shapes, title: rec.title, note: rec.note, player: rec.player,
      players: m ? playerOptions(m) : [{ value: rec.player, label: capPlayerLabel(rec) }],
      actionLabel: a ? `${M.actionCode(a)} · ${fmtTime(a.t)}` : fmtTime(rec.t),
      onSave: async (r) => {
        Object.assign(rec, r, { updatedAt: Date.now() });
        await DB.put(rec);
        renderCorrections(); renderActions();
        toast('Corrección actualizada');
      },
      onDelete: () => deleteCapture(rec),
    });
  }

  async function deleteCapture(rec) {
    await DB.del(rec.id);
    ui.captures = ui.captures.filter((c) => c.id !== rec.id);
    renderCorrections(); renderActions();
  }

  async function downloadCapturePng(rec) {
    const image = await createImageBitmap(rec.frame);
    Annotator.compose(image, rec.shapes).toBlob((b) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `${capPlayerLabel(rec)}_${rec.title || 'correccion'}`.replace(/[^\w\-áéíóúñÁÉÍÓÚÑ]+/g, '_') + '.png';
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
  }

  function goToCapture(rec) {
    if (rec.matchId !== store.currentId) {
      store.currentId = rec.matchId; ui.undo = []; save(); renderAll(); syncVideoWithMatch();
    }
    setView('scout');
    const m = match();
    if (!video.src) { toast(`Abre el video "${m.videoName || 'del partido'}"`); return; }
    const linked = rec.actionId ? m.actions.find((x) => x.id === rec.actionId) : null;
    const w = clipWindow(linked);
    ui.playlist = [{ start: Math.max(0, rec.t - w.pre), end: rec.t + w.post, actions: [] }];
    ui.clipIdx = 0;
    ui.playlistSource = null;
    video.currentTime = ui.playlist[0].start; play();
    const badge = $('#clipBadge');
    badge.classList.remove('hidden');
    badge.innerHTML = `📷 ${esc(rec.title || 'Corrección')} · ${esc(capPlayerLabel(rec))}${rec.note ? `<span class="note">💬 ${esc(rec.note)}</span>` : ''}`;
  }

  function renderCorrections() {
    const scope = $('#corrScope').value;
    const caps = ui.captures
      .filter((c) => scope === 'all' || c.matchId === store.currentId)
      .filter((c) => matchById(c.matchId))
      .sort((x, y) => (x.matchId === y.matchId ? x.t - y.t : x.createdAt - y.createdAt));
    const names = [...new Set(caps.map(capPlayerLabel))];
    const selP = $('#corrPlayer');
    const prev = selP.value;
    selP.innerHTML = '<option value="">Todos</option>' + names.map((n) => `<option ${n === prev ? 'selected' : ''}>${esc(n)}</option>`).join('');
    const shown = caps.filter((c) => !selP.value || capPlayerLabel(c) === selP.value);
    const body = $('#corrBody');
    if (!shown.length) {
      body.innerHTML = `<p class="muted">Aún no hay correcciones${scope === 'current' ? ' en este partido' : ''}.
        En Scouting, pausa el video en el momento clave y pulsa <b>📷 Capturar</b> (tecla C).</p>`;
      return;
    }
    const groups = new Map();
    for (const c of shown) { const k = capPlayerLabel(c); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); }
    body.innerHTML = [...groups].map(([name, list]) => `
      <h2 class="corr-player">${esc(name)} <span class="muted small">${list.length} corrección(es)</span></h2>
      <div class="corr-grid">${list.map((c) => {
        const m = matchById(c.matchId);
        const team = c.player ? Number(c.player.split('|')[0]) : null;
        return `<div class="corr-card ${team === null ? '' : team ? 'away' : 'home'}" data-cap="${c.id}">
          <img src="${c.thumb}" alt="" data-op="edit" title="Editar dibujo">
          <div class="body">
            <div class="title">${esc(c.title || 'Corrección')}</div>
            <div class="meta">${esc(teamName(m, 0))} vs ${esc(teamName(m, 1))} · ${esc(m.date)} · ${fmtTime(c.t)}</div>
            ${c.note ? `<div class="note">${esc(c.note)}</div>` : ''}
            <div class="ops">
              <button class="btn small" data-op="edit">✏️ Editar</button>
              <button class="btn small" data-op="video">▶ Ver en video</button>
              <button class="btn small ghost" data-op="png">PNG</button>
              <button class="btn small ghost danger" data-op="del">Eliminar</button>
            </div>
          </div></div>`;
      }).join('')}</div>`).join('');
  }

  async function blobToDataUrl(b) {
    return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
  }

  // ------------------------------------------------------------ navegación
  function setView(v) {
    ui.view = v;
    $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
    $('#viewScout').classList.toggle('hidden', v !== 'scout');
    $('#viewReport').classList.toggle('hidden', v !== 'report');
    $('#viewCorr').classList.toggle('hidden', v !== 'corr');
    if (v === 'report') { video.pause(); renderReport(); }
    if (v === 'corr') { video.pause(); renderCorrections(); }
  }
  function setPanel(p) {
    ui.panel = p;
    $$('.subtab').forEach((b) => b.classList.toggle('active', b.dataset.panel === p));
    $('#panelEntry').classList.toggle('hidden', p !== 'entry');
    $('#panelClips').classList.toggle('hidden', p !== 'clips');
  }

  // ------------------------------------------------------ importar/exportar
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function fileSafe(m) { return `${m.date}_${teamName(m, 0)}_vs_${teamName(m, 1)}`.replace(/[^\w\-]+/g, '-'); }
  async function exportJson() {
    const m = match(); if (!m) return;
    const captures = await Promise.all(ui.captures.filter((c) => c.matchId === m.id)
      .map(async (c) => ({ ...c, frame: await blobToDataUrl(c.frame) })));
    download(fileSafe(m) + '.json', JSON.stringify({ app: 'beach-scout', version: 2, match: m, captures }), 'application/json');
  }
  function exportCsv() {
    const m = match(); if (!m) return;
    const head = ['partido', 'fecha', 'set', 'tiempo_s', 'equipo', 'jugador', 'fundamento', 'tipo', 'evaluacion', 'codigo', 'nota'];
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [head.join(',')].concat(m.actions.map((a) => [
      m.name, m.date, a.set, a.t, teamName(m, a.team), a.player ? playerName(m, a.team, a.player) : '',
      a.skill === 'P' ? 'Punto' : M.SKILLS[a.skill].name, a.type ? M.TYPES[a.skill][a.type] : '',
      a.eval, M.actionCode(a), a.note || '',
    ].map(q).join(',')));
    download(fileSafe(m) + '.csv', '﻿' + lines.join('\n'), 'text/csv');
  }
  function importJson(file) {
    const r = new FileReader();
    r.onload = async () => {
      try {
        const data = JSON.parse(r.result);
        const list = data.match ? [data.match] : data.matches || (data.actions ? [data] : []);
        if (!list.length) throw new Error('sin partidos');
        for (const m of list) {
          if (!m.teams || !Array.isArray(m.actions)) throw new Error('formato inválido');
          const oldId = m.id;
          if (store.matches.some((x) => x.id === m.id)) m.id = uid();
          m.currentSet = m.currentSet || 1;
          store.matches.push(m);
          for (const c of (data.captures || []).filter((x) => x.matchId === oldId)) {
            const rec = { ...c, id: uid(), matchId: m.id, frame: await (await fetch(c.frame)).blob() };
            await DB.put(rec); ui.captures.push(rec);
          }
        }
        store.currentId = list[list.length - 1].id;
        save(); renderAll(); toast(`Importado: ${list.length} partido(s)`);
      } catch (e) { toast('No se pudo importar: ' + e.message); }
    };
    r.readAsText(file);
  }

  // --------------------------------------------------------------- diálogo
  let editing = false;
  function openMatchDialog(edit) {
    editing = edit;
    const f = $('#matchForm');
    const m = edit ? match() : null;
    $('#matchDialogTitle').textContent = edit ? 'Editar partido' : 'Nuevo partido';
    $('#btnDeleteMatch').classList.toggle('hidden', !edit);
    f.name.value = m ? m.name : '';
    f.date.value = m ? m.date : today();
    f.h_name.value = m ? m.teams[0].name : ''; f.h_p1.value = m ? m.teams[0].players[0] : ''; f.h_p2.value = m ? m.teams[0].players[1] : '';
    f.a_name.value = m ? m.teams[1].name : ''; f.a_p1.value = m ? m.teams[1].players[0] : ''; f.a_p2.value = m ? m.teams[1].players[1] : '';
    $('#matchDialog').showModal();
  }

  function helpHtml() {
    const skills = M.SKILL_ORDER.map((s) => `<tr><td><code>${s}</code></td><td>${M.SKILLS[s].name}</td><td>${Object.entries(M.TYPES[s]).map(([k, v]) => `<code>${k}</code> ${v}`).join(', ') || '–'}</td></tr>`).join('');
    const evals = `<tr><th></th>${M.EVALS.map((e) => `<th>${e}<br><span class="muted small">${M.EVAL_NAME[e]}</span></th>`).join('')}</tr>` +
      M.SKILL_ORDER.map((s) => `<tr><td><b>${M.SKILLS[s].name}</b></td>${M.EVALS.map((e) => `<td class="small">${M.EVAL_MEANING[s][e]}</td>`).join('')}</tr>`).join('');
    return `<p>Formato: <code>[equipo][jugador][fundamento][tipo opcional][evaluación]</code> y Enter.
      Equipo <code>*</code> = local, <code>a</code> = visita. Atajo: jugadores <code>3</code> y <code>4</code> = visita 1 y 2.</p>
      <p>Ejemplos: <code>*1R#</code> recepción perfecta del local 1 · <code>a2AC+</code> ataque de corte positivo de visita 2 ·
      <code>3SQ=</code> error de saque en salto de visita 1 · <code>*P</code> punto manual para el local.</p>
      <table><tr><th>Letra</th><th>Fundamento</th><th>Tipos</th></tr>${skills}</table>
      <table>${evals}</table>
      <p class="small"><b>Eficiencia:</b> Saque (# − =)/tot · Recepción (# + + − / − =)/tot · Ataque (# − / − =)/tot · Resto (# + + − =)/tot.<br>
      <b>Marcador automático:</b> suman punto S#, A#, B# (para quien ejecuta) y cualquier =, A/ o B/ (para el rival). Si el punto no queda
      registrado con una acción, usa <code>*P</code> / <code>aP</code>.</p>
      <h3>Tus teclas <button class="btn small ghost" onclick="document.getElementById('helpDialog').close();document.getElementById('btnKeys').click()">⌨️ Editar</button></h3>
      <p class="small">Registro por teclado: <b>jugador → fundamento → (tipo) → evaluación</b>. El tiempo se toma al pulsar el jugador.
      Esc cancela · ⌫ paso atrás · Cmd/Ctrl+Z deshace · <code>*</code> o la tecla de «caja de código» para escribir códigos Data Volley.</p>
      <div class="keys-help">${[...Keymap.entries(km()).reduce((g, en) => { (g.get(en.group) || g.set(en.group, []).get(en.group)).push(en); return g; }, new Map())]
        .map(([g, list]) => `<div><b>${esc(g)}</b>${list.filter((en) => en.key).map((en) => `<div><kbd>${esc(keyLabel(en.key))}</kbd> ${esc(en.label)}</div>`).join('')}</div>`).join('')}</div>`;
  }

  // ---------------------------------------------------------------- eventos
  function bind() {
    // barra superior
    $('#matchSelect').addEventListener('change', (e) => {
      store.currentId = e.target.value; ui.undo = []; cancelEntry(); stopPlaylist(); save(); renderAll();
      syncVideoWithMatch();
      e.target.blur();
    });
    $('#btnNewMatch').onclick = () => openMatchDialog(false);
    $('#btnEditMatch').onclick = () => openMatchDialog(true);
    $$('.tab').forEach((b) => (b.onclick = () => setView(b.dataset.view)));
    $$('.subtab').forEach((b) => (b.onclick = () => setPanel(b.dataset.panel)));
    $('#btnExport').onclick = (e) => { e.stopPropagation(); $('#exportMenu').classList.toggle('hidden'); };
    document.addEventListener('click', () => $('#exportMenu').classList.add('hidden'));
    $('#exportMenu').onclick = (e) => {
      const k = e.target.dataset.export;
      if (k === 'json') exportJson(); else if (k === 'csv') exportCsv();
    };
    $('#btnImport').onclick = () => $('#importFile').click();
    $('#importFile').onchange = (e) => { if (e.target.files[0]) importJson(e.target.files[0]); e.target.value = ''; };

    // diálogo partido
    $('#matchForm').addEventListener('submit', (e) => {
      if (e.submitter && e.submitter.value !== 'ok') return;
      const fd = Object.fromEntries(new FormData(e.target).entries());
      if (editing) {
        const m = match();
        m.name = fd.name; m.date = fd.date;
        m.teams[0].name = fd.h_name; m.teams[0].players = [fd.h_p1, fd.h_p2];
        m.teams[1].name = fd.a_name; m.teams[1].players = [fd.a_p1, fd.a_p2];
      } else {
        const m = newMatchData(fd);
        store.matches.push(m); store.currentId = m.id; ui.undo = []; cancelEntry();
      }
      save(); renderAll(); syncVideoWithMatch();
    });
    $('#btnDeleteMatch').onclick = () => {
      const m = match();
      if (!m || !confirm(`¿Eliminar el partido ${teamName(m, 0)} vs ${teamName(m, 1)} y sus ${m.actions.length} acciones? Exporta antes si lo quieres conservar.`)) return;
      store.matches = store.matches.filter((x) => x.id !== m.id);
      DB.delMatch(m.id).catch(() => {});
      ui.captures = ui.captures.filter((c) => c.matchId !== m.id);
      if (!store.matches.length) store.matches.push(newMatchData({}));
      store.currentId = store.matches[0].id;
      $('#matchDialog').close(); save(); renderAll(); syncVideoWithMatch();
    };
    $('#btnCancelMatch').onclick = () => $('#matchDialog').close();
    $('#btnHelp').onclick = () => { $('#helpBody').innerHTML = helpHtml(); $('#helpDialog').showModal(); };

    // video
    $('#videoFile').onchange = (e) => { openVideoFile(e.target.files[0]); e.target.value = ''; };
    $('#btnChangeVideo').onclick = () => $('#videoFile').click();
    const wrap = $('.video-wrap');
    wrap.addEventListener('dragover', (e) => { e.preventDefault(); $('#videoDrop').classList.add('drag'); });
    wrap.addEventListener('dragleave', () => $('#videoDrop').classList.remove('drag'));
    wrap.addEventListener('drop', (e) => {
      e.preventDefault(); $('#videoDrop').classList.remove('drag');
      openVideoFile(e.dataTransfer.files[0]);
    });
    video.addEventListener('timeupdate', updateTime);
    video.addEventListener('play', updateTime);
    video.addEventListener('pause', updateTime);
    video.addEventListener('loadedmetadata', updateTime);
    video.addEventListener('click', togglePlay);
    video.addEventListener('error', () => toast('El navegador no puede reproducir este video (prueba MP4 H.264)'));
    $('#btnPlay').onclick = togglePlay;
    $$('[data-seek]').forEach((b) => (b.onclick = () => seekBy(Number(b.dataset.seek))));
    $('#seekBar').oninput = (e) => { if (ui.playlist) stopPlaylist(); if (video.duration) video.currentTime = (Number(e.target.value) / 1000) * video.duration; };
    $('#seekBar').onchange = (e) => e.target.blur();
    $('#speedSelect').onchange = (e) => { video.playbackRate = Number(e.target.value); e.target.blur(); };

    // registro por botones
    $('#playerButtons').onclick = (e) => {
      const b = e.target.closest('[data-team]'); if (!b) return;
      selectPlayer(Number(b.dataset.team), Number(b.dataset.player));
    };
    $('#skillButtons').onclick = (e) => {
      const b = e.target.closest('[data-skill]'); if (b) selectSkill(b.dataset.skill);
    };
    $('#typeButtons').onclick = (e) => {
      const b = e.target.closest('[data-type]'); if (b) toggleType(b.dataset.type);
    };
    $('#evalButtons').onclick = (e) => {
      const b = e.target.closest('[data-eval]'); if (b) commitEval(b.dataset.eval);
    };
    $('#btnPointHome').onclick = () => addAction({ team: 0, player: 0, skill: 'P', type: '', eval: '' });
    $('#btnPointAway').onclick = () => addAction({ team: 1, player: 0, skill: 'P', type: '', eval: '' });
    $('#setSelect').onchange = (e) => { const m = match(); m.currentSet = Number(e.target.value); save(); renderScore(); e.target.blur(); };
    $('#btnUndo').onclick = undo;

    // código
    const inp = $('#codeInput');
    inp.addEventListener('input', previewCode);
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (inp.value.trim()) commitCode(inp.value); }
      else if (e.key === 'Escape') { inp.value = ''; previewCode(); cancelEntry(); inp.blur(); }
      else if (e.key === ' ') { e.preventDefault(); togglePlay(); }
      else if (!inp.value && ['ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault(); seekBy((e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 5 : 2));
      }
    });

    // lista de acciones
    $('#actionList').addEventListener('click', (e) => {
      const row = e.target.closest('.arow'); if (!row) return;
      const m = match(); const a = m.actions.find((x) => x.id === row.dataset.id); if (!a) return;
      const op = e.target.dataset.op;
      if (op === 'del') {
        m.actions = m.actions.filter((x) => x.id !== a.id); save();
        renderActions(); renderScore(); renderFilters(); renderClips();
      } else if (op === 'retime') {
        a.t = Math.round((video.currentTime || 0) * 100) / 100;
        m.actions.sort((x, y) => x.t - y.t); save(); renderActions(); renderScore(); renderClips(); toast('Tiempo actualizado');
      } else if (op === 'note') {
        const n = prompt(`Nota para ${M.actionCode(a)} (${describe(m, a)}):`, a.note || '');
        if (n === null) return;
        a.note = n.trim(); save(); renderActions(); renderClips();
      } else if (op === 'play') {
        playSingle(a);
      } else if (!e.target.classList.contains('c') && video.src) {
        stopPlaylist(); video.currentTime = Math.max(0, a.t - clipWindow(a).pre);
      }
    });
    $('#actionList').addEventListener('keydown', (e) => {
      if (!e.target.classList.contains('c')) return;
      if (e.key === 'Escape') { renderActions(); return; }
      if (e.key === 'Enter') e.target.blur(); // dispara 'change'
    });
    $('#actionList').addEventListener('change', (e) => {
      if (!e.target.classList.contains('c')) return;
      const row = e.target.closest('.arow');
      const m = match(); const a = m.actions.find((x) => x.id === row.dataset.id); if (!a) return;
      const p = M.parseCode(e.target.value);
      if (p.error) { toast('Código inválido: ' + p.error); e.target.value = M.actionCode(a); return; }
      Object.assign(a, { team: p.team, player: p.player, skill: p.skill, type: p.type, eval: p.eval });
      save(); renderActions(); renderScore(); renderClips(); toast('Acción actualizada');
    });

    // clips
    const toggle = (set, key) => (set.has(key) ? set.delete(key) : set.add(key));
    const chipHandler = (id, set) => $(id).addEventListener('click', (e) => {
      const c = e.target.closest('.chip'); if (!c) return;
      toggle(ui.filters[set], c.dataset.key);
      if (set === 'skills') { // quitar tipos que ya no aplican
        for (const t of [...ui.filters.types]) if (ui.filters.skills.size && !ui.filters.skills.has(t[0])) ui.filters.types.delete(t);
      }
      stopPlaylist(); renderFilters(); renderClips();
    });
    chipHandler('#fPlayers', 'players'); chipHandler('#fSkills', 'skills'); chipHandler('#fEvals', 'evals');
    chipHandler('#fTypes', 'types'); chipHandler('#fSets', 'sets');
    $('#skipGap').onchange = () => { store.settings.merge = $('#skipGap').checked; save(); stopPlaylist(); renderClips(); };
    $('#clipTimesGrid').addEventListener('change', (e) => {
      const inp = e.target.closest('[data-skill]'); if (!inp) return;
      const v = Math.max(0, Math.min(15, Number(inp.value) || 0));
      store.settings.clip[inp.dataset.skill][inp.dataset.k] = v; inp.value = v;
      save(); stopPlaylist(); renderClips();
    });
    $('#btnClipReset').onclick = () => {
      store.settings.clip = JSON.parse(JSON.stringify(CLIP_DEFAULT));
      save(); stopPlaylist(); renderClipTimes(); renderClips(); toast('Tiempos de clip restaurados');
    };
    $('#btnPlayAll').onclick = () => startPlaylist(0);
    $('#btnStopAll').onclick = () => { stopPlaylist(); video.pause(); };
    $('#btnClearFilters').onclick = () => { Object.values(ui.filters).forEach((s) => s.clear()); stopPlaylist(); renderFilters(); renderClips(); };
    $('#btnFfmpeg').onclick = ffmpegScript;
    $('#clipList').addEventListener('click', (e) => {
      const row = e.target.closest('[data-clip]'); if (!row) return;
      const i = Number(row.dataset.clip);
      if (e.target.dataset.op === 'dl') {
        const r = clipRanges(filteredActions())[i];
        if (r) openExport([r], r.actions.length === 1 ? describe(match(), r.actions[0]) : `Clip ${i + 1}`);
      } else startPlaylist(i);
    });
    $('#btnExportVideo').onclick = () => openExport(clipRanges(filteredActions()), filtersTitle());
    $('#expStart').onclick = runExport;
    $('#expCancel').onclick = () => { if (exportState.running) exportState.signal.cancelled = true; else $('#exportDialog').close(); };
    $('#exportDialog').addEventListener('cancel', (e) => {
      if (exportState.running && !confirm('¿Cancelar la exportación?')) { e.preventDefault(); return; }
      if (exportState.running) exportState.signal.cancelled = true;
    });

    // reporte
    $('#reportScope').onchange = renderReport;
    $('#reportSet').onchange = renderReport;
    $('#btnPrint').onclick = () => window.print();
    $('#reportBody').addEventListener('click', (e) => {
      const td = e.target.closest('[data-link]'); if (!td) return;
      openClipsFromReport(JSON.parse(td.dataset.link));
    });

    // capturas / correcciones
    $('#btnCapture').onclick = captureFrame;
    $('#corrScope').onchange = renderCorrections;
    $('#corrPlayer').onchange = renderCorrections;
    $('#btnCorrPrint').onclick = () => { document.body.classList.add('print-corr'); window.print(); };
    window.addEventListener('afterprint', () => document.body.classList.remove('print-corr'));
    $('#corrBody').addEventListener('click', (e) => {
      const op = e.target.closest('[data-op]'); const card = e.target.closest('[data-cap]');
      if (!op || !card) return;
      const rec = ui.captures.find((c) => c.id === card.dataset.cap); if (!rec) return;
      if (op.dataset.op === 'edit') editCapture(rec);
      else if (op.dataset.op === 'video') goToCapture(rec);
      else if (op.dataset.op === 'png') downloadCapturePng(rec);
      else if (op.dataset.op === 'del' && confirm('¿Eliminar esta corrección?')) deleteCapture(rec);
    });

    // editor de teclas
    $('#btnKeys').onclick = () => { keyCapture = null; renderKeysDialog(); $('#keysDialog').showModal(); };
    $('#keysBody').addEventListener('click', (e) => {
      const cap = e.target.closest('[data-path]'), rs = e.target.closest('[data-reset]'), cl = e.target.closest('[data-clear]');
      if (cap) { keyCapture = keyCapture === cap.dataset.path ? null : cap.dataset.path; renderKeysDialog(); }
      else if (rs) { Keymap.set(km(), rs.dataset.reset, Keymap.get(Keymap.DEFAULT, rs.dataset.reset)); keymapChanged(); }
      else if (cl) { Keymap.set(km(), cl.dataset.clear, ''); keymapChanged(); }
    });
    // Se escucha en window (fase de captura): al redibujar, el foco puede salir del diálogo.
    window.addEventListener('keydown', (e) => {
      if (!keyCapture || !$('#keysDialog').open) return;
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') { keyCapture = null; renderKeysDialog(); return; }
      const combo = Keymap.fromEvent(e); if (!combo) return; // sólo modificador: esperar la tecla
      if (Keymap.RESERVED[combo]) { toast(`«${keyLabel(combo)}» está reservada: ${Keymap.RESERVED[combo]}`); return; }
      if (/^(Cmd|Ctrl)\+z$/.test(combo)) { toast('Cmd/Ctrl+Z está reservado para deshacer'); return; }
      Keymap.set(km(), keyCapture, combo);
      keyCapture = null; keymapChanged();
    }, true);
    $('#keysDialog').addEventListener('close', () => { keyCapture = null; });
    $('#btnKeysReset').onclick = () => {
      if (!confirm('¿Volver a las teclas por defecto?')) return;
      store.settings.keymap = Keymap.merge(null); keymapChanged();
    };
    $('#btnKeysExport').onclick = () => download('teclas-beach-scout.json', JSON.stringify({ app: 'beach-scout-keys', version: 1, keymap: km() }, null, 2), 'application/json');
    $('#btnKeysImport').onclick = () => $('#keysFile').click();
    $('#keysFile').onchange = (e) => {
      const file = e.target.files[0]; e.target.value = ''; if (!file) return;
      file.text().then((txt) => {
        const data = JSON.parse(txt);
        if (!data.keymap) throw new Error('no es un archivo de teclas');
        store.settings.keymap = Keymap.merge(data.keymap); keymapChanged(); toast('Teclas importadas');
      }).catch((err) => toast('No se pudo importar: ' + err.message));
    };

    // teclado global
    document.addEventListener('keydown', (e) => {
      if (document.querySelector('dialog[open]')) return;
      const t = e.target;
      const typing = t.tagName === 'TEXTAREA' ||
        (t.tagName === 'INPUT' && ['text', 'number', 'date', 'search', ''].includes(t.getAttribute('type') || ''));
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && (!typing || (t === inp && !inp.value))) {
        e.preventDefault(); undo(); return;
      }
      if (typing) return;
      if (e.key === 'Escape') { cancelEntry(); return; }
      if (ui.view !== 'scout') return;
      const combo = Keymap.fromEvent(e); if (!combo) return;
      if (handleScoutKey(combo)) e.preventDefault();
    });
  }

  // Registro por teclado. Devuelve true si la tecla hizo algo.
  function handleScoutKey(combo) {
    const k = km();
    const find = (obj) => Object.keys(obj || {}).find((x) => obj[x] === combo);
    const VIDEO = {
      play: togglePlay, back: () => seekBy(-2), fwd: () => seekBy(2), back5: () => seekBy(-5), fwd5: () => seekBy(5),
      frameBack: () => seekBy(-0.04), frameFwd: () => seekBy(0.04), slower: () => setSpeed(-1), faster: () => setSpeed(1),
    };
    const v = find(k.video);
    if (v) { VIDEO[v](); return true; }
    const stage = entryStage();
    if (/^(Cmd|Ctrl|Alt)\+/.test(combo)) return false; // no bloquear atajos del sistema
    if (stage !== 'idle' && combo === 'Backspace') { stepBack(); return true; }

    if (stage === 'idle') {
      const a = find(k.idle);
      const PLAYERS = { p01: [0, 1], p02: [0, 2], p11: [1, 1], p12: [1, 2] };
      if (a && PLAYERS[a]) { selectPlayer(...PLAYERS[a]); return true; }
      switch (a) {
        case 'pointHome': addAction({ team: 0, player: 0, skill: 'P', type: '', eval: '' }); return true;
        case 'pointAway': addAction({ team: 1, player: 0, skill: 'P', type: '', eval: '' }); return true;
        case 'capture': captureFrame(); return true;
        case 'codeInput': setPanel('entry'); $('#codeInput').focus(); return true;
        case 'nextSet': nextSet(); return true;
        case 'undo': undo(); return true;
        case 'help': $('#btnHelp').click(); return true;
      }
      if (combo === '*') { // atajo clásico: empezar a escribir un código Data Volley
        const inp = $('#codeInput'); setPanel('entry'); inp.focus(); inp.value = '*'; previewCode(); return true;
      }
      return false;
    }
    if (stage === 'skill') {
      const sk = find(k.skills);
      if (sk) { selectSkill(sk); return true; }
      toast(`«${keyLabel(combo)}» no es un fundamento (⌫ atrás, Esc cancela)`);
      return true;
    }
    // etapa de tipo / evaluación
    const t = find(k.types[ui.sel.skill]);
    if (t) { toggleType(t); return true; }
    const ev = find(k.evals) || (M.EVALS.includes(combo) ? combo : null); // los símbolos # + ! - / = siempre valen
    if (ev) { commitEval(ev); return true; }
    toast(`«${keyLabel(combo)}» no es tipo ni evaluación (⌫ atrás, Esc cancela)`);
    return true;
  }

  // ------------------------------------------------------ editor de teclas
  let keyCapture = null; // ruta que espera tecla nueva
  function renderKeysDialog() {
    const map = km();
    const { paths, messages } = Keymap.conflicts(map);
    const groups = new Map();
    for (const en of Keymap.entries(map)) { if (!groups.has(en.group)) groups.set(en.group, []); groups.get(en.group).push(en); }
    const def = Keymap.DEFAULT;
    $('#keysConflicts').innerHTML = messages.length
      ? `<b>⚠️ Teclas repetidas</b><ul>${messages.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : '';
    $('#keysBody').innerHTML = [...groups].map(([g, list]) => `
      <section class="keys-group"><h3>${esc(g)}</h3>
        ${list.map((en) => {
          const changed = en.key !== Keymap.get(def, en.path);
          return `<div class="keys-row ${paths.has(en.path) ? 'conflict' : ''}">
            <span>${esc(en.label)}</span>
            <button class="keycap ${keyCapture === en.path ? 'listening' : ''} ${en.key ? '' : 'empty'}" data-path="${esc(en.path)}" title="Clic y presiona la tecla nueva">
              ${keyCapture === en.path ? 'Presiona una tecla…' : esc(keyLabel(en.key))}</button>
            <button class="mini" data-reset="${esc(en.path)}" title="Volver a «${esc(keyLabel(Keymap.get(def, en.path)))}»" ${changed ? '' : 'disabled'}>↺</button>
            <button class="mini" data-clear="${esc(en.path)}" title="Quitar tecla" ${en.key ? '' : 'disabled'}>✕</button>
          </div>`;
        }).join('')}
      </section>`).join('');
    const listening = $('#keysBody .keycap.listening');
    if (listening) listening.focus({ preventScroll: true });
  }
  function keymapChanged() { save(); renderKeysDialog(); renderEntryButtons(); }

  function undo() {
    const m = match(); if (!m) return;
    let a = null;
    while (ui.undo.length && !a) { const id = ui.undo.pop(); a = m.actions.find((x) => x.id === id) || null; }
    if (!a) { toast('Nada que deshacer'); return; }
    m.actions = m.actions.filter((x) => x.id !== a.id);
    save(); renderActions(); renderScore(); renderFilters(); renderClips();
    toast('Deshecho: ' + M.actionCode(a));
  }

  // ------------------------------------------------------------------ init
  load();
  bind();
  window.addEventListener('pagehide', () => { if (saveTimer) flush(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && saveTimer) flush(); });
  if (!store.matches.length) {
    const m = newMatchData({});
    store.matches.push(m); store.currentId = m.id; save();
    renderAll();
    openMatchDialog(true);
  } else {
    if (!match()) store.currentId = store.matches[0].id;
    renderAll();
  }
  updateTime();
  DB.all().then((list) => { ui.captures = list || []; renderActions(); })
    .catch(() => toast('No se pudieron cargar las capturas guardadas'));
})();
