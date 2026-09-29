/* Beach Scout — mapa de teclas configurable.
 * El registro va por etapas: JUGADOR → FUNDAMENTO → (TIPO) → EVALUACIÓN.
 * Una tecla sólo tiene que ser única dentro de su etapa, así "1" puede ser
 * jugador en la primera etapa y "doble positiva" en la última. */
(function () {
  'use strict';
  const M = window.Model;

  const DEFAULT = {
    video: {
      play: 'Space', back: 'ArrowLeft', fwd: 'ArrowRight', back5: 'Shift+ArrowLeft', fwd5: 'Shift+ArrowRight',
      frameBack: ',', frameFwd: '.', slower: '[', faster: ']',
    },
    idle: {
      p01: '1', p02: '2', p11: '3', p12: '4',
      pointHome: 'z', pointAway: 'x', capture: 'c', codeInput: 'Enter', nextSet: '', undo: '', help: '?',
    },
    skills: { S: 's', R: 'r', E: 'e', A: 'a', B: 'b', D: 'd', F: 'f' },
    types: {
      S: { Q: 'q', M: 'm', H: 'h' },
      A: { H: 'h', C: 'c', P: 'p', G: 'g', L: 'l', O: 'o' },
      E: { M: 'm', B: 'b' },
      B: { B: 'b', F: 'f' },
    },
    evals: { '#': '1', '+': '2', '!': '3', '-': '4', '/': '5', '=': '6' },
  };

  // Teclas fijas (no configurables).
  const RESERVED = { Escape: 'Cancelar acción en curso', Backspace: 'Paso atrás (durante una acción)' };

  const LABELS = {
    video: {
      _title: 'Video (funcionan siempre)',
      play: 'Play / pausa', back: 'Atrás 2 s', fwd: 'Adelante 2 s', back5: 'Atrás 5 s', fwd5: 'Adelante 5 s',
      frameBack: 'Frame atrás', frameFwd: 'Frame adelante', slower: 'Más lento', faster: 'Más rápido',
    },
    idle: {
      _title: '1 · Inicio de la acción',
      p01: 'Local · jugador 1', p02: 'Local · jugador 2', p11: 'Visita · jugador 1', p12: 'Visita · jugador 2',
      pointHome: 'Punto manual local', pointAway: 'Punto manual visita', capture: '📷 Capturar fotograma',
      codeInput: 'Ir a la caja de código', nextSet: 'Pasar al siguiente set', undo: 'Deshacer última acción', help: 'Ayuda',
    },
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // Mezcla lo guardado con los valores por defecto (así las teclas nuevas de futuras versiones aparecen).
  function merge(saved) {
    const out = clone(DEFAULT);
    if (!saved || typeof saved !== 'object') return out;
    for (const sec of ['video', 'idle', 'skills', 'evals']) {
      for (const k of Object.keys(out[sec])) if (saved[sec] && typeof saved[sec][k] === 'string') out[sec][k] = saved[sec][k];
    }
    for (const s of Object.keys(out.types)) {
      for (const k of Object.keys(out.types[s])) {
        const v = saved.types && saved.types[s] && saved.types[s][k];
        if (typeof v === 'string') out.types[s][k] = v;
      }
    }
    return out;
  }

  // KeyboardEvent -> "Shift+ArrowLeft", "s", "1", "#", "Space"...
  function fromEvent(e) {
    const k = e.key;
    if (!k || ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Dead', 'Unidentified'].includes(k)) return null;
    const mods = [];
    if (e.ctrlKey) mods.push('Ctrl');
    if (e.metaKey) mods.push('Cmd');
    if (e.altKey) mods.push('Alt');
    let name;
    if (k === ' ') name = 'Space';
    else if (k.length === 1) name = k.toLowerCase(); // el Shift ya está incluido en el carácter (# ! / =)
    else { name = k; if (e.shiftKey) mods.push('Shift'); }
    return mods.length ? `${mods.join('+')}+${name}` : name;
  }

  const PRETTY = {
    Space: 'Espacio', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
    Enter: 'Enter', Backspace: '⌫', Escape: 'Esc', Tab: 'Tab', Delete: 'Supr',
  };
  function pretty(combo) {
    if (!combo) return '—';
    const m = /^((?:(?:Ctrl|Cmd|Alt|Shift)\+)*)(.+)$/.exec(combo); // la tecla "+" también funciona
    const mods = m[1] ? m[1].slice(0, -1).split('+') : [];
    const name = PRETTY[m[2]] || (m[2].length === 1 ? m[2].toUpperCase() : m[2]);
    return [...mods.map((p) => ({ Cmd: '⌘', Ctrl: 'Ctrl', Alt: '⌥', Shift: '⇧' }[p])), name].join(mods.length ? ' ' : '');
  }

  // Lista plana de todas las asignaciones: { path, section, label, key }
  function entries(map) {
    const out = [];
    for (const sec of ['video', 'idle']) {
      for (const k of Object.keys(DEFAULT[sec])) out.push({ path: `${sec}.${k}`, group: LABELS[sec]._title, label: LABELS[sec][k], key: map[sec][k] });
    }
    for (const s of M.SKILL_ORDER) out.push({ path: `skills.${s}`, group: '2 · Fundamento', label: M.SKILLS[s].name, key: map.skills[s] });
    for (const s of Object.keys(DEFAULT.types)) {
      for (const t of Object.keys(DEFAULT.types[s])) {
        out.push({ path: `types.${s}.${t}`, group: `3 · Tipo de ${M.SKILLS[s].name.toLowerCase()}`, label: M.TYPES[s][t], key: map.types[s][t] });
      }
    }
    for (const e of M.EVALS) out.push({ path: `evals.${e}`, group: '4 · Evaluación (registra la acción)', label: `${e} ${M.EVAL_NAME[e]}`, key: map.evals[e] });
    return out;
  }

  function get(map, path) { return path.split('.').reduce((o, k) => o && o[k], map); }
  function set(map, path, val) {
    const parts = path.split('.'); const last = parts.pop();
    parts.reduce((o, k) => o[k], map)[last] = val;
  }

  // Teclas que están activas a la vez (deben ser distintas entre sí).
  function scopes(map) {
    const list = (sec, obj) => Object.keys(obj).map((k) => [`${sec}.${k}`, obj[k]]);
    const video = list('video', map.video);
    const out = [
      { name: 'inicio', items: [...video, ...list('idle', map.idle), ['reserved.Escape', 'Escape']] },
      { name: 'fundamento', items: [...video, ...list('skills', map.skills), ['reserved.Escape', 'Escape'], ['reserved.Backspace', 'Backspace']] },
    ];
    for (const s of M.SKILL_ORDER) {
      out.push({
        name: `evaluación de ${M.SKILLS[s].name.toLowerCase()}`,
        items: [...video, ...list(`types.${s}`, map.types[s] || {}), ...list('evals', map.evals), ['reserved.Escape', 'Escape'], ['reserved.Backspace', 'Backspace']],
      });
    }
    return out;
  }

  // Devuelve { paths:Set, messages:[] } con las teclas repetidas dentro de una misma etapa.
  function conflicts(map) {
    const paths = new Set(), messages = new Set();
    for (const sc of scopes(map)) {
      const byKey = new Map();
      for (const [p, k] of sc.items) { if (!k) continue; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(p); }
      for (const [k, ps] of byKey) {
        const uniq = [...new Set(ps)];
        if (uniq.length < 2) continue;
        uniq.forEach((p) => { if (!p.startsWith('reserved.')) paths.add(p); });
        messages.add(`«${pretty(k)}» está repetida en la etapa de ${sc.name}: ${uniq.map(labelOf).join(' / ')}`);
      }
    }
    return { paths, messages: [...messages] };
  }

  function labelOf(path) {
    if (path.startsWith('reserved.')) return RESERVED[path.slice(9)] + ' (fija)';
    const e = entries(DEFAULT).find((x) => x.path === path);
    return e ? e.label : path;
  }

  window.Keymap = { DEFAULT, RESERVED, merge, fromEvent, pretty, entries, get, set, conflicts, clone };
})();
