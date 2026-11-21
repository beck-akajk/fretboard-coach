/* 프렛 코치 — 악보 모델 정규화
 * alphaTab으로 읽은 Score를 앱이 쓰는 단순 모델로 바꾼다.
 * 모든 시간은 MIDI tick (960 = 4분음표 1개) 기준.
 */
(function (global) {
  'use strict';

  const TICKS_PER_QUARTER = 960;
  const DUR_BASE = TICKS_PER_QUARTER * 4;

  function ticksFromTs(mb) {
    const n = mb.timeSignatureNumerator || 4;
    const d = mb.timeSignatureDenominator || 4;
    // denominator 4 → 4분음표 기준 1박
    return n * (DUR_BASE / d);
  }

  function beatTicks(beat) {
    let pd = beat.playbackDuration;
    if (pd && pd > 0) return pd;
    const v = beat.duration;
    let base = v > 0 ? DUR_BASE / v : DUR_BASE * Math.abs(v);
    if (!isFinite(base) || base <= 0) base = TICKS_PER_QUARTER;
    const dots = beat.dots || 0;
    if (dots === 1) base *= 1.5;
    else if (dots === 2) base *= 1.75;
    const tn = beat.tupletNumerator || 0;
    const td = beat.tupletDenominator || 0;
    if (tn > 1 && td > 0) base = base * td / tn;
    return Math.max(20, Math.round(base));
  }

  function safeDuration(mb) {
    try {
      if (typeof mb.calculateDuration === 'function') {
        const d = mb.calculateDuration();
        if (d && d > 0) return d;
      }
    } catch (e) { /* ignore */ }
    return ticksFromTs(mb);
  }

  function barTempo(mb, fallback) {
    try {
      if (mb.tempoAutomations && mb.tempoAutomations.length) {
        const v = Number(mb.tempoAutomations[0].value);
        if (v > 1) return v;
      }
      if (typeof mb.tempo === 'number' && mb.tempo > 1) return mb.tempo;
    } catch (e) { /* ignore */ }
    return fallback;
  }

  function tuningText(tuning, count) {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const out = [];
    for (let s = count; s >= 1; s--) {
      const m = tuning[s];
      if (m == null) continue;
      out.push(names[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1));
    }
    return out.join(' ');
  }

  function normalize(alphaScore, settings, fileName) {
    const masterBars = alphaScore.masterBars || [];
    const baseTempo = Number(alphaScore.tempo) > 1 ? Number(alphaScore.tempo) : 120;

    const barStarts = [];
    const barLens = [];
    const barTempos = [];
    let cursor = 0;
    for (let i = 0; i < masterBars.length; i++) {
      const mb = masterBars[i];
      const ts = ticksFromTs(mb);
      let len = safeDuration(mb);
      if (!len || len <= 0) len = ts;
      if (len < ts * 0.25 && i > 0) len = ts;      // 이상치 보정
      if (len > ts * 8) len = ts;
      barStarts.push(cursor);
      barLens.push(len);
      barTempos.push(barTempo(mb, baseTempo));
      cursor += len;
    }

    const tracks = [];
    const alphaTracks = alphaScore.tracks || [];
    for (let ti = 0; ti < alphaTracks.length; ti++) {
      const track = alphaTracks[ti];
      const staffs = track.staves || [];
      let staff = null;
      for (let si = 0; si < staffs.length; si++) {
        if (staffs[si].tuning && staffs[si].tuning.length) { staff = staffs[si]; break; }
      }
      if (!staff) staff = staffs[0];
      if (!staff) continue;

      const tuningArr = (staff.tuning && staff.tuning.length) ? staff.tuning : [40, 45, 50, 55, 59, 64];
      const count = tuningArr.length;
      const capo = staff.capo || 0;
      const tuning = {};
      for (let s = 1; s <= count; s++) {
        tuning[s] = tuningArr[count - s] + capo;
      }

      const bars = [];
      let noteTotal = 0;
      for (let bi = 0; bi < masterBars.length; bi++) {
        const mb = masterBars[bi];
        const bar = staff.bars ? staff.bars[bi] : null;
        const byTick = new Map();
        if (bar && bar.voices) {
          for (let vi = 0; vi < bar.voices.length; vi++) {
            const voice = bar.voices[vi];
            const beats = voice.beats || [];
            let tick = 0;
            for (let bxi = 0; bxi < beats.length; bxi++) {
              const beat = beats[bxi];
              const dur = beatTicks(beat);
              const notes = [];
              if (beat.notes) {
                for (let ni = 0; ni < beat.notes.length; ni++) {
                  const note = beat.notes[ni];
                  if (note.isTieDestination) continue;
                  let fret = note.fret;
                  if (!isFinite(fret) || note.isDead) continue;
                  const str = note.string;
                  if (!(str in tuning)) continue;
                  let midi = tuning[str] + fret;
                  if (isFinite(note.realValue)) {
                    // 표기 옥타브(effect)로 계산값과 크게 다르면 계산값 유지
                    if (Math.abs(note.realValue - midi) <= 12) midi = note.realValue;
                  }
                  const item = { string: str, fret: fret, midi: midi };
                  const fx = note.effects;
                  if (fx) {
                    if (note.isHammerPullOrigin || (fx.hammerPullOrigin && fx.hammerPullOrigin.isOrigin)) item.tech = 'hp';
                    if (fx.slideOutType || fx.slideInType) item.tech = 'slide';
                    if (fx.isBend || (fx.bendType && fx.bendType !== 0)) item.tech = 'bend';
                    if (fx.vibrato) item.tech = 'vib';
                  }
                  notes.push(item);
                }
              }
              if (notes.length) {
                const key = tick;
                const prev = byTick.get(key);
                if (prev) {
                  for (let k = 0; k < notes.length; k++) prev.notes.push(notes[k]);
                  prev.dur = Math.max(prev.dur, dur);
                } else {
                  byTick.set(key, { tick: barStarts[bi] + tick, rel: tick, dur: dur, notes: notes });
                }
                noteTotal += notes.length;
              }
              tick += dur;
            }
          }
        }
        const events = Array.from(byTick.values()).sort(function (a, b) { return a.tick - b.tick; });
        // 같은 줄 중복 정리 (다른 성부 중복)
        events.forEach(function (ev) {
          const seen = {};
          ev.notes = ev.notes.filter(function (n) {
            if (seen[n.string]) return false;
            seen[n.string] = true;
            return true;
          });
          ev.notes.sort(function (a, b) { return a.string - b.string; });
        });
        bars.push({
          index: bi,
          startTick: barStarts[bi],
          lenTicks: barLens[bi],
          tempo: barTempos[bi],
          tsNum: mb.timeSignatureNumerator || 4,
          tsDen: mb.timeSignatureDenominator || 4,
          events: events
        });
      }

      tracks.push({
        index: ti,
        name: track.name || ('트랙 ' + (ti + 1)),
        stringCount: count,
        tuning: tuning,
        capo: capo,
        tuningText: tuningText(tuning, count),
        noteCount: noteTotal,
        bars: bars
      });
    }

    const title = alphaScore.title || fileName || '제목 없음';
    const metaParts = [];
    if (alphaScore.artist) metaParts.push(alphaScore.artist);
    if (alphaScore.album) metaParts.push(alphaScore.album);
    if (alphaScore.tab) metaParts.push('Tab: ' + alphaScore.tab);
    if (!metaParts.length) metaParts.push(fileName || '');

    return {
      title: title,
      artist: alphaScore.artist || '',
      meta: metaParts.filter(Boolean).join(' · '),
      tempo: baseTempo,
      source: 'file',
      fileName: fileName || '',
      tracks: tracks,
      stats: {
        trackCount: tracks.length,
        barCount: masterBars.length,
        noteCount: tracks.reduce(function (a, t) { return a + t.noteCount; }, 0),
        eventCount: tracks.reduce(function (a, t) {
          return a + t.bars.reduce(function (x, b) { return x + b.events.length; }, 0);
        }, 0)
      }
    };
  }

  function loadFromBytes(arrayBuffer, fileName) {
    if (!global.alphaTab) throw new Error('alphaTab 라이브러리를 불러오지 못했습니다');
    const settings = new global.alphaTab.Settings();
    try { settings.core.logLevel = 2; } catch (e) { /* ignore */ }
    const bytes = new Uint8Array(arrayBuffer);
    const alphaScore = global.alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes, settings);
    if (!alphaScore) throw new Error('악보를 읽지 못했습니다');
    try { if (typeof alphaScore.finish === 'function') alphaScore.finish(settings); } catch (e) { /* tick 계산은 자체 처리 */ }
    return normalize(alphaScore, settings, fileName);
  }

  global.ScoreTools = {
    loadFromBytes: loadFromBytes,
    normalize: normalize,
    beatTicks: beatTicks,
    TICKS_PER_QUARTER: TICKS_PER_QUARTER
  };
})(window);
