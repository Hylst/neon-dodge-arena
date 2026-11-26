/*
  Moteur audio procédural (Web Audio API)
  - Musique d'ambiance synthwave en boucle (basse + arpège + nappe)
  - Effets sonores générés (graze, slow-mo, niveau, game over, démarrage)
  Aucun fichier externe requis.
*/

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private step = 0;
  private started = false;

  musicEnabled = true;
  sfxEnabled = true;
  private tempo = 132; // BPM

  // Gammes/notes (Hz)
  private bassNotes = [55, 55, 73.42, 65.41]; // A1, A1, D2, C2
  private arpScales = [
    [220, 261.63, 329.63, 392], // Am add
    [220, 277.18, 329.63, 440],
    [196, 246.94, 293.66, 392],
    [174.61, 220, 261.63, 349.23],
  ];

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.0;
    this.musicGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.6;
    this.sfxGain.connect(this.master);
  }

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  }

  // ---- Musique ----
  startMusic() {
    this.resume();
    if (!this.ctx || this.started) return;
    this.started = true;
    if (this.musicGain) {
      this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicGain.gain.linearRampToValueAtTime(
        this.musicEnabled ? 0.28 : 0.0,
        this.ctx.currentTime + 2
      );
    }
    const stepMs = (60 / this.tempo / 4) * 1000 * 2; // doubles croches lentes
    const tick = () => {
      this.playStep();
      this.musicTimer = window.setTimeout(tick, stepMs);
    };
    tick();
  }

  setMusicLevel(level: number) {
    // augmente légèrement le tempo selon le niveau
    this.tempo = 132 + Math.min(level - 1, 8) * 4;
  }

  private playStep() {
    if (!this.ctx || !this.musicGain) return;
    const t = this.ctx.currentTime;
    const bar = Math.floor(this.step / 8) % 4;

    // Basse sur chaque temps
    if (this.step % 2 === 0) {
      const freq = this.bassNotes[bar];
      this.synth(freq, t, 0.32, "sawtooth", 0.22, 600, this.musicGain);
    }

    // Arpège
    const scale = this.arpScales[bar];
    const note = scale[this.step % scale.length];
    this.synth(note * 2, t, 0.22, "square", 0.07, 2200, this.musicGain);

    // Nappe toutes les 8 étapes
    if (this.step % 8 === 0) {
      this.pad(scale[0] * 2, t, 1.8, this.musicGain);
    }

    // Hi-hat synthétique
    if (this.step % 1 === 0) {
      this.noiseHit(t, 0.04, this.step % 4 === 2 ? 0.12 : 0.05);
    }

    this.step = (this.step + 1) % 32;
  }

  private synth(
    freq: number,
    t: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    cutoff: number,
    dest: AudioNode
  ) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private pad(freq: number, t: number, dur: number, dest: AudioNode) {
    if (!this.ctx) return;
    [0, 4, 7].forEach((semi) => {
      const f = freq * Math.pow(2, semi / 12);
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const filter = this.ctx!.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1400;
      osc.type = "sawtooth";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.035, t + 0.4);
      gain.gain.linearRampToValueAtTime(0.0001, t + dur);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(dest);
      osc.start(t);
      osc.stop(t + dur + 0.1);
    });
  }

  private noiseHit(t: number, dur: number, vol: number) {
    if (!this.ctx || !this.musicGain) return;
    const bufferSize = this.ctx.sampleRate * dur;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 7000;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    noise.start(t);
    noise.stop(t + dur);
  }

  stopMusic() {
    if (this.musicTimer !== null) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
    this.started = false;
  }

  toggleMusic() {
    this.musicEnabled = !this.musicEnabled;
    if (this.ctx && this.musicGain) {
      this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicGain.gain.linearRampToValueAtTime(
        this.musicEnabled ? 0.28 : 0.0,
        this.ctx.currentTime + 0.4
      );
    }
    return this.musicEnabled;
  }

  toggleSfx() {
    this.sfxEnabled = !this.sfxEnabled;
    if (this.sfxGain) this.sfxGain.gain.value = this.sfxEnabled ? 0.6 : 0.0;
    return this.sfxEnabled;
  }

  // ---- Effets sonores ----
  private blip(freq: number, dur: number, type: OscillatorType, vol = 0.5, slideTo?: number) {
    this.resume();
    if (!this.ctx || !this.sfxGain || !this.sfxEnabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  graze(combo: number) {
    const base = 600 + Math.min(combo, 30) * 30;
    this.blip(base, 0.08, "triangle", 0.25, base * 1.6);
  }

  slowOn() {
    this.blip(880, 0.3, "sine", 0.3, 220);
  }

  slowOff() {
    this.blip(220, 0.2, "sine", 0.2, 660);
  }

  levelUp() {
    this.blip(523.25, 0.12, "square", 0.3);
    setTimeout(() => this.blip(659.25, 0.12, "square", 0.3), 120);
    setTimeout(() => this.blip(783.99, 0.2, "square", 0.3), 240);
  }

  start() {
    this.blip(330, 0.1, "square", 0.3, 660);
    setTimeout(() => this.blip(660, 0.15, "square", 0.3, 990), 100);
  }

  gameOver() {
    this.resume();
    if (!this.ctx || !this.sfxGain || !this.sfxEnabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.9);
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1);
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1200;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 1.05);
  }

  hit() {
    this.blip(180, 0.15, "square", 0.3, 60);
  }
}

export const audio = new AudioEngine();
