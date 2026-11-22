/* 프렛 코치 — 코드 폼 라이브러리
 * frets / fingers 배열은 [6번줄, 5번줄, 4번줄, 3번줄, 2번줄, 1번줄] 순서.
 * -1 = 뮤트(x), 0 = 개방현.
 *
 * 튜닝 연동:
 * - 아래 오픈/바레 폼은 표준 튜닝(STD_OPEN) 기준으로 적혀 있다.
 * - 각 폼은 "근음 대비 각 줄의 실제 음정(반음)" 템플릿으로 바꿔 두고,
 *   현재 트랙의 개방현 음정(open)에 맞춰 프렛을 다시 계산한다.
 *   그래서 Drop D / Drop C / Open G / DADGAD … 에서도 각 줄의 실제 음정에 맞는
 *   코드명과 기준 폼이 나온다. (예: Drop D 개방 6·5·4번줄 = D5)
 * - 표준 튜닝에서는 손으로 적은 원본 폼을 그대로 쓴다(기존 동작 보존).
 */
(function (global) {
  'use strict';

  const PC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  // 개방현 MIDI (표준 튜닝) — 6번줄부터
  const STD_OPEN = [40, 45, 50, 55, 59, 64];

  const QUALITIES = {
    '':   { label: '',      intervals: [0, 4, 7] },
    'm':  { label: 'm',     intervals: [0, 3, 7] },
    '7':  { label: '7',     intervals: [0, 4, 7, 10] },
    'm7': { label: 'm7',    intervals: [0, 3, 7, 10] },
    'maj7': { label: 'maj7', intervals: [0, 4, 7, 11] },
    'sus2': { label: 'sus2', intervals: [0, 2, 7] },
    'sus4': { label: 'sus4', intervals: [0, 5, 7] },
    'add9': { label: 'add9', intervals: [0, 2, 4, 7] },
    '6':  { label: '6',     intervals: [0, 4, 7, 9] },
    'm6': { label: 'm6',    intervals: [0, 3, 7, 9] },
    'dim': { label: 'dim',  intervals: [0, 3, 6] },
    '5':  { label: '5',     intervals: [0, 7] }
  };

  const baseShapes = [];      // 표준 튜닝 기준 손으로 적은 폼
  const shapes = [];          // 현재 튜닝에 맞춰 계산된 폼 (finger.js 가 이 배열을 본다)
  const seen = new Set();
  const seenTpl = new Set();
  const templates = [];       // 근음 대비 음정 템플릿

  function add(name, frets, fingers, opt) {
    const key = frets.join(',');
    if (seen.has(key)) return;
    seen.add(key);
    const o = opt || {};
    baseShapes.push({
      name: name,
      frets: frets,
      fingers: fingers,
      root: o.root == null ? -1 : o.root,
      quality: o.quality == null ? '' : o.quality,
      form: o.form || '오픈',
      barre: o.barre || null
    });
  }

  // ---------------------------------------------------------------- 오픈 코드
  add('C',     [-1, 3, 2, 0, 1, 0], [-1, 3, 2, 0, 1, 0], { root: 0, quality: '' });
  add('Cadd9', [-1, 3, 2, 0, 3, 0], [-1, 3, 2, 0, 4, 0], { root: 0, quality: 'add9' });
  add('Cmaj7', [-1, 3, 2, 0, 0, 0], [-1, 3, 2, 0, 0, 0], { root: 0, quality: 'maj7' });
  add('C7',    [-1, 3, 2, 3, 1, 0], [-1, 3, 2, 4, 1, 0], { root: 0, quality: '7' });
  add('C6',    [-1, 3, 2, 2, 1, 0], [-1, 4, 2, 3, 1, 0], { root: 0, quality: '6' });

  add('D',     [-1, -1, 0, 2, 3, 2], [-1, -1, 0, 1, 3, 2], { root: 2, quality: '' });
  add('Dsus2', [-1, -1, 0, 2, 3, 0], [-1, -1, 0, 1, 3, 0], { root: 2, quality: 'sus2' });
  add('Dsus4', [-1, -1, 0, 2, 3, 3], [-1, -1, 0, 1, 2, 3], { root: 2, quality: 'sus4' });
  add('D7',    [-1, -1, 0, 2, 1, 2], [-1, -1, 0, 2, 1, 3], { root: 2, quality: '7' });
  add('Dmaj7', [-1, -1, 0, 2, 2, 2], [-1, -1, 0, 1, 2, 3], { root: 2, quality: 'maj7' });
  add('Dm',    [-1, -1, 0, 2, 3, 1], [-1, -1, 0, 2, 3, 1], { root: 2, quality: 'm' });
  add('D6',    [-1, -1, 0, 2, 0, 2], [-1, -1, 0, 1, 0, 2], { root: 2, quality: '6' });

  add('E',     [0, 2, 2, 1, 0, 0], [0, 2, 3, 1, 0, 0], { root: 4, quality: '' });
  add('Em',    [0, 2, 2, 0, 0, 0], [0, 2, 3, 0, 0, 0], { root: 4, quality: 'm' });
  add('Em7',   [0, 2, 0, 0, 0, 0], [0, 2, 0, 0, 0, 0], { root: 4, quality: 'm7' });
  add('Esus4', [0, 2, 2, 2, 0, 0], [0, 1, 2, 3, 0, 0], { root: 4, quality: 'sus4' });
  add('E7',    [0, 2, 0, 1, 0, 0], [0, 3, 0, 1, 0, 0], { root: 4, quality: '7' });
  add('Emaj7', [0, 2, 1, 1, 0, 0], [0, 3, 1, 2, 0, 0], { root: 4, quality: 'maj7' });
  add('Em6',   [0, 2, 2, 0, 2, 0], [0, 2, 3, 0, 4, 0], { root: 4, quality: 'm6' });

  add('F',     [1, 3, 3, 2, 1, 1], [1, 3, 4, 2, 1, 1], { root: 5, quality: '', form: 'E폼', barre: { fret: 1, from: 6, to: 1 } });
  add('Fm',    [1, 3, 3, 1, 1, 1], [1, 3, 4, 1, 1, 1], { root: 5, quality: 'm', form: 'E폼', barre: { fret: 1, from: 6, to: 1 } });
  add('Fmaj7', [-1, -1, 3, 2, 1, 0], [-1, -1, 4, 3, 2, 1], { root: 5, quality: 'maj7' });

  add('G',     [3, 2, 0, 0, 0, 3], [2, 1, 0, 0, 0, 3], { root: 7, quality: '' });
  add('G7',    [3, 2, 0, 0, 0, 1], [3, 2, 0, 0, 0, 1], { root: 7, quality: '7' });
  add('Gsus4', [3, 3, 0, 0, 1, 3], [2, 3, 0, 0, 1, 4], { root: 7, quality: 'sus4' });

  add('Am',    [-1, 0, 2, 2, 1, 0], [-1, 0, 2, 3, 1, 0], { root: 9, quality: 'm' });
  add('Am7',   [-1, 0, 2, 0, 1, 0], [-1, 0, 2, 0, 1, 0], { root: 9, quality: 'm7' });
  add('Amaj7', [-1, 0, 2, 1, 2, 0], [-1, 0, 2, 1, 3, 0], { root: 9, quality: 'maj7' });
  add('Asus2', [-1, 0, 2, 2, 0, 0], [-1, 0, 1, 2, 0, 0], { root: 9, quality: 'sus2' });
  add('Asus4', [-1, 0, 2, 2, 3, 0], [-1, 0, 1, 2, 3, 0], { root: 9, quality: 'sus4' });
  add('A',     [-1, 0, 2, 2, 2, 0], [-1, 0, 1, 2, 3, 0], { root: 9, quality: '' });
  add('A7',    [-1, 0, 2, 0, 2, 0], [-1, 0, 2, 0, 3, 0], { root: 9, quality: '7' });
  add('A6',    [-1, 0, 2, 2, 2, 2], [-1, 0, 1, 2, 3, 4], { root: 9, quality: '6' });

  add('Bm',    [-1, 2, 4, 4, 3, 2], [-1, 1, 3, 4, 2, 1], { root: 11, quality: 'm', form: 'A폼', barre: { fret: 2, from: 5, to: 1 } });
  add('Bm7',   [-1, 2, 0, 2, 0, 2], [-1, 1, 0, 2, 0, 3], { root: 11, quality: 'm7' });
  add('B7',    [-1, 2, 1, 2, 0, 2], [-1, 2, 1, 3, 0, 4], { root: 11, quality: '7' });
  add('B',     [-1, 2, 4, 4, 4, 2], [-1, 1, 2, 3, 4, 1], { root: 11, quality: '', form: 'A폼', barre: { fret: 2, from: 5, to: 1 } });
  add('Bb',    [-1, 1, 3, 3, 3, 1], [-1, 1, 2, 3, 4, 1], { root: 10, quality: '', form: 'A폼', barre: { fret: 1, from: 5, to: 1 } });
  add('Bbm',   [-1, 1, 3, 3, 2, 1], [-1, 1, 3, 4, 2, 1], { root: 10, quality: 'm', form: 'A폼', barre: { fret: 1, from: 5, to: 1 } });
  add('C#m',   [-1, 4, 6, 6, 5, 4], [-1, 1, 3, 4, 2, 1], { root: 1, quality: 'm', form: 'A폼', barre: { fret: 4, from: 5, to: 1 } });
  add('F#m',   [2, 4, 4, 2, 2, 2], [1, 3, 4, 1, 1, 1], { root: 6, quality: 'm', form: 'E폼', barre: { fret: 2, from: 6, to: 1 } });
  add('G#m',   [4, 6, 6, 4, 4, 4], [1, 3, 4, 1, 1, 1], { root: 8, quality: 'm', form: 'E폼', barre: { fret: 4, from: 6, to: 1 } });
  add('Gm',    [3, 5, 5, 3, 3, 3], [1, 3, 4, 1, 1, 1], { root: 7, quality: 'm', form: 'E폼', barre: { fret: 3, from: 6, to: 1 } });
  add('C#',    [-1, 4, 6, 6, 6, 4], [-1, 1, 2, 3, 4, 1], { root: 1, quality: '', form: 'A폼', barre: { fret: 4, from: 5, to: 1 } });
  add('Dm7',   [-1, 5, 7, 5, 6, 5], [-1, 1, 3, 1, 2, 1], { root: 2, quality: 'm7', form: 'A폼', barre: { fret: 5, from: 5, to: 1 } });

  // ------------------------------------------------------- 이동 가능(바레) 폼
  // E폼: 6번줄 근음을 n프렛에
  for (let n = 1; n <= 12; n++) {
    const pc = (4 + n) % 12;
    const N = PC[pc];
    add(N,        [n, n + 2, n + 2, n + 1, n, n],       [1, 3, 4, 2, 1, 1], { root: pc, quality: '', form: 'E폼', barre: { fret: n, from: 6, to: 1 } });
    add(N + 'm',  [n, n + 2, n + 2, n, n, n],           [1, 3, 4, 1, 1, 1], { root: pc, quality: 'm', form: 'E폼', barre: { fret: n, from: 6, to: 1 } });
    add(N + '7',  [n, n + 2, n, n + 1, n, n],           [1, 3, 1, 2, 1, 1], { root: pc, quality: '7', form: 'E폼' });
    add(N + 'm7', [n, n + 2, n, n, n, n],               [1, 3, 1, 1, 1, 1], { root: pc, quality: 'm7', form: 'E폼' });
    add(N + 'sus4', [n, n + 2, n + 2, n + 2, n, n],     [1, 2, 3, 4, 1, 1], { root: pc, quality: 'sus4', form: 'E폼' });
  }
  // A폼: 5번줄 근음을 n프렛에
  for (let n = 1; n <= 12; n++) {
    const pc = (9 + n) % 12;
    const N = PC[pc];
    add(N,        [-1, n, n + 2, n + 2, n + 2, n],       [-1, 1, 2, 3, 4, 1], { root: pc, quality: '', form: 'A폼', barre: { fret: n, from: 5, to: 1 } });
    add(N + 'm',  [-1, n, n + 2, n + 2, n + 1, n],       [-1, 1, 3, 4, 2, 1], { root: pc, quality: 'm', form: 'A폼', barre: { fret: n, from: 5, to: 1 } });
    add(N + '7',  [-1, n, n + 2, n, n + 2, n],           [-1, 1, 3, 1, 4, 1], { root: pc, quality: '7', form: 'A폼' });
    add(N + 'm7', [-1, n, n + 2, n, n + 1, n],           [-1, 1, 3, 1, 2, 1], { root: pc, quality: 'm7', form: 'A폼' });
    add(N + 'sus2', [-1, n, n + 2, n + 2, n, n],         [-1, 1, 3, 4, 1, 1], { root: pc, quality: 'sus2', form: 'A폼' });
    add(N + 'sus4', [-1, n, n + 2, n + 2, n + 3, n],     [-1, 1, 2, 3, 4, 1], { root: pc, quality: 'sus4', form: 'A폼' });
    add(N + '6',  [-1, n, n + 2, n + 2, n + 2, n + 2],   [-1, 1, 2, 3, 4, 4], { root: pc, quality: '6', form: 'A폼' });
  }
  // 파워 코드 (5도만)
  for (let n = 0; n <= 12; n++) {
    const pc6 = (4 + n) % 12;
    add(PC[pc6] + '5', [n, n + 2, n + 2, -1, -1, -1], [1, 3, 4, -1, -1, -1], { root: pc6, quality: '5', form: '파워' });
    const pc5 = (9 + n) % 12;
    add(PC[pc5] + '5', [-1, n, n + 2, n + 2, -1, -1], [-1, 1, 3, 4, -1, -1], { root: pc5, quality: '5', form: '파워' });
  }

  // ------------------------------------------------- 튜닝별 폼 계산 (음정 템플릿)
  function pcOf(m) { return ((m % 12) + 12) % 12; }

  function templateOf(shape) {
    let rootMidi = null;
    const midi = [];
    for (let i = 0; i < 6; i++) {
      const f = shape.frets[i];
      if (f < 0) { midi.push(null); continue; }
      const m = STD_OPEN[i] + f;
      midi.push(m);
      if (rootMidi == null && pcOf(m) === shape.root) rootMidi = m;
    }
    if (rootMidi == null) return null;
    const intervals = midi.map(function (m) { return m == null ? null : m - rootMidi; });
    return {
      quality: shape.quality,
      form: shape.form,
      intervals: intervals,
      fingers: shape.fingers.slice()
    };
  }

  baseShapes.forEach(function (sh) {
    const tpl = templateOf(sh);
    if (!tpl) return;
    const key = tpl.quality + '|' + tpl.form + '|' + tpl.intervals.join(',');
    if (seenTpl.has(key)) return;
    seenTpl.add(key);
    templates.push(tpl);
  });

  function genericFingers(frets) {
    const out = [-1, -1, -1, -1, -1, -1];
    const groups = {};
    for (let i = 0; i < 6; i++) {
      if (frets[i] > 0) {
        if (!groups[frets[i]]) groups[frets[i]] = [];
        groups[frets[i]].push(i);
      } else if (frets[i] === 0) {
        out[i] = 0;
      }
    }
    const fs = Object.keys(groups).map(Number).sort(function (a, b) { return a - b; });
    let finger = 1;
    for (let gi = 0; gi < fs.length; gi++) {
      const idxs = groups[fs[gi]].slice().sort(function (a, b) { return b - a; }); // 6번줄부터
      if (gi === 0 && idxs.length >= 2) {
        idxs.forEach(function (i) { out[i] = 1; });   // 첫 프렛 여러 줄 = 검지 바레
        finger = 2;
        continue;
      }
      for (let k = 0; k < idxs.length; k++) {
        out[idxs[k]] = Math.min(4, finger);
        if (finger < 4) finger++;
      }
    }
    return out;
  }

  function fingersFor(frets, src) {
    let ok = true;
    const byFinger = {};
    for (let i = 0; i < 6; i++) {
      const f = frets[i], fin = src[i];
      if (f > 0) {
        if (!(fin > 0) || fin > 4) { ok = false; break; }
        if (byFinger[fin] != null && byFinger[fin] !== f) { ok = false; break; }
        byFinger[fin] = f;
      } else if (fin > 0) { ok = false; break; }
    }
    return ok ? src.slice() : genericFingers(frets);
  }

  function sameNumbers(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  // 계산된 프렛이 실제로 그 코드(근음+종류)의 구성음만 내는지 확인
  function tonesMatch(frets, open, rootMidi, quality) {
    const q = QUALITIES[quality] || QUALITIES[''];
    const want = {};
    const rootPc = pcOf(rootMidi);
    q.intervals.forEach(function (iv) { want[(rootPc + iv) % 12] = true; });
    const got = {};
    let n = 0;
    for (let i = 0; i < 6; i++) {
      const f = frets[i];
      if (f < 0) continue;
      if (open[i] == null) return false;
      got[pcOf(open[i] + f)] = true;
      n++;
    }
    if (!n) return false;
    const wk = Object.keys(want);
    const gk = Object.keys(got);
    if (wk.length !== gk.length) return false;
    for (let i = 0; i < wk.length; i++) if (!got[wk[i]]) return false;
    return true;
  }

  function buildFor(open) {
    // 표준 튜닝은 손으로 적은 폼을 그대로 (기존 동작 그대로 보존)
    if (sameNumbers(open, STD_OPEN)) return baseShapes.slice();

    const out = [];
    const got = {};
    for (let ti = 0; ti < templates.length; ti++) {
      const tpl = templates[ti];
      const openShape = tpl.form === '오픈';
      for (let a = 0; a < 6; a++) {
        if (tpl.intervals[a] !== 0) continue;
        if (open[a] == null) continue;
        for (let af = 0; af <= 14; af++) {
          const rootMidi = open[a] + af;
          const frets = [];
          let ok = true, hasOpen = false, voiced = 0, minF = 99, maxF = -1, fretted = 0;
          for (let i = 0; i < 6; i++) {
            const iv = tpl.intervals[i];
            if (iv == null) { frets.push(-1); continue; }
            if (open[i] == null) { ok = false; break; }
            const f = rootMidi + iv - open[i];
            if (f < 0 || f > 15) { ok = false; break; }
            frets.push(f);
            voiced++;
            if (f === 0) hasOpen = true;
            else {
              fretted++;
              if (f < minF) minF = f;
              if (f > maxF) maxF = f;
            }
          }
          if (!ok || !voiced) continue;
          if (fretted && maxF - minF > 5) continue;   // 손이 닿지 않는 스트레치
          if (openShape && !hasOpen) continue;        // 오픈 폼은 개방현이 울릴 때만
          if (!tonesMatch(frets, open, rootMidi, tpl.quality)) continue;  // 실제 울리는 음이 그 코드여야
          const name = PC[pcOf(rootMidi)] + (QUALITIES[tpl.quality] || QUALITIES['']).label;
          const key = name + '|' + frets.join(',');
          if (got[key]) continue;
          got[key] = true;
          out.push({
            name: name,
            frets: frets,
            fingers: fingersFor(frets, tpl.fingers),
            root: pcOf(rootMidi),
            quality: tpl.quality,
            form: tpl.form,
            barre: null
          });
        }
      }
    }
    return out;
  }

  let currentOpen = STD_OPEN.slice();
  let currentKey = STD_OPEN.join(',');

  function setTuning(open) {
    const arr = [];
    const src = (open && open.length === 6) ? open : null;
    for (let i = 0; i < 6; i++) {
      const m = src && src[i] != null && isFinite(src[i]) ? Math.round(src[i]) : STD_OPEN[i];
      arr.push(m);
    }
    const key = arr.join(',');
    if (key === currentKey && shapes.length) return shapes;
    const list = buildFor(arr);
    shapes.length = 0;
    for (let i = 0; i < list.length; i++) shapes.push(list[i]);
    currentOpen = arr;
    currentKey = key;
    return shapes;
  }

  function tuningOpen() { return currentOpen.slice(); }

  // -------------------------------------------------------------- 표시 문자열
  function shapeLabel(shape) {
    if (!shape) return '';
    return shape.frets.map(function (f) { return f < 0 ? 'x' : (f > 9 ? String(f) : String(f)); }).join('');
  }

  function fullName(shape) {
    if (!shape) return '';
    return shape.name;
  }

  // ---------------------------------------------------------------- 매칭 로직
  function fretMapOf(notes) {
    // 같은 줄에 여러 프렛이 있으면 가장 많이 나온 것 사용
    const counts = [null, {}, {}, {}, {}, {}, {}]; // index 1..6
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const m = counts[n.string];
      m[n.fret] = (m[n.fret] || 0) + 1;
    }
    const out = {};
    for (let s = 1; s <= 6; s++) {
      let best = null, bestC = 0;
      const m = counts[s] || {};
      for (const k in m) {
        if (m[k] > bestC) { bestC = m[k]; best = Number(k); }
      }
      if (best !== null) out[s] = best;
    }
    return out;
  }

  function shapeTones(shape) {
    if (shape.root < 0) return null;
    const q = QUALITIES[shape.quality] || QUALITIES[''];
    const set = {};
    q.intervals.forEach(function (i) { set[(shape.root + i) % 12] = true; });
    return set;
  }

  // 음의 실제 음정 — 악보에서 계산된 midi 를 우선 쓰고, 없으면 현재 튜닝으로 계산
  function midiOf(n, open) {
    if (n.midi != null && isFinite(n.midi)) return n.midi;
    const base = open[6 - n.string];
    return (base == null ? STD_OPEN[6 - n.string] : base) + n.fret;
  }

  /**
   * 폼과 구간 음들을 대조한다.
   * - 같은 줄·같은 프렛 : 강한 일치 (+2.6)
   * - 같은 줄·2프렛 이내 : 지나가는 음 (+0.35)
   * - 폼에 없는 줄이지만 코드 구성음 : 개방현 베이스 등 (+1.0)
   * - 코드 구성음도 아님 : 감점 (-2.2)
   */
  function chordPipeline(shape, segNotes, open) {
    const op = open || currentOpen;
    let exact = 0, extra = 0, harm = 0, bad = 0;
    const usedStrings = {};
    const tones = shapeTones(shape);
    // 가장 낮은 음(베이스)은 비중을 크게
    let lowest = null, lowestMidi = 999;
    for (let i = 0; i < segNotes.length; i++) {
      const n = segNotes[i];
      const m = midiOf(n, op);
      if (m < lowestMidi) { lowestMidi = m; lowest = n; }
    }
    let score = 0;
    for (let i = 0; i < segNotes.length; i++) {
      const n = segNotes[i];
      usedStrings[n.string] = true;
      const f = shape.frets[6 - n.string];
      const pc = ((midiOf(n, op) % 12) + 12) % 12;
      const w = (lowest && n === lowest) ? 1.7 : 1;
      if (f === n.fret) { score += 2.6 * w; exact++; }
      else if (f >= 0) {
        const d = Math.abs(f - n.fret);
        if (d <= 2) { score += 0.35 * w; extra++; }
        else if (d <= 4 && tones && tones[pc]) { score -= 0.6 * w; bad++; extra++; }
        else { score -= 2.4 * w; bad++; extra++; }
      } else if (tones && tones[pc]) { score += 1.0 * w; harm++; extra++; }
      else { score -= 1.4 * w; bad++; extra++; }
    }
    let ghost = 0;
    for (let i = 0; i < 6; i++) {
      if (shape.frets[i] > 0 && !usedStrings[6 - i]) ghost++;
    }
    score -= 0.16 * ghost;
    // 오픈 폼을 살짝 선호하고, 특이한 화성(6/m6/sus 등)은 약간 감점
    if (shape.form === '오픈') score += 0.35;
    const qPenalty = { '6': 0.7, 'm6': 0.9, 'sus2': 0.5, 'sus4': 0.6, 'add9': 0.5, 'maj7': 0.3, '7': 0.2, 'm7': 0.15, '5': 0.5 };
    score -= (qPenalty[shape.quality] || 0);
    if (lowest && shape.root >= 0) {
      const lowPc = ((midiOf(lowest, op) % 12) + 12) % 12;
      if (lowPc === shape.root) score += 1.2;
    }
    return { exact: exact, extra: extra, harm: harm, bad: bad, ghost: ghost, score: score };
  }

  function matchChord(segNotes, prevShape, ratio, open) {
    if (!segNotes.length) return null;
    const op = open || currentOpen;
    if (op !== currentOpen) setTuning(op);
    const n = segNotes.length;
    const r0 = ratio == null ? 0.5 : ratio;
    const minExact = n <= 2 ? n : Math.max(2, Math.ceil(n * r0));
    const maxBad = Math.max(1, Math.floor(n * 0.3));
    const minScore = Math.max(2.4, n * 0.55);

    let best = null;
    for (let i = 0; i < shapes.length; i++) {
      const sh = shapes[i];
      const r = chordPipeline(sh, segNotes, op);
      const ok = r.exact >= minExact && r.bad <= maxBad && r.score >= minScore &&
        (r.exact + r.harm) >= Math.ceil(n * 0.5);
      if (!ok) continue;
      const cand = { shape: sh, exact: r.exact, extra: r.extra, harm: r.harm, bad: r.bad, ghost: r.ghost, score: r.score };
      if (!best || cand.score > best.score + 1e-9 ||
        (Math.abs(cand.score - best.score) < 1e-9 && sh.frets.filter(function (f) { return f > 0; }).length <
          best.shape.frets.filter(function (f) { return f > 0; }).length)) {
        best = cand;
      }
    }

    // 이전 폼이 이 구간을 잘 덮으면 그 폼을 유지(손 이동 최소화)
    if (prevShape) {
      const r = chordPipeline(prevShape, segNotes, op);
      const keepOk = r.bad <= maxBad && r.exact >= minExact;
      if (keepOk && (!best || best.shape.name !== prevShape.name)) {
        const keep = { shape: prevShape, exact: r.exact, extra: r.extra, harm: r.harm, bad: r.bad, ghost: r.ghost, score: r.score + 0.9 };
        if (!best || keep.score >= best.score) best = keep;
      }
    }
    return best;
  }

  /**
   * 폼의 1번 손가락 바레 범위.
   * shape.barre 가 있으면 그대로, 없어도 1번 손가락이 같은 프렛을 두 줄 이상 짚으면 바레로 본다.
   * 반환: { fret, from, to } (from = 낮은 줄 번호 쪽 끝, to = 높은 줄 번호 쪽 끝)
   */
  function barreOfShape(shape) {
    if (!shape) return null;
    if (shape.barre && shape.barre.fret > 0) {
      const a = shape.barre.from, b = shape.barre.to;
      return { fret: shape.barre.fret, from: Math.max(a, b), to: Math.min(a, b) };
    }
    const byFret = {};
    for (let i = 0; i < 6; i++) {
      if (shape.fingers[i] !== 1 || !(shape.frets[i] > 0)) continue;
      const s = 6 - i;
      const f = shape.frets[i];
      if (!byFret[f]) byFret[f] = [];
      byFret[f].push(s);
    }
    let best = null;
    Object.keys(byFret).forEach(function (k) {
      const strings = byFret[k];
      if (strings.length < 2) return;
      const fret = Number(k);
      if (!best || strings.length > best.strings.length) best = { fret: fret, strings: strings };
    });
    if (!best) return null;
    return {
      fret: best.fret,
      from: Math.max.apply(null, best.strings),
      to: Math.min.apply(null, best.strings),
      strings: best.strings.slice().sort(function (a, b) { return a - b; })
    };
  }

  // 이 음이 폼의 1번 손가락 바레가 이미 눌러 주는 자리인가
  function isBarreNote(note, shape, barre) {
    if (!shape || !barre) return false;
    if (note.fret !== barre.fret) return false;
    return note.string >= barre.to && note.string <= barre.from;
  }

  // 손가락 배정: 폼에 있는 음 → 폼 손가락, 바레 프렛 위의 음 → 1번 손가락, 그 밖의 추가음 → 남는 손가락
  function assignForShape(eventNotes, shape) {
    const out = [];
    const used = {};
    if (shape) {
      for (let i = 0; i < 6; i++) {
        const f = shape.fingers[i];
        if (f > 0) used[f] = true;
      }
    }
    const barre = barreOfShape(shape);
    const extras = [];
    for (let i = 0; i < eventNotes.length; i++) {
      const n = eventNotes[i];
      const f = shape ? shape.frets[6 - n.string] : -1;
      if (shape && f === n.fret) {
        const fin = shape.fingers[6 - n.string];
        out.push({ string: n.string, fret: n.fret, midi: n.midi, finger: fin > 0 ? fin : 0, kind: n.fret === 0 ? 'open' : 'form' });
      } else if (isBarreNote(n, shape, barre)) {
        // 1번 검지 바레가 이미 누르고 있는 자리 — 줄만 울리면 되니 1번 손가락으로 표시
        out.push({ string: n.string, fret: n.fret, midi: n.midi, finger: 1, kind: 'barre' });
      } else {
        extras.push({ string: n.string, fret: n.fret, midi: n.midi });
      }
    }
    if (extras.length) {
      extras.sort(function (a, b) { return b.fret - a.fret; });
      const avail = [4, 3, 2].filter(function (f) { return !used[f]; });
      if (!used[1] && !(shape && shape.barre)) avail.push(1);
      for (let i = 0; i < extras.length; i++) {
        const ex = extras[i];
        let fin = 0;
        // 같은 줄에 이미 쓰인 손가락은 피한다
        for (let k = 0; k < avail.length; k++) {
          const cand = avail[k];
          const conflict = out.some(function (o) { return o.finger === cand && o.string === ex.string; });
          if (!conflict) { fin = cand; avail.splice(k, 1); break; }
        }
        out.push({ string: ex.string, fret: ex.fret, midi: ex.midi, finger: fin, kind: 'extra' });
      }
    }
    // 개방현은 손가락 0
    out.forEach(function (o) { if (o.fret === 0) o.finger = 0; });
    out.sort(function (a, b) { return a.string - b.string; });
    return out;
  }

  function ghostsForShape(shape, eventNotes) {
    if (!shape) return [];
    const played = {};
    const playedString = {};
    eventNotes.forEach(function (n) {
      played[n.string + ':' + n.fret] = true;
      playedString[n.string] = true;
    });
    const g = [];
    for (let i = 0; i < 6; i++) {
      const s = 6 - i;
      if (!(shape.frets[i] > 0)) continue;
      if (played[s + ':' + shape.frets[i]]) continue;   // 지금 그 자리를 그대로 짚고 있다
      g.push({
        string: s,
        fret: shape.frets[i],
        finger: shape.fingers[i] > 0 ? shape.fingers[i] : 0,
        // 같은 줄을 다른 프렛으로 치는 중 — 폼 자리는 아주 연하게만 남긴다
        faint: !!playedString[s]
      });
    }
    return g;
  }

  // 처음에는 표준 튜닝 폼으로 채워 둔다 (setTuning 전에도 동작)
  shapes.push.apply(shapes, baseShapes);

  global.Chords = {
    PC: PC,
    STD_OPEN: STD_OPEN,
    QUALITIES: QUALITIES,
    shapes: shapes,
    templates: templates,
    setTuning: setTuning,
    tuningOpen: tuningOpen,
    matchChord: matchChord,
    assignForShape: assignForShape,
    ghostsForShape: ghostsForShape,
    barreOfShape: barreOfShape,
    shapeLabel: shapeLabel,
    fretMapOf: fretMapOf
  };
})(window);
