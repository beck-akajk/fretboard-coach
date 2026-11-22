/* 프렛 코치 — 앱 로직 */
(function (global) {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };
  const FINGER_NAME = { 1: '검지', 2: '중지', 3: '약지', 4: '소지' };
  const FINGER_COLOR = { 1: '#4a9eff', 2: '#2fd07a', 3: '#ff9f43', 4: '#b07cff', 0: '#9aa6bd' };
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  const S = {
    score: null,
    trackIndex: 0,
    mode: 'auto',
    order: 'low',          // low = 6번줄 아래
    bars: [],
    flat: [],
    cur: 0,
    speed: 0.8,
    playing: false,
    loopA: null,
    loopB: null,
    metronome: false,
    saved: [],
    lastId: null
  };

  const P = {
    timer: null,
    raf: 0,
    cursor: 0,
    nextTime: 0,
    log: [],
    logPos: 0
  };

  // ---------------------------------------------------------------- 유틸
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function colorOf(f) { return FINGER_COLOR[f] || FINGER_COLOR[0]; }
  function rowOf(str) { return S.order === 'low' ? str - 1 : 6 - str; }
  function track() { return S.score ? S.score.tracks[S.trackIndex] : null; }

  // ---------------------------------------------------------------- 바레 묶음
  // 같은 손가락이 같은 프렛에서 2줄 이상을 짚으면 그 줄들을 한 막대로 묶는다.
  // list: [{ string: 1~6, fret, finger: 1~4 }]
  function barreGroups(list) {
    const map = {};
    list.forEach(function (n) {
      if (!n.finger || n.finger < 1 || n.fret <= 0) return;
      const k = n.finger + ':' + n.fret;
      if (!map[k]) map[k] = [];
      map[k].push(n.string);
    });
    const out = [];
    Object.keys(map).forEach(function (k) {
      const strings = map[k];
      if (strings.length < 2) return;
      const parts = k.split(':');
      out.push({
        finger: Number(parts[0]),
        fret: Number(parts[1]),
        from: Math.max.apply(null, strings),
        to: Math.min.apply(null, strings),
        strings: strings.slice().sort(function (a, b) { return a - b; })
      });
    });
    return out;
  }

  // ------------------------------------------------------------ 미니 코드표(SVG)
  // 가로형(지판·타브와 같은 시선): 왼쪽→오른쪽이 낮은 프렛→높은 프렛, 위→아래가 1번줄→6번줄.
  // 뮤트(×)·개방(○)은 왼쪽 너트 바깥 각 줄 높이, 1번 손가락 바레는 세로 막대.
  function chordDiagramSVG(shape) {
    if (!shape) return '';
    const frets = shape.frets;
    const fingers = shape.fingers;
    const pressedF = frets.filter(function (f) { return f > 0; });
    const list = [];
    for (let i = 0; i < 6; i++) {
      if (frets[i] > 0 && fingers[i] > 0) list.push({ string: 6 - i, fret: frets[i], finger: fingers[i] });
    }
    const barres = barreGroups(list);
    const inBarre = {};
    barres.forEach(function (b) {
      b.strings.forEach(function (s) { inBarre[s + ':' + b.fret] = true; });
    });

    // 시작 프렛: 바레 폼은 바레 프렛부터 보여 준다(2fr·3fr …)
    const barre0 = barres.filter(function (b) { return b.finger === 1; })[0] || barres[0] || null;
    let start = 1;
    let cols = 5;
    if (pressedF.length) {
      const mn = Math.min.apply(null, pressedF);
      const mx = Math.max.apply(null, pressedF);
      if (barre0 && barre0.fret >= 2) start = barre0.fret;
      else start = (mn > 2 || mx > 4) ? mn : 1;
      const need = mx - start + 1;
      cols = need > 5 ? Math.min(6, need) : 5;
    }

    const W = 136;
    const padT = 13, padB = 6, padL = 16, padR = 5;
    const rowH = 9.4;
    const H = padT + 5 * rowH + padB;
    const x0 = padL, x1 = W - padR;
    const y0 = padT;
    const y1 = padT + 5 * rowH;
    const fretW = (x1 - x0) / cols;
    const X = function (fret) { return x0 + (fret - start + 0.5) * fretW; };
    const Y = function (str) { return y0 + rowOf(str) * rowH; };

    const out = [];
    out.push('<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(shape.name) + ' 코드 운지표">');

    // 프렛 번호 (위) — 시작 프렛이 1이 아니면 첫 칸은 'nfr' 표기가 대신한다
    for (let k = (start > 1 ? 1 : 0); k < cols; k++) {
      const num = start + k;
      const mark = [3, 5, 7, 9, 12, 15].indexOf(num) >= 0;
      out.push('<text x="' + X(num).toFixed(1) + '" y="' + (padT - 4).toFixed(1) + '" text-anchor="middle" font-size="7.2" font-weight="' +
        (mark ? 800 : 600) + '" fill="' + (mark ? '#a3b0c6' : '#6b7690') + '">' + num + '</text>');
    }
    // 줄 (가로선) — 위에서 내려다본 지판과 같은 방향
    for (let s = 1; s <= 6; s++) {
      const y = Y(s);
      out.push('<line x1="' + x0 + '" y1="' + y.toFixed(1) + '" x2="' + x1 + '" y2="' + y.toFixed(1) +
        '" stroke="#5a6b85" stroke-width="' + (s === 1 || s === 6 ? 1.5 : 1) + '"/>');
    }
    // 프렛 (세로선), 1프렛부터면 왼쪽이 굵은 너트
    for (let k = 0; k <= cols; k++) {
      const x = x0 + k * fretW;
      const nut = (k === 0 && start === 1);
      out.push('<line x1="' + x.toFixed(1) + '" y1="' + y0 + '" x2="' + x.toFixed(1) + '" y2="' + y1 +
        '" stroke="' + (nut ? '#dfe6f3' : '#39435a') + '" stroke-width="' + (nut ? 3.4 : 1) + '"/>');
    }
    // 시작 프렛 표기
    if (start > 1) {
      out.push('<text x="' + (x0 - 2).toFixed(1) + '" y="' + (padT - 4).toFixed(1) +
        '" text-anchor="end" font-size="7" font-weight="700" fill="#8c95a9">' + start + 'fr</text>');
    }
    // × / ○ — 너트 바깥, 각 줄 높이
    for (let s = 1; s <= 6; s++) {
      const f = frets[6 - s];
      const cy = Y(s);
      const cx = x0 - 5.5;
      if (f < 0) {
        out.push('<path d="M' + (cx - 2.2).toFixed(1) + ' ' + (cy - 2.2).toFixed(1) + 'L' + (cx + 2.2).toFixed(1) + ' ' + (cy + 2.2).toFixed(1) +
          'M' + (cx + 2.2).toFixed(1) + ' ' + (cy - 2.2).toFixed(1) + 'L' + (cx - 2.2).toFixed(1) + ' ' + (cy + 2.2).toFixed(1) +
          '" stroke="#9aa6bc" stroke-width="1.4" stroke-linecap="round"/>');
      } else if (f === 0) {
        out.push('<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="2.4" fill="none" stroke="#b8c1d4" stroke-width="1.2"/>');
      }
    }
    // 바레 막대 — 1번 검지가 여러 줄을 세로로 이어 누른다
    barres.forEach(function (b) {
      const c = colorOf(b.finger);
      const cx = X(b.fret);
      const yA = Y(b.from), yB = Y(b.to);
      const yT = Math.min(yA, yB) - rowH * 0.42;
      const yBot = Math.max(yA, yB) + rowH * 0.42;
      const w = rowH * 0.66;
      out.push('<rect x="' + (cx - w / 2).toFixed(1) + '" y="' + yT.toFixed(1) + '" width="' + w.toFixed(1) +
        '" height="' + (yBot - yT).toFixed(1) + '" rx="' + (w / 2).toFixed(1) + '" fill="' + c + '" opacity="0.92"/>');
      out.push('<text x="' + cx.toFixed(1) + '" y="' + ((yT + yBot) / 2 + 2.4).toFixed(1) +
        '" text-anchor="middle" font-size="7.4" font-weight="800" fill="#0b0e14">' + b.finger + '</text>');
    });
    // 손가락 점
    list.forEach(function (n) {
      if (inBarre[n.string + ':' + n.fret]) return;
      const cx = X(n.fret);
      const cy = Y(n.string);
      const r = rowH * 0.44;
      const c = colorOf(n.finger);
      out.push('<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="' + c + '"/>');
      out.push('<text x="' + cx.toFixed(1) + '" y="' + (cy + r * 0.4).toFixed(1) + '" text-anchor="middle" font-size="' +
        (r * 1.15).toFixed(1) + '" font-weight="800" fill="#0b0e14">' + n.finger + '</text>');
    });
    out.push('</svg>');
    return out.join('');
  }

  function toast(msg, ms) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, ms || 2600);
  }

  // ---------------------------------------------------------------- 분석
  function rebuild(keepTick) {
    const tr = track();
    if (!tr) return;
    const bars = [];
    let prevShape = null;
    for (let bi = 0; bi < tr.bars.length; bi++) {
      const r = global.Finger.analyzeBar(tr.bars[bi], tr, S.mode, prevShape);
      prevShape = r.prevShape;
      bars.push({ bar: tr.bars[bi], events: r.events, shapes: r.shapes });
    }
    let gi = 0;
    const flat = [];
    bars.forEach(function (b, bi) {
      b.events.forEach(function (ev, ei) {
        ev.barIndex = bi;
        ev.barEventIndex = ei;
        ev.gi = gi++;
        flat.push(ev);
      });
    });
    S.bars = bars;
    S.flat = flat;

    let next = 0;
    if (keepTick != null) {
      next = flat.findIndex(function (e) { return e.tick >= keepTick; });
      if (next < 0) next = flat.length - 1;
      if (next < 0) next = 0;
    }
    S.cur = Math.max(0, Math.min(next, Math.max(0, flat.length - 1)));

    renderStrip();
    renderAll();
  }

  function model() {
    const tr = track();
    if (!tr) return null;
    if (S.flat[S.cur]) return S.flat[S.cur];
    return S.flat[0] || null;
  }

  // ---------------------------------------------------------------- 재생 시간
  function barOf(index) {
    const tr = track();
    return tr ? tr.bars[index] : null;
  }
  function evSeconds(ev) {
    const b = barOf(ev.barIndex);
    const tempo = (b && b.tempo) || 120;
    return (ev.dur / 960) * (60 / tempo) / S.speed;
  }
  function loopRange() {
    if (S.loopA == null) return null;
    const a = S.loopA;
    const b = S.loopB == null ? S.loopA : S.loopB;
    return { a: Math.min(a, b), b: Math.max(a, b) };
  }
  function firstIndexInBar(bi) {
    for (let i = 0; i < S.flat.length; i++) if (S.flat[i].barIndex >= bi) return i;
    return S.flat.length;
  }
  function isLastEventOfBar(ev) {
    const b = S.bars[ev.barIndex];
    return b && ev.barEventIndex === b.events.length - 1;
  }

  // ---------------------------------------------------------------- 지판
  function drawFretboard() {
    const svg = $('fretboard');
    const wrap = svg.parentElement;
    const W = Math.max(300, Math.round((wrap.clientWidth || 360) - 10));
    const narrow = W < 520;
    const FRETS = narrow ? 7 : 12;
    const H = narrow ? Math.round(W * 0.66) : 250;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    const LEFT = narrow ? 48 : 70;
    const RIGHT = narrow ? 10 : 18;
    const TOP = narrow ? 42 : 56;
    const BOT = narrow ? 16 : 22;
    const gap = (H - TOP - BOT) / 5;
    const fretW = (W - LEFT - RIGHT) / FRETS;
    const ev = S.flat[S.cur] || null;
    const fingers = ev ? ev.fingers : [];
    const ghosts = ev ? ev.ghosts : [];

    const fretted = fingers.filter(function (f) { return f.fret > 0; }).map(function (f) { return f.fret; })
      .concat(ghosts.filter(function (f) { return f.fret > 0; }).map(function (f) { return f.fret; }));
    let start = 1;
    if (fretted.length) {
      const mn = Math.min.apply(null, fretted);
      const mx = Math.max.apply(null, fretted);
      start = Math.max(1, mn - 1);
      if (mx > start + FRETS - 1) start = Math.max(1, mx - FRETS + 1);
    }

    const fs = narrow ? 10 : 11;      // 기본 글자
    const rBadge = narrow ? 10.5 : 12;
    const out = [];
    out.push('<defs><filter id="glow" x="-60%" y="-60%" width="220%" height="220%">' +
      '<feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>');

    // 포지션 브래킷
    if (ev && ev.engine === 'position' && ev.position != null) {
      const p0 = Math.max(start, ev.position);
      const p1 = Math.min(start + FRETS - 1, ev.position + 4);
      if (p1 >= p0) {
        const x0 = LEFT + (p0 - start) * fretW;
        const x1 = LEFT + (p1 - start + 1) * fretW;
        out.push('<rect x="' + x0.toFixed(1) + '" y="' + (TOP - 18) + '" width="' + (x1 - x0).toFixed(1) +
          '" height="' + (H - TOP - BOT + 30) + '" rx="7" fill="rgba(255,182,77,.07)" stroke="rgba(255,182,77,.35)" stroke-dasharray="4 4"/>');
        out.push('<text x="' + ((x0 + x1) / 2).toFixed(1) + '" y="' + (TOP - 22) +
          '" text-anchor="middle" fill="rgba(255,182,77,.85)" font-size="' + fs + '" font-weight="700">포지션 ' + ev.position + '프렛</text>');
      }
    }

    // 프렛 번호
    for (let k = 0; k < FRETS; k++) {
      const num = start + k;
      const cx = LEFT + (k + 0.5) * fretW;
      const mark = [3, 5, 7, 9, 12, 15, 17, 19].indexOf(num) >= 0;
      out.push('<text x="' + cx.toFixed(1) + '" y="' + (TOP - 15) + '" text-anchor="middle" font-size="' +
        (mark ? fs + 1 : fs - 0.5) + '" font-weight="' + (mark ? 700 : 500) + '" fill="' + (mark ? '#c9d3e6' : '#5f6879') + '">' + num + '</text>');
    }

    // 인레이
    for (let k = 0; k < FRETS; k++) {
      const num = start + k;
      const cx = LEFT + (k + 0.5) * fretW;
      const rr = narrow ? 2.4 : 3;
      if (num === 12) {
        out.push('<circle cx="' + cx.toFixed(1) + '" cy="' + (TOP + gap * 2).toFixed(1) + '" r="' + rr + '" fill="#2c3547"/>');
        out.push('<circle cx="' + cx.toFixed(1) + '" cy="' + (TOP + gap * 3).toFixed(1) + '" r="' + rr + '" fill="#2c3547"/>');
      } else if ([3, 5, 7, 9, 15, 17, 19].indexOf(num) >= 0) {
        out.push('<circle cx="' + cx.toFixed(1) + '" cy="' + (TOP + gap * 2.5).toFixed(1) + '" r="' + rr + '" fill="#2c3547"/>');
      }
    }

    // 프렛 선
    for (let k = 0; k <= FRETS; k++) {
      const x = LEFT + k * fretW;
      const isNut = (k === 0 && start === 1);
      out.push('<line x1="' + x.toFixed(1) + '" y1="' + (TOP - 4) + '" x2="' + x.toFixed(1) + '" y2="' + (H - BOT + 4) +
        '" stroke="' + (isNut ? '#dfe6f3' : '#39435a') + '" stroke-width="' + (isNut ? 4.5 : 1.1) + '"/>');
    }

    // 줄
    for (let s = 1; s <= 6; s++) {
      const y = TOP + rowOf(s) * gap;
      const w = 0.9 + (6 - s) * 0.38;
      out.push('<line x1="' + (LEFT - 4) + '" y1="' + y.toFixed(1) + '" x2="' + (W - RIGHT) + '" y2="' + y.toFixed(1) +
        '" stroke="#5a6b85" stroke-width="' + w.toFixed(2) + '"/>');
    }

    // 줄 이름 + 개방현 자리 — 현재 트랙의 튜닝을 그대로 반영(플랫 표기 포함)
    const tinfo = (global.Tunings && track())
      ? global.Tunings.identify(global.Tunings.openFromTrack(track())) : null;
    for (let s = 1; s <= 6; s++) {
      const y = TOP + rowOf(s) * gap;
      let name = '?';
      if (tinfo) name = global.Tunings.labelFor(tinfo, s);
      else {
        const midi = track() && track().tuning ? track().tuning[s] : null;
        name = midi == null ? '?' : NOTE_NAMES[((midi % 12) + 12) % 12];
      }
      out.push('<text x="4" y="' + (y + 3.4).toFixed(1) + '" font-size="' + (narrow ? 8.5 : 10.5) +
        '" font-weight="700" fill="#6b7690">' + s + '·' + name + '</text>');
    }

    function xOf(note) {
      return note.fret === 0 ? LEFT - (narrow ? 20 : 26) : LEFT + (note.fret - start + 0.5) * fretW;
    }
    function yOf(note) { return TOP + rowOf(note.string) * gap; }

    // 지금 짚는 음 : 불투명 배지
    function badge(note) {
      const y = yOf(note);
      const x = xOf(note);
      const label = note.finger ? String(note.finger) : (note.fret === 0 ? '0' : '·');
      const c = colorOf(note.finger);
      out.push('<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + rBadge + '" fill="' + c + '" filter="url(#glow)" opacity="0.97"/>');
      out.push('<text x="' + x.toFixed(1) + '" y="' + (y + rBadge * 0.36).toFixed(1) + '" text-anchor="middle" font-size="' +
        (rBadge * 0.95).toFixed(1) + '" font-weight="800" fill="#0b0e14">' + label + '</text>');
    }

    // 유지하는 손가락 : 코드 폼 색을 띤 반투명 손가락 실루엣(손끝 마디 + 아래에서 들어오는 몸통)
    // 몸통을 모두 먼저 깔고 손끝 마디를 그 위에 올려 손가락끼리 서로 가리지 않게 한다.
    function ghostGeom(note) {
      const padW = rBadge * 1.8;
      const padH = Math.min(gap * 0.5, rBadge * 1.15);
      const wTop = padW * 0.3;
      const wBot = padW * 0.42;
      return {
        x: xOf(note),
        y: yOf(note),
        padW: padW,
        padH: padH,
        wTop: wTop,
        wBot: wBot,
        neckY: yOf(note) + padH * 0.15,
        botY: yOf(note) + Math.min(gap * 0.92, rBadge * 2.3)
      };
    }
    function ghostBody(note) {
      const g = ghostGeom(note);
      const c = colorOf(note.finger);
      const faint = !!note.faint;
      const d = 'M' + (g.x - g.wTop).toFixed(1) + ' ' + g.neckY.toFixed(1) +
        ' L' + (g.x + g.wTop).toFixed(1) + ' ' + g.neckY.toFixed(1) +
        ' L' + (g.x + g.wBot).toFixed(1) + ' ' + g.botY.toFixed(1) +
        ' L' + (g.x - g.wBot).toFixed(1) + ' ' + g.botY.toFixed(1) + ' Z';
      out.push('<path d="' + d + '" fill="' + c + '" fill-opacity="' + (faint ? 0.04 : 0.1) + '" stroke="' + c +
        '" stroke-opacity="' + (faint ? 0.16 : 0.3) + '" stroke-width="1" stroke-linejoin="round"/>');
      // 손가락 마디 주름
      const ky = (g.neckY + g.botY) / 2;
      out.push('<path d="M' + (g.x - g.wTop * 0.9).toFixed(1) + ' ' + ky.toFixed(1) +
        ' Q' + g.x.toFixed(1) + ' ' + (ky + 2.2).toFixed(1) + ' ' + (g.x + g.wTop * 0.9).toFixed(1) + ' ' + ky.toFixed(1) +
        '" fill="none" stroke="' + c + '" stroke-opacity="' + (faint ? 0.18 : 0.34) + '" stroke-width="0.9"/>');
    }
    function ghostTip(note) {
      const g = ghostGeom(note);
      const c = colorOf(note.finger);
      const faint = !!note.faint;
      // 손끝 마디 — 프렛 바로 뒤를 누르는 자리
      out.push('<ellipse cx="' + g.x.toFixed(1) + '" cy="' + g.y.toFixed(1) + '" rx="' + (g.padW / 2).toFixed(1) +
        '" ry="' + (g.padH / 2).toFixed(1) + '" fill="' + c + '" fill-opacity="' + (faint ? 0.12 : 0.3) +
        '" stroke="' + c + '" stroke-opacity="' + (faint ? 0.24 : 0.6) + '" stroke-width="1.1"/>');
      if (note.finger) {
        out.push('<text x="' + g.x.toFixed(1) + '" y="' + (g.y + fs * 0.35).toFixed(1) + '" text-anchor="middle" font-size="' +
          (faint ? fs - 1 : fs) + '" font-weight="800" fill="' + c + '" fill-opacity="' + (faint ? 0.45 : 0.95) + '">' +
          note.finger + '</text>');
      }
    }

    // 바레 : 1번 손가락이 여러 줄을 세로로 이어 누르는 흐릿한 막대
    const allNotes = [];
    ghosts.forEach(function (g) { allNotes.push({ string: g.string, fret: g.fret, finger: g.finger, ghost: true }); });
    fingers.forEach(function (f) { allNotes.push({ string: f.string, fret: f.fret, finger: f.finger, ghost: false }); });
    const barres = barreGroups(allNotes);
    const inBarre = {};
    barres.forEach(function (b) {
      b.strings.forEach(function (s) { inBarre[s + ':' + b.fret] = true; });
    });

    // 흐릿한 손가락을 먼저 깔고, 그 위에 바레 막대, 맨 위에 지금 짚는 음 배지
    const shownGhosts = ghosts.filter(function (g) { return !(g.fret > 0 && inBarre[g.string + ':' + g.fret]); });
    shownGhosts.forEach(ghostBody);
    shownGhosts.forEach(ghostTip);

    barres.forEach(function (b) {
      const c = colorOf(b.finger);
      const cx = LEFT + (b.fret - start + 0.5) * fretW;
      const yA = TOP + rowOf(b.from) * gap;
      const yB = TOP + rowOf(b.to) * gap;
      const yT = Math.min(yA, yB) - rBadge * 0.85;
      const yBot = Math.max(yA, yB) + rBadge * 0.85;
      const w = rBadge * 1.8;
      const held = fingers.some(function (f) { return f.fret === b.fret && f.finger === b.finger; });
      out.push('<rect x="' + (cx - w / 2).toFixed(1) + '" y="' + yT.toFixed(1) + '" width="' + w.toFixed(1) +
        '" height="' + (yBot - yT).toFixed(1) + '" rx="' + (w / 2).toFixed(1) + '" fill="' + c +
        '" fill-opacity="' + (held ? '0.2' : '0.13') + '" stroke="' + c + '" stroke-opacity="' + (held ? '0.6' : '0.42') +
        '" stroke-width="1.3"' + (held ? '' : ' stroke-dasharray="5 4"') + '/>');
      out.push('<text x="' + cx.toFixed(1) + '" y="' + ((yT + yBot) / 2 + fs * 0.35).toFixed(1) +
        '" text-anchor="middle" font-size="' + fs + '" font-weight="800" fill="' + c + '" fill-opacity="0.9">' + b.finger + '</text>');
    });

    fingers.forEach(badge);

    if (!ev) {
      out.push('<text x="' + (W / 2) + '" y="' + (H / 2) + '" text-anchor="middle" font-size="12" fill="#4d5668">이 부분에는 연주할 음이 없습니다</text>');
    } else if (fingers.length && !ghosts.length && fingers.every(function (f) { return f.fret === 0; })) {
      out.push('<text x="' + (LEFT + 70) + '" y="' + (H - 3) + '" font-size="9.5" fill="#6b7690">모두 개방현</text>');
    }

    svg.innerHTML = out.join('');
  }

  // ---------------------------------------------------------------- 현재 정보
  function fingerPhrase(f) {
    if (f.fret === 0) return '개방현 ' + f.string + '번줄';
    const fl = f.finger ? '<span class="f' + f.finger + '">' + f.finger + '번 ' + FINGER_NAME[f.finger] + '</span>' : '';
    const tag = f.kind === 'barre' ? ' <span class="barre-tag">바레</span>' : '';
    return (fl ? fl + tag : '') + (fl ? ' · ' : '') + f.string + '번줄 ' + f.fret + '프렛';
  }

  function movesOf(ev, prev) {
    if (!prev || !prev.fingers) return [];
    const a = {}, b = {};
    prev.fingers.forEach(function (f) { if (f.finger) a[f.finger] = f.string + ':' + f.fret; });
    ev.fingers.forEach(function (f) { if (f.finger) b[f.finger] = f.string + ':' + f.fret; });
    const out = [];
    Object.keys(b).forEach(function (k) { if (a[k] !== b[k]) out.push(Number(k)); });
    return out;
  }

  function renderNow() {
    const ev = S.flat[S.cur];
    const prev = S.flat[S.cur - 1];
    const chordNameEl = $('chordName');
    const chordShapeEl = $('chordShape');
    const chordDiagEl = $('chordDiagram');
    const main = $('hintMain');
    const sub = $('hintSub');
    const next = $('hintNext');

    if (!ev) {
      chordNameEl.textContent = '—';
      chordShapeEl.textContent = '';
      chordDiagEl.innerHTML = '';
      main.textContent = '음이 없습니다';
      sub.textContent = '';
      next.textContent = '';
      return;
    }

    if (ev.shape) {
      chordNameEl.textContent = ev.shape.name;
      chordNameEl.style.color = '#fff';
      chordShapeEl.textContent = ev.shapeLabel + ' · ' + ev.shape.form;
      chordDiagEl.innerHTML = chordDiagramSVG(ev.shape);
    } else {
      chordNameEl.textContent = ev.engine === 'position' ? '포지션' : '—';
      chordNameEl.style.color = '#c9d3e6';
      chordShapeEl.textContent = '1번 손가락 ' + ev.position + '프렛';
      chordDiagEl.innerHTML = '';
    }

    const parts = ev.fingers.slice()
      .sort(function (a, b) { return b.string - a.string; })
      .map(fingerPhrase);
    main.innerHTML = parts.length ? parts.join(' <span style="color:#5f6879">+</span> ') : '—';

    const bits = [];
    if (ev.shape) {
      bits.push('기준 폼 ' + ev.shape.name + ' 유지');
      const brs = barreGroups(ev.fingers.concat(ev.ghosts));
      const b1 = brs.filter(function (b) { return b.finger === 1; })[0];
      if (b1) bits.push('1번 검지 ' + b1.fret + '프렛 바레');
      const barreNotes = ev.fingers.filter(function (f) { return f.kind === 'barre'; });
      if (barreNotes.length) {
        bits.push(barreNotes.map(function (f) { return f.string + '번줄'; }).join('·') + '은 1번 검지 바레로 소리');
      }
      const extras = ev.fingers.filter(function (f) { return f.kind === 'extra'; });
      if (extras.length) {
        bits.push('폼 밖 음은 ' + extras.map(function (f) { return f.finger ? f.finger + '번 손가락' : '손을 옮겨 짚기'; }).join('·'));
      }
      if (ev.ghosts.length) bits.push('나머지 ' + ev.ghosts.length + '개 손가락은 그대로');
    } else {
      bits.push('포지션 ' + ev.position + '프렛 (1번 손가락 기준)');
    }
    const mv = movesOf(ev, prev);
    if (mv.length && prev && prev.engine === ev.engine) {
      bits.push('움직임 ' + mv.map(function (f) { return f + '번'; }).join('·'));
    }
    sub.textContent = bits.join(' · ');

    const nx = S.flat[S.cur + 1];
    if (nx && nx.fingers.length) {
      const f0 = nx.fingers[0];
      next.textContent = '다음 · ' + (f0.finger ? f0.finger + '번 ' + FINGER_NAME[f0.finger] + ' ' : '') +
        (f0.fret === 0 ? f0.string + '번줄 개방' : f0.string + '번줄 ' + f0.fret + '프렛');
    } else {
      next.textContent = '';
    }

    // 탭 위치 표기
    const b = S.bars[ev.barIndex];
    if (b) {
      $('tabPos').textContent = (ev.barIndex + 1) + '마디 · ' + (ev.barEventIndex + 1) + '/' + b.events.length;
    }
  }

  // ---------------------------------------------------------------- 타브 스트립
  function renderStrip() {
    const strip = $('strip');
    let html = '';
    for (let bi = 0; bi < S.bars.length; bi++) {
      const b = S.bars[bi];
      const bar = b.bar;
      const evs = b.events;
      const slots = Math.max(4, Math.min(16, evs.length || bar.tsNum * 2));
      const width = Math.max(68, 26 + slots * 15);
      const names = (b.shapes || []).filter(Boolean).map(function (s) { return s.name; });
      html += '<div class="bar" data-bar="' + bi + '" style="width:' + width + 'px">';
      html += '<div class="bar-chord">' + esc(names.join(' / ')) + '</div>';
      html += '<div class="bar-num">' + (bi + 1) + '</div>';
      html += '<div class="bar-body"><div class="lines"></div>';
      for (let ei = 0; ei < evs.length; ei++) {
        const ev = evs[ei];
        const left = ((ev.tick - bar.startTick) / Math.max(1, bar.lenTicks)) * 100;
        for (let k = 0; k < ev.notes.length; k++) {
          const n = ev.notes[k];
          let finger = 0;
          for (let fi = 0; fi < ev.fingers.length; fi++) {
            if (ev.fingers[fi].string === n.string) { finger = ev.fingers[fi].finger; break; }
          }
          const top = 6 + rowOf(n.string) * 12.4;
          const lp = 4 + (left / 100) * 92;
          html += '<span class="n' + (n.fret === 0 ? ' open' : '') + '" data-i="' + ev.gi + '" style="left:' +
            lp.toFixed(2) + '%;top:' + top.toFixed(1) + 'px;color:' + colorOf(finger) + '">' +
            (n.fret === 0 ? '0' : n.fret) + '</span>';
        }
      }
      html += '<div class="playhead" data-ph="' + bi + '" style="display:none"></div>';
      html += '</div></div>';
    }
    strip.innerHTML = html;
    markLoop();
  }

  function markLoop() {
    const r = loopRange();
    document.querySelectorAll('.bar').forEach(function (el) {
      const bi = Number(el.getAttribute('data-bar'));
      const on = r && bi >= r.a && bi <= r.b;
      el.classList.toggle('inloop', !!on);
    });
  }

  function updateStripCurrent() {
    const ev = S.flat[S.cur];
    if (!ev) return;
    const body = document.querySelector('.bar[data-bar="' + ev.barIndex + '"] .bar-body');
    if (!body) return;
    document.querySelectorAll('.bar .playhead').forEach(function (el) { el.style.display = 'none'; });
    const ph = body.querySelector('.playhead');
    if (ph) {
      ph.style.display = 'block';
      const pct = ((ev.tick - S.bars[ev.barIndex].bar.startTick) / Math.max(1, S.bars[ev.barIndex].bar.lenTicks)) * 100;
      ph.style.left = pct.toFixed(2) + '%';
    }
    document.querySelectorAll('.n.cur').forEach(function (el) { el.classList.remove('cur'); });
    document.querySelectorAll('.n[data-i="' + S.cur + '"]').forEach(function (el) { el.classList.add('cur'); });
    document.querySelectorAll('.bar.cur').forEach(function (el) { el.classList.remove('cur'); });
    const barEl = document.querySelector('.bar[data-bar="' + ev.barIndex + '"]');
    if (barEl) {
      barEl.classList.add('cur');
      const wrap = $('stripWrap');
      const left = barEl.offsetLeft;
      const right = left + barEl.offsetWidth;
      if (left < wrap.scrollLeft + 8 || right > wrap.scrollLeft + wrap.clientWidth - 8) {
        wrap.scrollTo({ left: Math.max(0, left - 24), behavior: 'smooth' });
      }
    }
  }

  // 현재 트랙 튜닝 배지 — 곡 정보 바로 아래, 폰 한 화면에서 바로 보이는 자리
  function renderTuning() {
    const row = $('tuningRow');
    if (!row) return;
    const tr = track();
    if (!tr || !global.Tunings) { row.hidden = true; return; }
    const info = global.Tunings.identify(global.Tunings.openFromTrack(tr));
    const capo = tr.capo || 0;
    const badge = $('tuningBadge');
    $('tuningName').textContent = info.name;
    $('tuningNotes').textContent = info.notes.join(' ');
    const capoEl = $('tuningCapo');
    capoEl.hidden = !capo;
    capoEl.textContent = capo ? '카포 ' + capo : '';
    const warn = $('tuningWarn');
    warn.hidden = !info.alt;
    warn.textContent = info.alt ? (info.custom ? '목록에 없는 튜닝' : '줄 다시 맞추기') : '';
    badge.classList.toggle('alt', !!info.alt);
    badge.classList.toggle('custom', !!info.custom);
    badge.setAttribute('title', info.name + ' · ' + info.ko + ' · ' + info.notes.join(' ') +
      (capo ? ' · 카포 ' + capo + '프렛' : '') +
      (info.alt ? '\n이 곡은 기본 튜닝이 아닙니다. 기타 줄을 이 튜닝으로 맞춘 뒤 연습하세요.' : ''));
    row.hidden = false;
  }

  function renderAll() {
    drawFretboard();
    renderTuning();
    renderNow();
    updateStripCurrent();
    updateTransport();
  }

  function updateTransport() {
    const ev = S.flat[S.cur];
    const b = ev ? barOf(ev.barIndex) : null;
    const tempo = b ? b.tempo : (S.score ? S.score.tempo : 120);
    $('bpmVal').textContent = Math.round(tempo * S.speed) + ' BPM';
    $('speedVal').textContent = S.speed.toFixed(2).replace(/0$/, '') + 'x';
    const r = loopRange();
    $('loopVal').textContent = S.loopA == null ? '없음' :
      (r.a + 1) + '–' + (r.b + 1) + '마디';
    $('loopA').classList.toggle('on', S.loopA != null);
    $('loopB').classList.toggle('on', S.loopB != null);
    $('metBtn').classList.toggle('on', S.metronome);
  }

  // ---------------------------------------------------------------- 재생
  function setCurrent(i, opts) {
    if (!S.flat.length) { S.cur = 0; return; }
    i = Math.max(0, Math.min(S.flat.length - 1, i));
    if (i === S.cur && !(opts && opts.force)) { renderAll(); return; }
    S.cur = i;
    renderAll();
    if (opts && opts.silent) return;
  }

  function seekTo(i) {
    const wasPlaying = S.playing;
    stopPlayback();
    setCurrent(i, { force: true });
    if (wasPlaying) startPlayback();
  }

  function scheduleClicks(ev, when, durSec) {
    const bar = barOf(ev.barIndex);
    if (!bar) return;
    const beat = 960;
    let next = Math.ceil(ev.tick / beat) * beat;
    let guard = 0;
    while (next < ev.tick + ev.dur && guard++ < 64) {
      const frac = ev.dur ? (next - ev.tick) / ev.dur : 0;
      const accent = (next === bar.startTick);
      global.Guitar.click(when + frac * durSec, accent);
      next += beat;
    }
  }

  function scheduler() {
    if (!S.playing) return;
    const now = global.Guitar.ctx.currentTime;
    let guard = 0;
    while (P.cursor < S.flat.length && P.nextTime < now + 0.22 && guard++ < 300) {
      const ev = S.flat[P.cursor];
      const dur = evSeconds(ev);
      if (P.nextTime > now - 0.05) {
        global.Guitar.chord(ev.notes, P.nextTime, dur);
        if (S.metronome) scheduleClicks(ev, P.nextTime, dur);
      }
      P.log.push({ i: P.cursor, t: P.nextTime });
      P.nextTime += dur;
      P.cursor++;
      const r = loopRange();
      if (r && ev.barIndex === r.b && isLastEventOfBar(ev)) {
        const jump = firstIndexInBar(r.a);
        P.cursor = jump;
      }
    }
  }

  function startPlayback() {
    if (!S.flat.length) return;
    global.Guitar.resume();
    const ctx = global.Guitar.ctx;
    S.playing = true;
    P.cursor = S.cur;
    P.nextTime = ctx.currentTime + 0.09;
    P.log = [];
    P.logPos = 0;
    $('playBtn').textContent = '❚❚';
    clearInterval(P.timer);
    P.timer = setInterval(scheduler, 35);
    scheduler();
    if (!P.raf) P.raf = requestAnimationFrame(rafLoop);
  }

  function stopPlayback(keep) {
    S.playing = false;
    clearInterval(P.timer);
    P.timer = null;
    if (global.Guitar.ctx) global.Guitar.stopAll();
    $('playBtn').textContent = '▶';
    if (!keep) { /* 위치 유지 */ }
  }

  let lastFrameTime = 0;
  function rafLoop(t) {
    P.raf = 0;
    if (!S.playing) { updateTransport(); return; }
    const now = global.Guitar.ctx.currentTime;
    let changed = false;
    while (P.logPos < P.log.length && P.log[P.logPos].t <= now) {
      const idx = P.log[P.logPos].i;
      if (idx !== S.cur) { S.cur = idx; changed = true; }
      P.logPos++;
    }
    if (P.logPos > 240) { P.log = P.log.slice(P.logPos); P.logPos = 0; }
    if (changed) { renderAll(); }
    if (P.cursor >= S.flat.length && P.logPos >= P.log.length && now > P.nextTime) {
      // 곡 끝
      const r = loopRange();
      if (r) {
        P.cursor = firstIndexInBar(r.a);
      } else {
        stopPlayback();
        updateTransport();
        return;
      }
    }
    P.raf = requestAnimationFrame(rafLoop);
  }

  // ---------------------------------------------------------------- 모드/트랙
  function setMode(mode) {
    if (S.mode === mode) return;
    S.mode = mode;
    document.querySelectorAll('#modeSel button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-mode') === mode);
    });
    const ev = S.flat[S.cur];
    const tick = ev ? ev.tick : 0;
    const wasPlaying = S.playing;
    stopPlayback();
    rebuild(tick);
    if (wasPlaying) startPlayback();
  }

  function setTrack(index) {
    if (index === S.trackIndex) return;
    const ev = S.flat[S.cur];
    const tick = ev ? ev.tick : 0;
    const wasPlaying = S.playing;
    stopPlayback();
    S.trackIndex = index;
    S.loopA = null; S.loopB = null;
    rebuild(tick);
    if (wasPlaying) startPlayback();
  }

  function updateTrackOptions() {
    const sel = $('trackSel');
    const tr = S.score ? S.score.tracks : [];
    sel.innerHTML = tr.map(function (t, i) {
      return '<option value="' + i + '">' + esc(t.name) + '</option>';
    }).join('');
    sel.value = String(S.trackIndex);
  }

  // ---------------------------------------------------------------- 파일/저장
  function loadModel(m, opts) {
    stopPlayback();
    S.score = m;
    S.trackIndex = 0;
    S.loopA = null; S.loopB = null;
    if (!m.tracks.length) {
      toast('연주할 트랙이 없습니다');
      return;
    }
    // 음이 있는 첫 트랙
    let idx = 0;
    for (let i = 0; i < m.tracks.length; i++) {
      if (m.tracks[i].noteCount > 0) { idx = i; break; }
    }
    S.trackIndex = idx;
    $('songTitle').textContent = m.title || '제목 없음';
    $('songMeta').textContent = m.meta || '';
    updateTrackOptions();
    rebuild(0);
    renderDiag();
    if (!S.flat.length) toast('이 트랙에서 음을 찾지 못했습니다');
    if (opts && opts.id) {
      S.lastId = opts.id;
      localStorage.setItem('fc_last', opts.id);
    }
    renderSaved();
    document.dispatchEvent(new CustomEvent('fc:loaded'));
  }

  function renderDiag() {
    if (!S.score) return;
    const tr = track();
    const lines = [];
    lines.push('제목 : ' + (S.score.title || ''));
    lines.push('출처 : ' + (S.score.fileName || '') + (S.score.source === 'demo' ? ' (내장 데모)' : ''));
    lines.push('트랙 : ' + S.score.tracks.length + '개 / 마디 : ' + (tr ? tr.bars.length : 0) + ' / 음 : ' + (tr ? tr.noteCount : 0));
    lines.push('튜닝 : ' + (tr ? tr.tuningText : '') + (tr && tr.capo ? ' (카포 ' + tr.capo + ')' : ''));
    lines.push('기본 템포 : ' + Math.round(S.score.tempo) + ' BPM');
    if (tr) {
      const withNotes = tr.bars.filter(function (b) { return b.events.length; }).length;
      lines.push('음이 있는 마디 : ' + withNotes + ' / ' + tr.bars.length);
      lines.push('운지 계산 : 코드폼 ' + S.flat.filter(function (e) { return e.engine === 'chord'; }).length +
        '음 / 포지션 ' + S.flat.filter(function (e) { return e.engine === 'position'; }).length + '음');
    }
    if (S.score.stats && S.score.stats.demo) lines.push('데모 데이터 (직접 만든 진행이라 저작권 이슈 없음)');
    $('diagBody').textContent = lines.join('\n');
  }

  const Store = {
    db: null,
    open: function () {
      const self = this;
      if (this.db) return Promise.resolve(this.db);
      return new Promise(function (resolve) {
        let req;
        try { req = indexedDB.open('fretcoach', 1); } catch (e) { resolve(null); return; }
        req.onupgradeneeded = function (e) {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('songs')) db.createObjectStore('songs', { keyPath: 'id' });
        };
        req.onsuccess = function (e) { self.db = e.target.result; resolve(self.db); };
        req.onerror = function () { resolve(null); };
      });
    },
    list: async function () {
      const db = await this.open();
      if (!db) return [];
      return new Promise(function (resolve) {
        const tx = db.transaction('songs', 'readonly');
        const req = tx.objectStore('songs').getAll();
        req.onsuccess = function () { resolve((req.result || []).sort(function (a, b) { return b.at - a.at; })); };
        req.onerror = function () { resolve([]); };
      });
    },
    put: async function (rec) {
      const db = await this.open();
      if (!db) return;
      return new Promise(function (resolve) {
        const tx = db.transaction('songs', 'readwrite');
        tx.objectStore('songs').put(rec);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { resolve(); };
      });
    },
    del: async function (id) {
      const db = await this.open();
      if (!db) return;
      return new Promise(function (resolve) {
        const tx = db.transaction('songs', 'readwrite');
        tx.objectStore('songs').delete(id);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { resolve(); };
      });
    }
  };

  function renderSaved() {
    const row = $('savedRow');
    if (!S.saved.length) { row.hidden = true; return; }
    row.hidden = false;
    row.innerHTML = S.saved.map(function (s) {
      return '<span class="chip' + (S.lastId === s.id ? ' on' : '') + '" data-id="' + esc(s.id) + '">' +
        esc(s.name) + '<button class="x" data-del="' + esc(s.id) + '" aria-label="삭제">×</button></span>';
    }).join('');
  }

  async function refreshSaved() {
    S.saved = await Store.list();
    renderSaved();
  }

  async function loadFile(file) {
    try {
      toast('읽는 중…', 4000);
      const buf = await file.arrayBuffer();
      const m = global.ScoreTools.loadFromBytes(buf, file.name);
      const id = file.name + ':' + buf.byteLength;
      loadModel(m, { id: id });
      await Store.put({ id: id, name: file.name, data: buf, at: Date.now() });
      await refreshSaved();
      toast('불러왔습니다 · 마디 ' + (track() ? track().bars.length : 0) + '개');
      // 보관함: 연 곡을 구글 드라이브에도 조용히 올려 다른 기기에서 바로 꺼낼 수 있게 한다
      if (global.Drive && global.Drive.onLocalFile) global.Drive.onLocalFile(file.name, buf);
    } catch (e) {
      console.error(e);
      toast('이 파일은 읽지 못했습니다 · gp3/gp4/gp5 형식인지 확인해 주세요', 4200);
    }
  }

  // 드라이브 보관함에서 받은 bytes를 바로 연다 (Base64 해제는 drive.js가 한다)
  function loadBytes(buf, name, opts) {
    const m = global.ScoreTools.loadFromBytes(buf, name);
    const id = (opts && opts.id) || (name + ':' + buf.byteLength);
    loadModel(m, { id: id });
    try {
      Store.put({ id: id, name: name, data: buf, at: Date.now() }).then(refreshSaved);
    } catch (e) { /* 로컬 저장 실패는 무시 — 화면에는 이미 열렸다 */ }
    if (global.Drive && global.Drive.S) global.Drive.S.openId = (opts && opts.id && String(opts.id).indexOf('drive:') === 0)
      ? String(opts.id).slice(6) : null;
    return m;
  }

  // ---------------------------------------------------------------- 초기화
  function bind() {
    $('loadBtn').addEventListener('click', function () { $('fileInput').click(); });
    $('fileInput').addEventListener('change', function (e) {
      const f = e.target.files && e.target.files[0];
      if (f) loadFile(f);
      e.target.value = '';
    });

    document.querySelectorAll('#modeSel button').forEach(function (b) {
      b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); });
    });

    $('trackSel').addEventListener('change', function (e) { setTrack(Number(e.target.value)); });

    $('orderBtn').addEventListener('click', function () {
      S.order = S.order === 'low' ? 'high' : 'low';
      toast(S.order === 'low' ? '6번줄을 아래로' : '1번줄을 아래로', 1400);
      renderStrip();
      drawFretboard();
      renderNow();
      updateStripCurrent();
    });

    $('playBtn').addEventListener('click', function () {
      if (S.playing) { stopPlayback(); updateTransport(); }
      else startPlayback();
    });

    $('notePrev').addEventListener('click', function () { seekTo(S.cur - 1); });
    $('noteNext').addEventListener('click', function () { seekTo(S.cur + 1); });
    $('barPrev').addEventListener('click', function () {
      const ev = S.flat[S.cur];
      const bi = ev ? ev.barIndex : 0;
      seekTo(firstIndexInBar(Math.max(0, bi - 1)));
    });
    $('barNext').addEventListener('click', function () {
      const ev = S.flat[S.cur];
      const bi = ev ? ev.barIndex : 0;
      seekTo(firstIndexInBar(Math.min(S.bars.length - 1, bi + 1)));
    });

    $('speed').addEventListener('input', function (e) {
      S.speed = Number(e.target.value);
      updateTransport();
    });
    $('speed').addEventListener('change', function () {
      if (S.playing) { stopPlayback(); startPlayback(); }
    });

    $('loopA').addEventListener('click', function () {
      const ev = S.flat[S.cur];
      S.loopA = ev ? ev.barIndex : 0;
      if (S.loopB != null && S.loopB < S.loopA) S.loopB = null;
      markLoop(); updateTransport();
      toast('시작 = ' + (S.loopA + 1) + '마디', 1400);
    });
    $('loopB').addEventListener('click', function () {
      const ev = S.flat[S.cur];
      S.loopB = ev ? ev.barIndex : 0;
      if (S.loopA == null) S.loopA = S.loopB;
      markLoop(); updateTransport();
      const r = loopRange();
      toast('끝 = ' + (r.b + 1) + '마디 · 반복 ' + (r.a + 1) + '–' + (r.b + 1) + '마디', 1600);
    });
    $('loopClear').addEventListener('click', function () {
      S.loopA = null; S.loopB = null;
      markLoop(); updateTransport();
    });
    $('metBtn').addEventListener('click', function () {
      S.metronome = !S.metronome;
      global.Guitar.resume();
      updateTransport();
    });

    $('strip').addEventListener('click', function (e) {
      const n = e.target.closest('.n');
      if (n) { seekTo(Number(n.getAttribute('data-i'))); return; }
      const bar = e.target.closest('.bar');
      if (bar) {
        const bi = Number(bar.getAttribute('data-bar'));
        const idx = firstIndexInBar(bi);
        if (idx < S.flat.length) seekTo(idx);
      }
    });

    $('savedRow').addEventListener('click', async function (e) {
      const del = e.target.closest('[data-del]');
      if (del) {
        const id = del.getAttribute('data-del');
        await Store.del(id);
        await refreshSaved();
        if (S.lastId === id) localStorage.removeItem('fc_last');
        return;
      }
      const chip = e.target.closest('.chip');
      if (chip) {
        const id = chip.getAttribute('data-id');
        const rec = S.saved.find(function (s) { return s.id === id; });
        if (!rec || !rec.data) return;
        try {
          const m = global.ScoreTools.loadFromBytes(rec.data, rec.name);
          loadModel(m, { id: rec.id });
          toast('불러왔습니다');
        } catch (err) {
          toast('저장된 파일을 읽지 못했습니다');
        }
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.code === 'Space') { e.preventDefault(); $('playBtn').click(); }
      else if (e.code === 'ArrowRight') seekTo(S.cur + 1);
      else if (e.code === 'ArrowLeft') seekTo(S.cur - 1);
      else if (e.code === 'ArrowDown') { e.preventDefault(); seekTo(firstIndexInBar((S.flat[S.cur] ? S.flat[S.cur].barIndex : 0) + 1)); }
      else if (e.code === 'ArrowUp') { e.preventDefault(); seekTo(firstIndexInBar(Math.max(0, (S.flat[S.cur] ? S.flat[S.cur].barIndex : 0) - 1))); }
    });

    let rzTimer = 0;
    window.addEventListener('resize', function () {
      clearTimeout(rzTimer);
      rzTimer = setTimeout(function () { drawFretboard(); }, 150);
    });

    // 드래그 & 드롭
    let dragDepth = 0;
    window.addEventListener('dragenter', function (e) {
      e.preventDefault(); dragDepth++; $('dropHint').hidden = false;
    });
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    window.addEventListener('dragleave', function (e) {
      dragDepth--; if (dragDepth <= 0) { dragDepth = 0; $('dropHint').hidden = true; }
    });
    window.addEventListener('drop', function (e) {
      e.preventDefault(); dragDepth = 0; $('dropHint').hidden = true;
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadFile(f);
    });
  }

  async function boot() {
    bind();
    $('speed').value = String(S.speed);
    updateTransport();
    await refreshSaved();
    const lastId = localStorage.getItem('fc_last');
    const rec = S.saved.find(function (s) { return s.id === lastId; });
    if (rec && rec.data) {
      try {
        const m = global.ScoreTools.loadFromBytes(rec.data, rec.name);
        loadModel(m, { id: rec.id });
        return;
      } catch (e) { /* 데모로 */ }
    }
    loadModel(global.DemoSong.build());
  }

  // 홈 화면 설치용 서비스 워커 (오프라인에서도 열림)
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* 무시 */ });
    });
  }

  global.FretCoach = {
    S: S,
    loadFile: loadFile,
    loadBytes: loadBytes,
    setMode: setMode,
    toast: toast,
    debug: function () {
      const tr = track();
      const ev = S.flat[S.cur];
      return {
        title: S.score ? S.score.title : null,
        tracks: S.score ? S.score.tracks.map(function (t) {
          return { name: t.name, bars: t.bars.length, notes: t.noteCount, tuning: t.tuningText };
        }) : [],
        trackIndex: S.trackIndex,
        bars: S.bars.length,
        events: S.flat.length,
        cur: S.cur,
        curBar: ev ? ev.barIndex : null,
        curEvent: ev ? {
          tick: ev.tick,
          engine: ev.engine,
          shape: ev.shape ? ev.shape.name : null,
          shapeLabel: ev.shapeLabel,
          position: ev.position,
          fingers: ev.fingers.map(function (f) { return f.string + '/' + f.fret + '/f' + f.finger; }),
          ghosts: ev.ghosts.map(function (f) { return f.string + '/' + f.fret + '/f' + f.finger; })
        } : null,
        barChords: S.bars.map(function (b) { return (b.shapes || []).filter(Boolean).map(function (s) { return s.name; }).join('/') || null; }),
        errors: global.__errors || []
      };
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
