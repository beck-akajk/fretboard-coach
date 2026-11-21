/* 프렛 코치 — 코드 폼 라이브러리
 * frets / fingers 배열은 [6번줄, 5번줄, 4번줄, 3번줄, 2번줄, 1번줄] 순서.
 * -1 = 뮤트(x), 0 = 개방현.
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

  const shapes = [];
  const seen = new Set();

  function add(name, frets, fingers, opt) {
    const key = frets.join(',');
    if (seen.has(key)) return;
    seen.add(key);
    const o = opt || {};
    shapes.push({
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
    add(PC[pc6] + '5', [n, n + 2, n + 2, -1, -1, -1], [-1, 1, 3, 4, -1, -1], { root: pc6, quality: '5', form: '파워' });
    const pc5 = (9 + n) % 12;
    add(PC[pc5] + '5', [-1, n, n + 2, n + 2, -1, -1], [-1, 1, 3, 4, -1, -1], { root: pc5, quality: '5', form: '파워' });
  }

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
      const m = counts[s];
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

  /**
   * 폼과 구간 음들을 대조한다.
   * - 같은 줄·같은 프렛 : 강한 일치 (+2.6)
   * - 같은 줄·2프렛 이내 : 지나가는 음 (+0.35)
   * - 폼에 없는 줄이지만 코드 구성음 : 개방현 베이스 등 (+1.0)
   * - 코드 구성음도 아님 : 감점 (-2.2)
   */
  function chordPipeline(shape, segNotes) {
    let exact = 0, extra = 0, harm = 0, bad = 0;
    const usedStrings = {};
    const tones = shapeTones(shape);
    // 가장 낮은 음(베이스)은 비중을 크게
    let lowest = null, lowestMidi = 999;
    for (let i = 0; i < segNotes.length; i++) {
      const n = segNotes[i];
      const m = (n.midi != null ? n.midi : (STD_OPEN[6 - n.string] + n.fret));
      if (m < lowestMidi) { lowestMidi = m; lowest = n; }
    }
    let score = 0;
    for (let i = 0; i < segNotes.length; i++) {
      const n = segNotes[i];
      usedStrings[n.string] = true;
      const f = shape.frets[6 - n.string];
      const pc = (((n.midi != null ? n.midi : (STD_OPEN[6 - n.string] + n.fret)) % 12) + 12) % 12;
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
      const lowPc = (((lowest.midi != null ? lowest.midi : (STD_OPEN[6 - lowest.string] + lowest.fret)) % 12) + 12) % 12;
      if (lowPc === shape.root) score += 1.2;
    }
    return { exact: exact, extra: extra, harm: harm, bad: bad, ghost: ghost, score: score };
  }

  function matchChord(segNotes, prevShape, ratio) {
    if (!segNotes.length) return null;
    const n = segNotes.length;
    const r0 = ratio == null ? 0.5 : ratio;
    const minExact = n <= 2 ? n : Math.max(2, Math.ceil(n * r0));
    const maxBad = Math.max(1, Math.floor(n * 0.3));
    const minScore = Math.max(2.4, n * 0.55);

    let best = null;
    for (let i = 0; i < shapes.length; i++) {
      const sh = shapes[i];
      const r = chordPipeline(sh, segNotes);
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
      const r = chordPipeline(prevShape, segNotes);
      const keepOk = r.bad <= maxBad && r.exact >= minExact;
      if (keepOk && (!best || best.shape.name !== prevShape.name)) {
        const keep = { shape: prevShape, exact: r.exact, extra: r.extra, harm: r.harm, bad: r.bad, ghost: r.ghost, score: r.score + 0.9 };
        if (!best || keep.score >= best.score) best = keep;
      }
    }
    return best;
  }

  // 손가락 배정: 폼에 있는 음 → 폼 손가락, 폼에 없는 추가음 → 남는 손가락
  function assignForShape(eventNotes, shape) {
    const out = [];
    const used = {};
    if (shape) {
      for (let i = 0; i < 6; i++) {
        const f = shape.fingers[i];
        if (f > 0) used[f] = true;
      }
    }
    const extras = [];
    for (let i = 0; i < eventNotes.length; i++) {
      const n = eventNotes[i];
      const f = shape ? shape.frets[6 - n.string] : -1;
      if (shape && f === n.fret) {
        const fin = shape.fingers[6 - n.string];
        out.push({ string: n.string, fret: n.fret, midi: n.midi, finger: fin > 0 ? fin : 0, kind: n.fret === 0 ? 'open' : 'form' });
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
    const pressed = {};
    eventNotes.forEach(function (n) { pressed[n.string] = true; });
    const g = [];
    for (let i = 0; i < 6; i++) {
      const s = 6 - i;
      if (shape.frets[i] > 0 && !pressed[s]) {
        g.push({ string: s, fret: shape.frets[i], finger: shape.fingers[i] > 0 ? shape.fingers[i] : 0 });
      }
    }
    return g;
  }

  global.Chords = {
    PC: PC,
    STD_OPEN: STD_OPEN,
    QUALITIES: QUALITIES,
    shapes: shapes,
    matchChord: matchChord,
    assignForShape: assignForShape,
    ghostsForShape: ghostsForShape,
    shapeLabel: shapeLabel,
    fretMapOf: fretMapOf
  };
})(window);
