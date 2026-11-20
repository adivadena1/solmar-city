// Solmar — every sound is synthesized with WebAudio: no audio files, no
// network, just oscillators and filtered noise. The engine hum follows the
// car's speed, the siren wails when the police are near, and a quiet pad
// loop plays over the city until the player mutes it with M.

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this._engineOsc = null;
    this._engineGain = null;
    this._engineFilter = null;
    this._sirenOsc = null;
    this._sirenGain = null;
    this._sirenTimer = 0;
    this._musicTimer = 0;
    this._musicStep = 0;
    this._musicOn = false;
  }

  /** Must be called from a user gesture at least once. */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();

    // Engine: a sawtooth through a low-pass, pitched by speed.
    this._engineOsc = this.ctx.createOscillator();
    this._engineOsc.type = 'sawtooth';
    this._engineOsc.frequency.value = 55;
    this._engineFilter = this.ctx.createBiquadFilter();
    this._engineFilter.type = 'lowpass';
    this._engineFilter.frequency.value = 320;
    this._engineGain = this.ctx.createGain();
    this._engineGain.gain.value = 0;
    this._engineOsc.connect(this._engineFilter);
    this._engineFilter.connect(this._engineGain);
    this._engineGain.connect(this.ctx.destination);
    this._engineOsc.start();

    // Siren: one square wave, its pitch flipped twice a second.
    this._sirenOsc = this.ctx.createOscillator();
    this._sirenOsc.type = 'square';
    this._sirenOsc.frequency.value = 700;
    this._sirenGain = this.ctx.createGain();
    this._sirenGain.gain.value = 0;
    const sirenFilter = this.ctx.createBiquadFilter();
    sirenFilter.type = 'lowpass';
    sirenFilter.frequency.value = 1600;
    this._sirenOsc.connect(sirenFilter);
    sirenFilter.connect(this._sirenGain);
    this._sirenGain.connect(this.ctx.destination);
    this._sirenOsc.start();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.ctx) this.ctx.destination.gain ? null : null;
    if (this._engineGain) this._engineGain.gain.value = muted ? 0 : this._engineGain.gain.value;
    if (this._sirenGain) this._sirenGain.gain.value = 0;
  }

  /** speed 0..1, on true while the player drives. */
  engine(speed, on) {
    if (!this.ctx || this.muted) return;
    const target = on ? 0.045 + speed * 0.05 : 0;
    this._engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
    this._engineOsc.frequency.setTargetAtTime(50 + speed * 140, this.ctx.currentTime, 0.08);
  }

  /** Call every frame; `near` is true while a police car is close. */
  siren(dt, near) {
    if (!this.ctx) return;
    this._sirenTimer += dt;
    if (!near || this.muted) {
      this._sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
      return;
    }
    const high = Math.floor(this._sirenTimer * 2) % 2 === 0;
    this._sirenOsc.frequency.setTargetAtTime(high ? 880 : 660, this.ctx.currentTime, 0.05);
    this._sirenGain.gain.setTargetAtTime(0.035, this.ctx.currentTime, 0.2);
  }

  /** A short burst of filtered noise. */
  _noiseBurst(duration, frequency, volume, type = 'lowpass') {
    if (!this.ctx || this.muted) return;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    src.start();
  }

  /** A plain tone that slides from `from` to `to` over `duration` seconds. */
  _tone(from, to, duration, volume, type = 'sine', delay = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + duration);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  shot() {
    this._noiseBurst(0.14, 900, 0.5, 'highpass');
    this._tone(160, 50, 0.12, 0.35, 'sine');
  }

  punch() {
    this._noiseBurst(0.09, 300, 0.4);
  }

  crash() {
    this._noiseBurst(0.25, 500, 0.45);
    this._tone(120, 40, 0.25, 0.3, 'triangle');
  }

  chime() {
    this._tone(660, 660, 0.12, 0.16, 'sine');
    this._tone(990, 990, 0.2, 0.16, 'sine', 0.1);
  }

  missionDone() {
    [523, 659, 784, 1047].forEach((f, i) => this._tone(f, f, 0.22, 0.15, 'triangle', i * 0.11));
  }

  busted() {
    [392, 330, 262].forEach((f, i) => this._tone(f, f, 0.3, 0.16, 'sawtooth', i * 0.16));
  }

  /** A slow three-chord pad over the city; call every frame. */
  music(dt) {
    if (!this.ctx || this.muted) return;
    this._musicTimer += dt;
    if (this._musicTimer < 0.55) return;
    this._musicTimer = 0;
    // C major, A minor, F major, G major — one soft note per beat.
    const chords = [[261, 329, 392], [220, 261, 329], [174, 220, 261], [196, 246, 293]];
    const chord = chords[Math.floor(this._musicStep / 4) % chords.length];
    const note = chord[this._musicStep % 3];
    this._tone(note, note, 0.9, 0.035, 'sine');
    this._musicStep += 1;
    this._musicOn = true;
  }
}
