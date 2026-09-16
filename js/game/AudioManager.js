// AudioManager.js
// All sound effects are synthesized with the Web Audio API so the game has
// zero external audio dependencies. Swap in real files under
// /assets/audio/ later by loading buffers in place of the oscillator calls.
import { isSoundEnabled } from '../leaderboard.js';

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.enabled = isSoundEnabled();
    this.master = null;
    this.ambientNodes = null;
  }

  _ensureContext() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
  }

  /** Must be called from a user gesture (click) to satisfy autoplay policy. */
  unlock() {
    this._ensureContext();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (this.ambientNodes) this.ambientNodes.gain.gain.value = enabled ? this.ambientNodes.targetGain : 0;
  }

  _tone({ freq = 440, duration = 0.12, type = 'square', gain = 0.5, freqEnd = null, delay = 0 }) {
    if (!this.enabled) return;
    this._ensureContext();
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t0 + duration);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  _noise({ duration = 0.15, gain = 0.4, delay = 0, filterFreq = null }) {
    if (!this.enabled) return;
    this._ensureContext();
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    let node = src;
    if (filterFreq) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      node.connect(filter);
      node = filter;
    }
    node.connect(g).connect(this.master);
    src.start(t0);
  }

  shoot(weaponKind = 'pulse') {
    if (weaponKind === 'hellfire') {
      this._tone({ freq: 180, freqEnd: 40, duration: 0.35, type: 'sawtooth', gain: 0.6 });
      this._noise({ duration: 0.3, gain: 0.5 });
    } else if (weaponKind === 'void') {
      this._tone({ freq: 900, freqEnd: 200, duration: 0.14, type: 'sine', gain: 0.4 });
    } else {
      this._tone({ freq: 620, freqEnd: 180, duration: 0.09, type: 'square', gain: 0.35 });
    }
  }

  reload() { this._tone({ freq: 300, duration: 0.08, type: 'triangle', gain: 0.25, delay: 0 }); this._tone({ freq: 420, duration: 0.1, type: 'triangle', gain: 0.25, delay: 0.15 }); }
  hitEnemy() { this._tone({ freq: 900, freqEnd: 500, duration: 0.08, type: 'triangle', gain: 0.3 }); }
  headshot() { this._tone({ freq: 1400, freqEnd: 700, duration: 0.1, type: 'triangle', gain: 0.4 }); }
  enemyDeath() { this._noise({ duration: 0.25, gain: 0.4 }); this._tone({ freq: 150, freqEnd: 40, duration: 0.3, type: 'sawtooth', gain: 0.3 }); }
  playerHurt() { this._tone({ freq: 140, freqEnd: 60, duration: 0.2, type: 'sawtooth', gain: 0.45 }); }
  pickup() { this._tone({ freq: 500, freqEnd: 900, duration: 0.15, type: 'sine', gain: 0.3 }); }
  jump() { this._tone({ freq: 300, freqEnd: 500, duration: 0.1, type: 'sine', gain: 0.2 }); }
  waveStart() { this._tone({ freq: 200, duration: 0.4, type: 'sawtooth', gain: 0.3, delay: 0 }); this._tone({ freq: 260, duration: 0.4, type: 'sawtooth', gain: 0.3, delay: 0.15 }); }
  enemySpawn() { this._tone({ freq: 90, freqEnd: 220, duration: 0.3, type: 'sine', gain: 0.28 }); this._noise({ duration: 0.12, gain: 0.15 }); }
  death() { this._tone({ freq: 220, freqEnd: 40, duration: 0.9, type: 'sawtooth', gain: 0.5 }); }
  menuClick() { this._tone({ freq: 520, duration: 0.06, type: 'triangle', gain: 0.2 }); }
  wallImpact() { this._noise({ duration: 0.08, gain: 0.2, filterFreq: 1800 }); }
  shellTink() { this._tone({ freq: 1800 + Math.random() * 600, duration: 0.05, type: 'triangle', gain: 0.06 }); }

  /** A low, irregular growl — pitch/duration vary so a room full of enemies doesn't sound robotic. */
  growl(distanceFactor = 1) {
    const base = 55 + Math.random() * 30;
    this._tone({ freq: base, freqEnd: base * 0.6, duration: 0.5 + Math.random() * 0.4, type: 'sawtooth', gain: 0.22 * distanceFactor });
    this._noise({ duration: 0.3, gain: 0.08 * distanceFactor, filterFreq: 400 });
  }

  footstep(kind = 'player') {
    const freq = kind === 'player' ? 140 : 90;
    this._noise({ duration: 0.07, gain: kind === 'player' ? 0.12 : 0.16, filterFreq: freq });
  }

  /** A quiet, looping drone + occasional metallic clank, for facility ambience. */
  startAmbience() {
    this._ensureContext();
    if (!this.ctx || this.ambientNodes) return;

    const gain = this.ctx.createGain();
    gain.gain.value = this.enabled ? 0.05 : 0;
    gain.connect(this.master);

    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 42;
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 63;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain).connect(gain.gain);

    osc1.connect(gain);
    osc2.connect(gain);
    osc1.start();
    osc2.start();
    lfo.start();

    this.ambientNodes = { gain, osc1, osc2, lfo, targetGain: 0.05 };

    this._scheduleClank();
  }

  _scheduleClank() {
    if (!this.ambientNodes) return;
    const delay = 8 + Math.random() * 14;
    setTimeout(() => {
      if (!this.ambientNodes) return;
      this._noise({ duration: 0.4, gain: 0.06, filterFreq: 500 });
      this._scheduleClank();
    }, delay * 1000);
  }

  stopAmbience() {
    if (!this.ambientNodes) return;
    try {
      this.ambientNodes.osc1.stop();
      this.ambientNodes.osc2.stop();
      this.ambientNodes.lfo.stop();
    } catch (err) { /* already stopped */ }
    this.ambientNodes = null;
  }
}
