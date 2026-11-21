/* 프렛 코치 — 기본 내장 데모 (자작 · 저작권 없음)
 * D – Bm7 – G – A 아르페지오 8마디 + 같은 진행의 솔로 리프 트랙.
 */
(function (global) {
  'use strict';

  const TICKS = 960;
  const EIGHTH = 480;
  const BAR = TICKS * 4;
  const TEMPO = 76;
  const TUNING = { 6: 40, 5: 45, 4: 50, 3: 55, 2: 59, 1: 64 };

  const P = {
    D:   [[4, 0], [3, 2], [2, 3], [1, 2], [3, 2], [2, 3], [1, 2], [2, 3]],
    Bm7: [[5, 2], [4, 0], [3, 2], [2, 0], [1, 2], [2, 0], [3, 2], [4, 0]],
    G:   [[6, 3], [5, 2], [4, 0], [3, 0], [2, 0], [1, 3], [2, 0], [3, 0]],
    A:   [[5, 0], [4, 2], [3, 2], [2, 2], [1, 0], [2, 2], [3, 2], [4, 2]]
  };

  const RIFF_A = [[5, 5], [5, 7], [4, 4], [4, 7], [4, 5], [4, 4], [5, 7], [5, 5]];
  const RIFF_B = [[4, 7], [3, 4], [3, 6], [3, 7], [3, 6], [3, 4], [4, 7], [4, 4]];

  function makeEvent(barStart, slot, pairs, dur) {
    const notes = pairs.map(function (p) {
      return { string: p[0], fret: p[1], midi: TUNING[p[0]] + p[1] };
    });
    return { tick: barStart + slot * EIGHTH, dur: dur || EIGHTH, notes: notes };
  }

  function makeBar(index, chordSlots) {
    const start = index * BAR;
    const events = [];
    chordSlots.forEach(function (pair) {
      events.push(makeEvent(start, pair[0], pair[1]));
    });
    return {
      index: index,
      startTick: start,
      lenTicks: BAR,
      tempo: TEMPO,
      tsNum: 4,
      tsDen: 4,
      events: events
    };
  }

  function slotsFor(pattern, from) {
    const base = from || 0;
    return pattern.map(function (p, i) { return [base + i, [p]]; });
  }

  function build() {
    const prog = [
      ['D', 'D', 'Bm7', 'Bm7', 'G', 'G', 'A'],
      []
    ];
    const arpBars = [];

    // 1–6마디: 두 마디씩 코드 유지
    const seq = ['D', 'D', 'Bm7', 'Bm7', 'G', 'G'];
    for (let i = 0; i < seq.length; i++) {
      arpBars.push(makeBar(i, slotsFor(P[seq[i]])));
    }
    // 7마디: A, 8마디: A → D (마디 안에서 코드가 바뀌는 예)
    arpBars.push(makeBar(6, slotsFor(P.A)));
    arpBars.push(makeBar(7, slotsFor(P.A, 0).slice(0, 4).concat(slotsFor(P.D, 4))));

    const riffBars = [];
    const riffSeq = [RIFF_A, RIFF_A, RIFF_B, RIFF_B, RIFF_A, RIFF_A, RIFF_B, RIFF_B];
    for (let i = 0; i < riffSeq.length; i++) {
      riffBars.push(makeBar(i, slotsFor(riffSeq[i])));
    }

    return {
      title: '연습 데모 · D – Bm7 – G – A',
      artist: '프렛 코치',
      meta: '자작 아르페지오 + 솔로 리프 · 76 BPM',
      tempo: TEMPO,
      source: 'demo',
      fileName: '프렛 코치 기본 데모',
      tracks: [
        {
          index: 0,
          name: '아르페지오 (코드폼)',
          stringCount: 6,
          tuning: Object.assign({}, TUNING),
          capo: 0,
          tuningText: 'E2 A2 D3 G3 B3 E4',
          noteCount: arpBars.reduce(function (a, b) { return a + b.events.length; }, 0),
          bars: arpBars
        },
        {
          index: 1,
          name: '솔로 리프 (포지션)',
          stringCount: 6,
          tuning: Object.assign({}, TUNING),
          capo: 0,
          tuningText: 'E2 A2 D3 G3 B3 E4',
          noteCount: riffBars.reduce(function (a, b) { return a + b.events.length; }, 0),
          bars: riffBars
        }
      ],
      stats: {
        trackCount: 2,
        barCount: 8,
        noteCount: 64 + 64,
        eventCount: 64 + 64,
        demo: true
      }
    };
  }

  global.DemoSong = { build: build };
})(window);
