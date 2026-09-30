/* Beach Scout — modelo de datos, códigos y estadísticas.
 * Convenciones basadas en Data Volley (evaluaciones # + ! - / =),
 * adaptadas a voleibol de playa (2 jugadores por equipo). */
(function () {
  'use strict';

  const TEAMS = ['*', 'a']; // 0 = local, 1 = visita (igual que Data Volley)

  const SKILLS = {
    S: { name: 'Saque', short: 'Saq' },
    R: { name: 'Recepción', short: 'Rec' },
    E: { name: 'Armado', short: 'Arm' },
    A: { name: 'Ataque', short: 'Ata' },
    B: { name: 'Bloqueo', short: 'Blo' },
    D: { name: 'Defensa', short: 'Def' },
    F: { name: 'Free ball', short: 'Free' },
  };
  const SKILL_ORDER = ['S', 'R', 'E', 'A', 'B', 'D', 'F'];

  const TYPES = {
    S: { Q: 'Salto potente', M: 'Salto flotado', H: 'Flotado de pie' },
    A: { H: 'Potente', C: 'Corte', P: 'Pokey', G: 'Globo', L: 'Línea', O: 'Segundo toque' },
    E: { M: 'Con manos', B: 'Antebrazos' },
    B: { B: 'Bloqueo', F: 'Amague / retirada' },
    D: {}, R: {}, F: {},
  };

  const EVALS = ['#', '+', '!', '-', '/', '='];
  const EVAL_NAME = {
    '#': 'Doble positiva', '+': 'Positiva', '!': 'Neutra',
    '-': 'Negativa', '/': 'Negativa especial', '=': 'Doble negativa',
  };

  // Significado de cada evaluación por fundamento (criterio Data Volley).
  const EVAL_MEANING = {
    S: { '#': 'Ace', '+': 'Recepción rival mala, sin ataque cómodo', '!': 'Recepción rival regular',
         '-': 'Recepción rival perfecta', '/': 'Rival devuelve free ball / pasada', '=': 'Error de saque' },
    R: { '#': 'Perfecta, todas las opciones de ataque', '+': 'Buena, ataque cómodo', '!': 'Regular, ataque limitado',
         '-': 'Mala, ataque forzado', '/': 'Pasada directa al rival', '=': 'Error / ace recibido' },
    E: { '#': 'Armado perfecto', '+': 'Buen armado', '!': 'Armado regular',
         '-': 'Armado malo', '/': 'Armado pasado / falta de toque', '=': 'Error de armado' },
    A: { '#': 'Punto', '+': 'Positivo, rival en dificultad', '!': 'Bloqueado y cubierto / neutro',
         '-': 'Rival defiende cómodo', '/': 'Bloqueado (punto rival)', '=': 'Error de ataque' },
    B: { '#': 'Punto de bloqueo', '+': 'Toque positivo, contraataque cómodo', '!': 'Toque neutro',
         '-': 'Toque que favorece al rival', '/': 'Invasión / red', '=': 'Error (tapadera, out)' },
    D: { '#': 'Defensa perfecta', '+': 'Defensa buena', '!': 'Defensa regular',
         '-': 'Defensa mala', '/': 'Defensa pasada al rival', '=': 'Error / no levanta' },
    F: { '#': 'Perfecta', '+': 'Buena', '!': 'Regular',
         '-': 'Mala', '/': 'Pasada al rival', '=': 'Error' },
  };

  // --- Códigos --------------------------------------------------------------
  // Formato:  [equipo][jugador][fundamento][tipo?][evaluación]
  //   equipo  : * (local) | a (visita)      — opcional si el jugador es 3 o 4
  //   jugador : 1 | 2   (3 = visita 1, 4 = visita 2 como atajo)
  //   Ej.: *1R#   a2AC+   3S=   4AH#
  //   zonas opcionales al final (Data Volley): inicio y destino, 1-9 (0 = sin inicio)
  //   Ej.: *1AC#35 = ataque de corte de zona 3 a zona 5 · a1SQ+15 · *2R#6 (recepción en zona 6)
  // Punto manual:  *P  |  aP
  function parseCode(raw) {
    const code = String(raw || '').trim().replace(/\s+/g, '');
    if (!code) return { error: 'vacío' };

    let m = /^([*aA])[pP]$/.exec(code);
    if (m) return { team: m[1] === '*' ? 0 : 1, skill: 'P', player: 0, type: '', eval: '' };

    m = /^([*aA])?([1-4])([a-zA-Z])([a-zA-Z])?([#+!\-/=])([0-9])?([1-9])?$/.exec(code);
    if (!m) return { error: 'Formato: *1R#, a2AC+, 3S=, zonas: *1AC#35' };

    let team = m[1] ? (m[1] === '*' ? 0 : 1) : null;
    let player = Number(m[2]);
    if (player > 2) {
      if (team === 0) return { error: 'Jugador local sólo puede ser 1 o 2' };
      team = 1; player -= 2;
    }
    if (team === null) team = 0;

    const skill = m[3].toUpperCase();
    if (!SKILLS[skill]) return { error: `Fundamento "${skill}" no existe (S R E A B D F)` };
    const type = (m[4] || '').toUpperCase();
    if (type && !TYPES[skill][type]) {
      const valid = Object.keys(TYPES[skill]).join(' ') || 'ninguno';
      return { error: `Tipo "${type}" no válido para ${SKILLS[skill].name} (${valid})` };
    }
    const out = { team, player, skill, type, eval: m[5] };
    const z1 = m[6] ? Number(m[6]) : 0, z2 = m[7] ? Number(m[7]) : 0;
    if (z1 === 0 && m[6] && !z2) return { error: 'Zona 0 sólo vale como inicio desconocido (ej. 05)' };
    if (z1 || z2) {
      const own = team === 0;             // cancha guardada: local abajo, visita arriba
      if (DIRECTIONAL[skill]) {
        if (z1) out.from = zoneCenter(z1, own, skill === 'S');
        if (z2) out.to = zoneCenter(z2, !own);
      } else {
        if (z2) return { error: `${SKILLS[skill].name} lleva una sola zona (dónde ocurre)` };
        out.from = zoneCenter(z1, own);
      }
    }
    return out;
  }

  function actionCode(a) {
    if (a.skill === 'P') return TEAMS[a.team] + 'P';
    let z = '';
    if (DIRECTIONAL[a.skill]) { if (a.to) z = String(zoneOf(a.from) || 0) + zoneOf(a.to); else if (a.from) z = String(zoneOf(a.from)); }
    else if (a.from) z = String(zoneOf(a.from));
    return TEAMS[a.team] + a.player + a.skill + (a.type || '') + a.eval + z;
  }

  // --- Cancha y zonas -------------------------------------------------------
  // Coordenadas en metros. Cancha de playa 8 × 16 m, red en y = 8.
  // Se guarda siempre con el LOCAL abajo (y 8–16) y la VISITA arriba (y 0–8);
  // "invertir cancha" sólo cambia cómo se dibuja, no lo guardado.
  const COURT = { W: 8, L: 16, NET: 8 };
  const DIRECTIONAL = { S: true, A: true };          // llevan inicio → destino
  // Zonas vistas por el equipo que ocupa esa mitad, mirando la red (igual que Data Volley).
  const ZONE_GRID = [[4, 3, 2], [7, 8, 9], [5, 6, 1]]; // fila: delantera, media, zaguera · col: izq, centro, der

  function zoneOf(p) {
    if (!p) return null;
    let x = p.x, y = p.y;
    if (y < COURT.NET) { x = COURT.W - x; y = COURT.L - y; } // mitad de arriba: girar 180°
    const t = COURT.W / 3;
    const col = Math.max(0, Math.min(2, Math.floor(x / t)));
    const row = Math.max(0, Math.min(2, Math.floor((y - COURT.NET) / t)));
    return ZONE_GRID[row][col];
  }
  function isOut(p) { return !!p && (p.x < 0 || p.x > COURT.W || p.y < 0 || p.y > COURT.L); }

  // Centro de una zona en la mitad de abajo (bottom=true) o de arriba.
  // serveLine=true: para el inicio de un saque se ubica detrás de la línea de fondo.
  function zoneCenter(z, bottom, serveLine) {
    let row = 0, col = 0;
    ZONE_GRID.forEach((r, ri) => r.forEach((v, ci) => { if (v === z) { row = ri; col = ci; } }));
    const t = COURT.W / 3;
    let x = (col + 0.5) * t, y = COURT.NET + (row + 0.5) * t;
    if (serveLine) y = COURT.L + 1;
    if (!bottom) { x = COURT.W - x; y = COURT.L - y; }
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  }

  // --- Marcador y rallies ---------------------------------------------------
  // Devuelve el equipo que gana el rally con esta acción, o null si no termina.
  function rallyWinner(a) {
    if (a.skill === 'P') return a.team;
    if (a.eval === '#' && (a.skill === 'S' || a.skill === 'A' || a.skill === 'B')) return a.team;
    if (a.eval === '=') return 1 - a.team;
    if (a.eval === '/' && (a.skill === 'A' || a.skill === 'B')) return 1 - a.team;
    return null;
  }

  // Segmenta las acciones en rallies. Un rally empieza en un saque (o en la primera
  // acción después de que el rally anterior terminó) y lo gana la primera acción terminal.
  // Acciones registradas hasta RALLY_TAIL s después del punto (p. ej. el B# tras un A/)
  // pertenecen al mismo rally y no vuelven a sumar.
  const RALLY_TAIL = 3;
  function computeRallies(actions) {
    const sorted = [...actions].sort((x, y) => (x.set - y.set) || (x.t - y.t));
    const rallies = [];
    let cur = null;
    for (const a of sorted) {
      const isNew = !cur || cur.set !== a.set || a.skill === 'S' ||
        (cur.winner !== null && a.t - cur.end > RALLY_TAIL);
      if (isNew) {
        cur = { set: a.set, server: a.skill === 'S' ? a.team : null, start: a.t, winner: null, end: null, actions: [] };
        rallies.push(cur);
      }
      cur.actions.push(a);
      if (cur.winner === null) {
        const w = rallyWinner(a);
        if (w !== null) { cur.winner = w; cur.end = a.t; }
      }
    }
    return rallies;
  }

  function computeScore(actions) {
    const rallies = computeRallies(actions);
    const sets = {};
    for (const r of rallies) {
      if (r.winner === null) continue;
      const s = (sets[r.set] = sets[r.set] || [0, 0]);
      s[r.winner]++;
    }
    return { sets, rallies };
  }

  // Side-out y break point por equipo.
  function computePhases(rallies) {
    const out = [0, 1].map(() => ({ recv: 0, sideout: 0, serve: 0, breakpt: 0 }));
    for (const r of rallies) {
      if (r.server === null || r.winner === null) continue;
      const recv = 1 - r.server;
      out[recv].recv++; out[r.server].serve++;
      if (r.winner === recv) out[recv].sideout++; else out[r.server].breakpt++;
    }
    return out;
  }

  // --- Estadísticas ---------------------------------------------------------
  function emptyCounts() {
    const c = { total: 0 };
    for (const e of EVALS) c[e] = 0;
    return c;
  }

  function metrics(skill, c) {
    const t = c.total || 0;
    const pct = (n) => (t ? (100 * n) / t : null);
    const m = {
      pos: pct(c['#'] + c['+']),
      perf: pct(c['#']),
      err: pct(c['=']),
    };
    switch (skill) {
      case 'S': m.eff = pct(c['#'] - c['=']); break;
      case 'R': m.eff = pct(c['#'] + c['+'] - c['/'] - c['=']); break;
      case 'A': m.eff = pct(c['#'] - c['/'] - c['=']); break;
      default: m.eff = pct(c['#'] + c['+'] - c['=']);
    }
    return m;
  }

  // key -> counts. key = `${team}|${player}|${skill}`  (player 0 = todo el equipo)
  function aggregate(actions) {
    const map = new Map();
    const bump = (key, e) => {
      let c = map.get(key);
      if (!c) map.set(key, (c = emptyCounts()));
      c.total++; c[e]++;
    };
    for (const a of actions) {
      if (a.skill === 'P') continue;
      bump(`${a.team}|${a.player}|${a.skill}`, a.eval);
      bump(`${a.team}|0|${a.skill}`, a.eval);
      if (a.type) bump(`${a.team}|${a.player}|${a.skill}|${a.type}`, a.eval);
    }
    return map;
  }

  window.Model = {
    TEAMS, SKILLS, SKILL_ORDER, TYPES, EVALS, EVAL_NAME, EVAL_MEANING,
    COURT, DIRECTIONAL, zoneOf, zoneCenter, isOut,
    parseCode, actionCode, rallyWinner, computeRallies, computeScore, computePhases,
    emptyCounts, metrics, aggregate,
  };
})();
