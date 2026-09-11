// Web Audio API Sound Synthesizer & Procedural Arcade Synthwave BGM
// 100% Mandiri, 0 byte file eksternal, anti 404, mendukung mobile & desktop
class SoundManager {
  private ctx: AudioContext | null = null;
  public sfxEnabled: boolean = true;
  public bgmEnabled: boolean = true;
  private isBgmPlaying: boolean = false;
  private bgmTimer: number | null = null;
  private currentStep: number = 0;
  private tempo: number = 130; // BPM
  private bgmGain: GainNode | null = null;

  private initCtx() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
        this.bgmGain = this.ctx.createGain();
        this.bgmGain.gain.setValueAtTime(0.12, this.ctx.currentTime);
        this.bgmGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  public unlockAudio() {
    this.initCtx();
    if (!this.ctx) return;

    if (this.ctx.state === "suspended") {
      this.ctx.resume().then(() => {
        console.log("[Audio] AudioContext aktif untuk smartphone!");
      });
    }

    try {
      const buffer = this.ctx.createBuffer(1, 1, 22050);
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.ctx.destination);
      source.start(0);
    } catch (e) {}
  }

  // ==========================================
  // 🎵 PROCEDURAL RETRO SYNTHWAVE BGM ENGINE
  // ==========================================
  startBgm() {
    if (this.isBgmPlaying || !this.bgmEnabled) return;
    this.initCtx();
    if (!this.ctx) return;

    this.isBgmPlaying = true;
    this.currentStep = 0;
    const stepDurationMs = (60 / this.tempo / 4) * 1000; // 16th note

    this.bgmTimer = window.setInterval(() => {
      if (!this.isBgmPlaying || !this.ctx) return;
      this.playBgmStep(this.currentStep);
      this.currentStep = (this.currentStep + 1) % 32; // 2 bar loop
    }, stepDurationMs);
  }

  stopBgm() {
    this.isBgmPlaying = false;
    if (this.bgmTimer !== null) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  toggleBgm(): boolean {
    this.bgmEnabled = !this.bgmEnabled;
    if (this.bgmEnabled) {
      this.startBgm();
    } else {
      this.stopBgm();
    }
    return this.bgmEnabled;
  }

  toggleSfx(): boolean {
    this.sfxEnabled = !this.sfxEnabled;
    return this.sfxEnabled;
  }

  private playBgmStep(step: number) {
    if (!this.ctx || !this.bgmGain) return;
    const now = this.ctx.currentTime;

    // 1. Kick Drum (pada ketukan 0, 4, 8, 12, 16, 20, 24, 28)
    if (step % 4 === 0) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.09);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain);
      gain.connect(this.bgmGain);
      osc.start(now);
      osc.stop(now + 0.09);
    }

    // 2. Hi-Hat (pada ketukan ganjil 2, 6, 10, 14, ...)
    if (step % 2 === 1) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(6000, now);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.connect(gain);
      gain.connect(this.bgmGain);
      osc.start(now);
      osc.stop(now + 0.04);
    }

    // 3. Cyber Bassline (A minor / Corporate Cyberpunk Scale)
    // A1 = 55, C2 = 65.41, D2 = 73.42, E2 = 82.41, G1 = 49
    const bassNotes = [
      55, 55, 110, 55, 65.41, 55, 73.42, 82.41,
      55, 55, 110, 55, 65.41, 73.42, 55, 49,
      55, 55, 110, 55, 65.41, 55, 73.42, 82.41,
      98, 82.41, 73.42, 65.41, 55, 49, 55, 110
    ];
    const bassFreq = bassNotes[step] || 55;

    const bassOsc = this.ctx.createOscillator();
    const bassGain = this.ctx.createGain();
    bassOsc.type = "sawtooth";
    bassOsc.frequency.setValueAtTime(bassFreq, now);

    // Low-pass filter untuk punchy synth bass
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(650, now);

    bassGain.gain.setValueAtTime(0.22, now);
    bassGain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);

    bassOsc.connect(filter);
    filter.connect(bassGain);
    bassGain.connect(this.bgmGain);

    bassOsc.start(now);
    bassOsc.stop(now + 0.14);

    // 4. Arpeggiator Lead Melody (setiap 2 step)
    if (step % 2 === 0) {
      const leadNotes = [
        440, 523.25, 659.25, 783.99, 880, 783.99, 659.25, 523.25,
        440, 587.33, 659.25, 880, 987.77, 880, 659.25, 587.33
      ];
      const leadFreq = leadNotes[(step / 2) % leadNotes.length];

      const leadOsc = this.ctx.createOscillator();
      const leadGain = this.ctx.createGain();
      leadOsc.type = "square";
      leadOsc.frequency.setValueAtTime(leadFreq, now);

      leadGain.gain.setValueAtTime(0.07, now);
      leadGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

      leadOsc.connect(leadGain);
      leadGain.connect(this.bgmGain);
      leadOsc.start(now);
      leadOsc.stop(now + 0.11);
    }
  }

  // ==========================================
  // 🔊 SOUND EFFECTS (SFX)
  // ==========================================
  playLaser() {
    if (!this.sfxEnabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(950, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.11);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.11);
  }

  playEnemyLaser() {
    if (!this.sfxEnabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.16);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.16);
  }

  playExplosion(isBig: boolean = false) {
    if (!this.sfxEnabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const duration = isBig ? 0.45 : 0.32;

    // 1. Noise Burst (Ledakan Dentuman Debu & Api)
    try {
      const bufferSize = Math.floor(this.ctx.sampleRate * duration);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(isBig ? 900 : 700, now);
      filter.frequency.exponentialRampToValueAtTime(80, now + duration);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(isBig ? 0.45 : 0.32, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);

      noise.start(now);
      noise.stop(now + duration);
    } catch (e) {}

    // 2. Deep Sub-Bass Rumble (Gelombang Dentuman Rendah)
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(isBig ? 240 : 180, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + duration);

    gain.gain.setValueAtTime(isBig ? 0.4 : 0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  playCoin(value: number) {
    if (!this.sfxEnabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sine";
    if (value === 25) {
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.12);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.18);
    } else if (value === 50) {
      osc.frequency.setValueAtTime(659.25, now);
      osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.18);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    } else {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.15);
      osc.frequency.exponentialRampToValueAtTime(1760.0, now + 0.35);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
    }
  }

  playHit() {
    if (!this.sfxEnabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.35);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.35);
  }

  playGameOver() {
    if (!this.sfxEnabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const noteTime = now + idx * 0.12;

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.25, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(noteTime);
      osc.stop(noteTime + 0.35);
    });
  }
}

export const sounds = new SoundManager();
