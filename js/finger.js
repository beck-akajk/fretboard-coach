/* 프렛 코치 — 운지 추천 엔진
 * 1) 코드폼 모드 : 마디(또는 반 마디)의 음들을 코드 폼과 대조해 기준 폼을 정하고
 *                  폼 안의 음은 폼 손가락, 벗어난 음은 남는 손가락으로 배정.
 * 2) 포지션 모드 : 이벤트 단위 DP로 손 위치(1번 손가락 프렛)와 손가락을 최소 이동으로 배정.
 */
(function (global) {
  'use strict';

  const C = global.Chords;
  const OFFSET_FINGER = [1, 2, 3, 4, 4]; // 1번 손가락 기준 오프셋 0~4

  function segNotesOf(events, from, to) {
    const acc = [];
    for (let i = from; i <= to; i++) {
      const ev = events[i];
      if (!ev) continue;
      for (let k = 0; k < ev.notes.length; k++) acc.push(ev.notes[k]);
    }
    return acc;
  }

  function uniqNotes(notes) {
    const map = C.fretMapOf(notes);
    const out = [];
    for (let s = 1; s <= 6; s++) if (s in map) out.push({ string: s, fret: map[s] });
    return out;
  }

  // ---------------------------------------------------------------- 포지션 DP
  function positionForEvent(ev, p) {
    const res = { ok: true, cost: 0, fingers: [] };
    const usedFingers = {};
    const items = ev.notes.slice().sort(function (a, b) { return a.fret - b.fret || b.string - a.string; });
    for (let i = 0; i < items.length; i++) {
      const n = items[i];
      if (n.fret === 0) {
        res.fingers.push({ string: n.string, fret: 0, midi: n.midi, finger: 0, kind: 'open' });
        continue;
      }
      const off = n.fret - p;
      if (off < 0 || off > 4) { res.ok = false; return res; }
      let finger = OFFSET_FINGER[off];
      // 이미 같은 손가락을 쓰고 있으면 위 손가락으로 밀어 올린다
      let guard = 0;
      while (usedFingers[finger] && finger < 4 && guard < 4) { finger++; guard++; }
      if (usedFingers[finger]) { res.cost += 3; } else { usedFingers[finger] = true; }
      let c = 0.18 * off;
      if (off === 4) c += 0.9;
      if (off === 3 && finger === 4) c += 0.25;
      if (off === 3 && finger === 1) c += 0.5;
      if (n.string <= 2 && finger === 4 && off >= 3) c += 0.25;
      res.cost += c;
      res.fingers.push({ string: n.string, fret: n.fret, midi: n.midi, finger: finger, kind: 'pos' });
    }
    return res;
  }

  function positionPlan(events) {
    const fretted = [];
    for (let i = 0; i < events.length; i++) {
      for (let k = 0; k < events[i].notes.length; k++) {
        const f = events[i].notes[k].fret;
        if (f > 0) fretted.push(f);
      }
    }
    if (!fretted.length) {
      return events.map(function (ev) {
        return { position: 1, fingers: ev.notes.map(function (n) {
          return { string: n.string, fret: n.fret, midi: n.midi, finger: 0, kind: 'open' };
        }) };
      });
    }
    const maxF = Math.max.apply(null, fretted);
    const minF = Math.min.apply(null, fretted);
    const positions = [];
    for (let p = Math.max(0, minF - 1); p <= Math.min(maxF, 15); p++) positions.push(p);
    if (!positions.length) positions.push(minF);

    const INF = 1e9;
    const n = events.length;
    const cost = [];
    const prevs = [];
    for (let i = 0; i < n; i++) {
      const row = new Array(positions.length).fill(INF);
      const back = new Array(positions.length).fill(-1);
      for (let pi = 0; pi < positions.length; pi++) {
        const p = positions[pi];
        const r = positionForEvent(events[i], p);
        if (!r.ok) continue;
        if (i === 0) { row[pi] = r.cost; back[pi] = -1; continue; }
        let bestPrev = -1, bestCost = INF;
        for (let pj = 0; pj < positions.length; pj++) {
          const pc = cost[i - 1][pj];
          if (pc >= INF) continue;
          const move = Math.abs(positions[pi] - positions[pj]);
          const c = pc + move * 1.15 + r.cost;
          if (c < bestCost) { bestCost = c; bestPrev = pj; }
        }
        row[pi] = bestCost;
        back[pi] = bestPrev;
      }
      cost.push(row);
      prevs.push(back);
    }

    let endIdx = -1, endCost = INF;
    for (let pi = 0; pi < positions.length; pi++) {
      if (cost[n - 1][pi] < endCost) { endCost = cost[n - 1][pi]; endIdx = pi; }
    }
    if (endIdx < 0) endIdx = 0;
    const path = new Array(n);
    let cur = endIdx;
    for (let i = n - 1; i >= 0; i--) {
      path[i] = positions[cur];
      cur = prevs[i][cur];
      if (cur < 0 && i > 0) cur = endIdx;
    }
    return path.map(function (p, i) {
      const r = positionForEvent(events[i], p);
      return { position: p, fingers: r.ok ? r.fingers : events[i].notes.map(function (nn) {
        return { string: nn.string, fret: nn.fret, midi: nn.midi, finger: 0, kind: 'pos' };
      }) };
    });
  }

  // ------------------------------------------------------------- 마디 분석
  function chooseShape(events, from, to, prevShape, mode, open) {
    if (mode === 'position') return null;
    const seg = segNotesOf(events, from, to);
    if (!seg.length) return null;
    // 코드 폼은 3줄 이상을 함께 짚을 때만 의미가 있다.
    const strings = {};
    const perString = {};
    let stringCount = 0;
    for (let i = 0; i < seg.length; i++) {
      const n = seg[i];
      if (!strings[n.string]) { strings[n.string] = true; stringCount++; }
      if (!perString[n.string]) perString[n.string] = {};
      if (n.fret > 0) perString[n.string][n.fret] = true; // 개방현은 세지 않는다
    }
    if (stringCount < 3) return null;
    const keys = Object.keys(perString);
    for (let i = 0; i < keys.length; i++) {
      if (Object.keys(perString[keys[i]]).length >= 3) return null; // 한 줄에서 3프렛 이상 이동 = 멜로디/리프
    }
    const m = C.matchChord(seg, prevShape, mode === 'chord' ? 0.25 : 0.5, open);
    return m ? m.shape : null;
  }

  function splitSegments(bar, events, mode) {
    const single = [{ from: 0, to: events.length - 1 }];
    if (events.length < 5) return single;
    if (mode === 'position') return single;
    const midTick = bar.startTick + bar.lenTicks / 2;
    let cut = -1;
    for (let i = 0; i < events.length; i++) {
      if (events[i].tick >= midTick) { cut = i; break; }
    }
    if (cut <= 0 || cut >= events.length) return single;
    return [{ from: 0, to: cut - 1 }, { from: cut, to: events.length - 1 }];
  }

  function analyzeBar(bar, track, mode, prevShape) {
    const events = bar.events || [];
    if (!events.length) return { events: [], shapes: [], prevShape: prevShape };

    // 트랙의 튜닝(카포 제외)에 맞춰 코드 폼·코드명을 계산한다.
    const open = (global.Tunings && global.Tunings.openFromTrack)
      ? global.Tunings.openFromTrack(track) : C.STD_OPEN;
    C.setTuning(open);

    const segs = splitSegments(bar, events, mode);
    const plan = positionPlan(events);

    let shapes = [];
    if (segs.length === 2) {
      // 반씩 나눠 폼이 실제로 다를 때만 나눈다
      const a = chooseShape(events, segs[0].from, segs[0].to, prevShape, mode, open);
      const b = chooseShape(events, segs[1].from, segs[1].to, a || prevShape, mode, open);
      if (a && b && a.name !== b.name) {
        shapes = [a, b];
      } else {
        const whole = chooseShape(events, 0, events.length - 1, prevShape, mode, open) || a || b;
        segs.length = 0;
        segs.push({ from: 0, to: events.length - 1 });
        shapes = [whole];
      }
    } else {
      shapes = [chooseShape(events, 0, events.length - 1, prevShape, mode, open)];
    }

    const out = [];
    let lastShape = prevShape;
    // 포지션 모드에서도 카드에 보여 줄 '이 마디 코드'를 따로 찾는다(운지 계산에는 영향 없음)
    let refShape = null;
    if (!shapes.some(Boolean) && mode === 'position') {
      const m = C.matchChord(segNotesOf(events, 0, events.length - 1), null, 0.5, open);
      refShape = m ? m.shape : null;
    }
    for (let si = 0; si < segs.length; si++) {
      const seg = segs[si];
      const shape = shapes[si] || null;
      if (shape) lastShape = shape;
      for (let i = seg.from; i <= seg.to; i++) {
        const ev = events[i];
        if (shape) {
          const fingers = C.assignForShape(ev.notes, shape);
          const ghosts = C.ghostsForShape(shape, ev.notes);
          let p = 99;
          fingers.forEach(function (f) { if (f.fret > 0 && f.fret < p) p = f.fret; });
          if (p === 99 && shape.barre) p = shape.barre.fret;
          out.push({
            index: i,
            tick: ev.tick,
            dur: ev.dur,
            notes: ev.notes,
            fingers: fingers,
            ghosts: ghosts,
            shape: shape,
            shapeLabel: C.shapeLabel(shape),
            position: p === 99 ? 1 : p,
            engine: 'chord'
          });
        } else {
          const pp = plan[i] || { position: 1, fingers: [] };
          out.push({
            index: i,
            tick: ev.tick,
            dur: ev.dur,
            notes: ev.notes,
            fingers: pp.fingers,
            ghosts: [],
            shape: null,
            barShape: refShape,
            shapeLabel: refShape ? C.shapeLabel(refShape) : '',
            position: pp.position,
            engine: 'position'
          });
        }
      }
    }
    return {
      events: out,
      shapes: shapes,
      // 화면 표시용 코드 목록 : 포지션 모드에서도 이 마디 코드가 있으면 함께 돌려준다
      refShapes: shapes.some(Boolean) ? shapes : (refShape ? [refShape] : []),
      prevShape: lastShape
    };
  }

  global.Finger = {
    analyzeBar: analyzeBar,
    positionPlan: positionPlan,
    uniqNotes: uniqNotes
  };
})(window);
