/* 프렛 코치 — 기타 튜닝 사전
 * 타브 악보의 트랙 튜닝(6번줄→1번줄 MIDI)을 이름으로 알아보고,
 * 화면에 쓸 표기(Standard · E A D G B E / Drop C · C G C F A D)를 만든다.
 * 카포는 여기에 넣지 않는다 — 부르는 쪽이 카포를 뺀 개방현 음정을 넘긴다.
 */
(function (global) {
  'use strict';

  const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

  function pcOf(midi) { return ((midi % 12) + 12) % 12; }

  /* notes 는 6번줄 → 1번줄 순서. midi 도 같은 순서. */
  const PRESETS = [
    { id: 'standard', name: 'Standard', ko: '표준 튜닝', midi: [40, 45, 50, 55, 59, 64], notes: ['E', 'A', 'D', 'G', 'B', 'E'] },
    { id: 'eb', name: 'Half-Step Down', ko: '반음 내림 (E♭)', midi: [39, 44, 49, 54, 58, 63], notes: ['E♭', 'A♭', 'D♭', 'G♭', 'B♭', 'E♭'] },
    { id: 'd-standard', name: 'D Standard', ko: '한음 내림 (D)', midi: [38, 43, 48, 53, 57, 62], notes: ['D', 'G', 'C', 'F', 'A', 'D'] },
    { id: 'drop-d', name: 'Drop D', ko: '드롭 D', midi: [38, 45, 50, 55, 59, 64], notes: ['D', 'A', 'D', 'G', 'B', 'E'] },
    { id: 'drop-c#', name: 'Drop C#', ko: '드롭 C#', midi: [37, 44, 49, 54, 58, 63], notes: ['C♯', 'G♯', 'C♯', 'F♯', 'A♯', 'D♯'] },
    { id: 'drop-c', name: 'Drop C', ko: '드롭 C', midi: [36, 43, 48, 53, 57, 62], notes: ['C', 'G', 'C', 'F', 'A', 'D'] },
    { id: 'drop-b', name: 'Drop B', ko: '드롭 B', midi: [35, 42, 47, 52, 56, 61], notes: ['B', 'F♯', 'B', 'E', 'G♯', 'C♯'] },
    { id: 'c#-standard', name: 'C# Standard', ko: 'C# 표준', midi: [37, 42, 47, 52, 56, 61], notes: ['C♯', 'F♯', 'B', 'E', 'G♯', 'C♯'] },
    { id: 'c-standard', name: 'C Standard', ko: 'C 표준', midi: [36, 41, 46, 51, 55, 60], notes: ['C', 'F', 'B♭', 'E♭', 'G', 'C'] },
    { id: 'b-standard', name: 'B Standard', ko: 'B 표준', midi: [35, 40, 45, 50, 54, 59], notes: ['B', 'E', 'A', 'D', 'F♯', 'B'] },
    { id: 'open-g', name: 'Open G', ko: '오픈 G', midi: [38, 43, 50, 55, 59, 62], notes: ['D', 'G', 'D', 'G', 'B', 'D'] },
    { id: 'open-d', name: 'Open D', ko: '오픈 D', midi: [38, 45, 50, 54, 57, 62], notes: ['D', 'A', 'D', 'F♯', 'A', 'D'] },
    { id: 'open-e', name: 'Open E', ko: '오픈 E', midi: [40, 47, 52, 56, 59, 64], notes: ['E', 'B', 'E', 'G♯', 'B', 'E'] },
    { id: 'open-c', name: 'Open C', ko: '오픈 C', midi: [36, 43, 48, 52, 55, 60], notes: ['C', 'G', 'C', 'E', 'G', 'C'] },
    { id: 'dadgad', name: 'DADGAD', ko: 'DADGAD', midi: [38, 45, 50, 55, 57, 62], notes: ['D', 'A', 'D', 'G', 'A', 'D'] },
    { id: 'drop-a', name: 'Drop A', ko: '드롭 A', midi: [33, 40, 45, 50, 54, 59], notes: ['A', 'E', 'A', 'D', 'F♯', 'B'] },
    { id: '7-standard', name: 'Standard (7현)', ko: '7현 표준', midi: [35, 40, 45, 50, 55, 59, 64], notes: ['B', 'E', 'A', 'D', 'G', 'B', 'E'] },
    { id: '7-drop-a', name: 'Drop A (7현)', ko: '7현 드롭 A', midi: [33, 38, 43, 48, 53, 57, 62], notes: ['A', 'D', 'G', 'C', 'F', 'A', 'D'] },
    { id: 'bass-4', name: 'Bass Standard', ko: '베이스 표준', midi: [28, 33, 38, 43], notes: ['E', 'A', 'D', 'G'] },
    { id: 'bass-5', name: 'Bass Standard (5)', ko: '베이스 5현 표준', midi: [23, 28, 33, 38, 43], notes: ['B', 'E', 'A', 'D', 'G'] }
  ];

  function notesFromMidi(midiList) {
    return midiList.map(function (m) { return m == null ? '?' : SHARP[pcOf(m)]; });
  }

  /**
   * openMidi: [6번줄 … 1번줄] MIDI (카포 제외). 문자열 수는 트랙에 따라 4~7현.
   * 반환: { id, name, ko, notes, midi, standard, custom, alt }
   */
  function identify(openMidi) {
    const arr = (openMidi || []).map(function (m) { return (m == null || !isFinite(m)) ? null : Math.round(m); });
    if (!arr.length) {
      return { id: 'unknown', name: 'Standard', ko: '표준 튜닝', notes: ['E', 'A', 'D', 'G', 'B', 'E'],
        midi: [40, 45, 50, 55, 59, 64], standard: true, custom: false, alt: false };
    }
    let p = null;
    for (let i = 0; i < PRESETS.length; i++) {
      if (sameNumbers(PRESETS[i].midi, arr)) { p = PRESETS[i]; break; }
    }
    if (!p) {
      // 옥타브만 다른 같은 음정 배열도 같은 튜닝으로 본다
      for (let i = 0; i < PRESETS.length; i++) {
        if (samePitchClasses(PRESETS[i].midi, arr)) { p = PRESETS[i]; break; }
      }
    }
    if (p) {
      return {
        id: p.id, name: p.name, ko: p.ko, notes: p.notes.slice(), midi: arr,
        standard: p.id === 'standard', custom: false, alt: p.id !== 'standard'
      };
    }
    const notes = notesFromMidi(arr);
    return {
      id: 'custom', name: '커스텀 튜닝', ko: '커스텀 튜닝', notes: notes, midi: arr,
      standard: false, custom: true, alt: true
    };
  }

  function sameNumbers(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function samePitchClasses(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] == null || b[i] == null) return false;
      if (pcOf(a[i]) !== pcOf(b[i])) return false;
    }
    return true;
  }

  // "Standard · E A D G B E"
  function badgeText(info) {
    if (!info) return '';
    return info.name + ' · ' + info.notes.join(' ');
  }

  // 지판 왼쪽 줄 이름 (6번줄 → 1번줄 notes 를 받아 1번줄부터 쓰기 좋게)
  function labelFor(info, stringNumber) {
    if (!info) return '?';
    const n = info.notes.length;
    const idx = n - stringNumber;            // 6번줄 = notes[0]
    return info.notes[idx] == null ? '?' : info.notes[idx];
  }

  /** 트랙 모델에서 카포를 뺀 개방현 MIDI(6번줄→1번줄)를 만든다. */
  function openFromTrack(track) {
    if (!track || !track.tuning) return [40, 45, 50, 55, 59, 64];
    const capo = track.capo || 0;
    let count = track.stringCount || 0;
    if (!count) {
      count = 0;
      for (let s = 1; s <= 7; s++) if (track.tuning[s] != null) count = s;
    }
    const out = [];
    for (let s = count; s >= 1; s--) {
      const m = track.tuning[s];
      out.push(m == null ? null : m - capo);
    }
    return out;
  }

  global.Tunings = {
    PRESETS: PRESETS,
    SHARP: SHARP,
    FLAT: FLAT,
    identify: identify,
    badgeText: badgeText,
    labelFor: labelFor,
    openFromTrack: openFromTrack
  };
})(window);
