/* 프렛 코치 — Web Audio 클린 기타 톤 (Karplus-Strong) */
(function (global) {
  'use strict';

  const Guitar = {
    ctx: null,
    master: null,
    comp: null,
    out: null,
    muted: false,
    buffers: new Map(),
    active: new Set(),

    init: function () {
      if (this.ctx) return;
      const AC = global.AudioContext || global.webkitAudioContext;
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 12;
      comp.ratio.value = 3;
      comp.attack.value = 0.003;
      comp.release.value = 0.18;

      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 5200;

      const body = this.ctx.createBiquadFilter();
      body.type = 'peaking';
      body.frequency.value = 190;
      body.Q.value = 1.1;
      body.gain.value = 3.5;

      const master = this.ctx.createGain();
      master.gain.value = 0.9;

      master.connect(body);
      body.connect(lp);
      lp.connect(comp);
      // 출력 게인 한 단계 — 원곡(유튜브)을 틀 때 앱 소리만 0으로 내리는 음소거가 여기서 걸린다
      const out = this.ctx.createGain();
      try { this.muted = global.localStorage.getItem('fc_mute') === '1'; } catch (e) { this.muted = false; }
      out.gain.value = this.muted ? 0 : 1;
      comp.connect(out);
      out.connect(this.ctx.destination);
      this.out = out;
      this.master = master;
      this.comp = comp;
    },

    setMuted: function (m) {
      this.muted = !!m;
      try { global.localStorage.setItem('fc_mute', this.muted ? '1' : '0'); } catch (e) { /* 저장 실패는 무시 */ }
      if (this.out) {
        const t = this.ctx.currentTime;
        this.out.gain.cancelScheduledValues(t);
        this.out.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.015);
      }
      return this.muted;
    },

    resume: function () {
      this.init();
      if (this.ctx.state === 'suspended') return this.ctx.resume();
      return Promise.resolve();
    },

    freqOf: function (midi) {
      return 440 * Math.pow(2, (midi - 69) / 12);
    },

    makeBuffer: function (midi) {
      const cached = this.buffers.get(midi);
      if (cached) return cached;
      const ctx = this.ctx;
      const sr = ctx.sampleRate;
      const freq = this.freqOf(midi);
      const dur = 2.4;
      const len = Math.floor(sr * dur);
      const N = Math.max(2, Math.round(sr / freq));
      const buf = ctx.createBuffer(1, len, sr);
      const out = buf.getChannelData(0);
      const ring = new Float32Array(N);

      // 피크 여기(noise burst) — 살짝 부드럽게
      let seed = ((midi * 2654435761) >>> 0) || 12345;
      const rnd = function () {
        seed ^= seed << 13; seed >>>= 0;
        seed ^= seed >> 17;
        seed ^= seed << 5; seed >>>= 0;
        return (seed / 4294967296) * 2 - 1;
      };
      let lp = 0;
      for (let i = 0; i < N; i++) {
        lp = lp * 0.35 + rnd() * 0.65;
        ring[i] = lp;
      }
      // DC 제거
      let mean = 0;
      for (let i = 0; i < N; i++) mean += ring[i];
      mean /= N;
      for (let i = 0; i < N; i++) ring[i] -= mean;

      const decay = 0.9976 + Math.min(0.0016, freq / 60000);
      let idx = 0;
      const fadeIn = Math.min(60, Math.floor(sr * 0.002));
      for (let i = 0; i < len; i++) {
        const a = ring[idx];
        const b = ring[idx + 1 === N ? 0 : idx + 1];
        const v = (a + b) * 0.5 * decay;
        ring[idx] = v;
        const t = i / len;
        const env = (i < fadeIn ? i / fadeIn : 1) * Math.pow(1 - t, 1.5);
        out[i] = a * env;
        idx = idx + 1;
        if (idx >= N) idx = 0;
      }
      this.buffers.set(midi, buf);
      return buf;
    },

    pluck: function (midi, when, durSec, gain) {
      if (!this.ctx) return;
      const buf = this.makeBuffer(midi);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      const level = Math.max(0.02, Math.min(0.9, gain == null ? 0.5 : gain));
      const hold = Math.max(0.45, Math.min(2.4, (durSec || 0.5) + 0.45));
      const stopAt = when + hold;
      g.gain.setValueAtTime(level, when);
      g.gain.setValueAtTime(level, Math.max(when + 0.02, stopAt - 0.08));
      g.gain.linearRampToValueAtTime(0.0001, stopAt);
      src.connect(g);
      g.connect(this.master);
      const self = this;
      src.onended = function () { self.active.delete(src); };
      this.active.add(src);
      src.start(when);
      src.stop(stopAt + 0.02);
    },

    chord: function (notes, when, durSec) {
      if (!notes || !notes.length) return;
      const base = 0.42 / Math.sqrt(notes.length);
      for (let i = 0; i < notes.length; i++) {
        this.pluck(notes[i].midi, when + i * 0.006, durSec, base);
      }
    },

    click: function (when, accent) {
      if (!this.ctx) return;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'square';
      o.frequency.value = accent ? 1500 : 1000;
      g.gain.setValueAtTime(accent ? 0.10 : 0.055, when);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
      o.connect(g);
      g.connect(this.out || this.ctx.destination);
      o.start(when);
      o.stop(when + 0.06);
    },

    stopAll: function () {
      this.active.forEach(function (src) {
        try { src.stop(); } catch (e) { /* ignore */ }
      });
      this.active.clear();
    }
  };

  global.Guitar = Guitar;
})(window);
