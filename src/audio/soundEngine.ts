/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Web Audio API Synthesizer for RTS sound effects and ambient tension music

class SoundEngine {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private isMuted: boolean = false;
  private musicOscillators: (OscillatorNode | GainNode)[] = [];
  private isMusicPlaying: boolean = false;
  private musicInterval: number | null = null;

  constructor() {
    // AudioContext will be initialized on first user gesture
  }

  public init() {
    if (this.ctx) return;
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioContextClass();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.8, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(0.85, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
      this.musicGain.connect(this.masterGain);
    } catch {
      // Audio not supported in environment
    }
  }

  public resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private masterVol: number = 0.8;
  private sfxVol: number = 0.85;
  private musicVol: number = 0.35;

  public getMasterVolume(): number {
    return this.masterVol;
  }

  public getSfxVolume(): number {
    return this.sfxVol;
  }

  public getMusicVolume(): number {
    return this.musicVol;
  }

  public setMasterVolume(v: number) {
    this.masterVol = v;
    if (this.masterGain && this.ctx && !this.isMuted) {
      this.masterGain.gain.setValueAtTime(v, this.ctx.currentTime);
    }
  }

  public setSfxVolume(v: number) {
    this.sfxVol = v;
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setValueAtTime(v, this.ctx.currentTime);
    }
  }

  public setMusicVolume(v: number) {
    this.musicVol = v;
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setValueAtTime(v, this.ctx.currentTime);
    }
  }

  public setVolumes(master: number, sfx: number, music: number) {
    this.masterVol = master;
    this.sfxVol = sfx;
    this.musicVol = music;
    if (!this.ctx) return;
    if (this.masterGain && !this.isMuted) this.masterGain.gain.setValueAtTime(master, this.ctx.currentTime);
    if (this.sfxGain) this.sfxGain.gain.setValueAtTime(sfx, this.ctx.currentTime);
    if (this.musicGain) this.musicGain.gain.setValueAtTime(music, this.ctx.currentTime);
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.masterVol, this.ctx.currentTime);
    }
    return this.isMuted;
  }

  // --- Sound Effects ---

  // Tactical click / UI button
  public playClick() {
    if (this.isMuted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.05);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  // Error / Invalid action buzzer
  public playError() {
    if (this.isMuted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.setValueAtTime(100, now + 0.08);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.16);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  // Unit selected acknowledgment radio chirp
  public playSelectUnit() {
    if (this.isMuted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.setValueAtTime(880, now + 0.04); // A5

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  // Command given (Move/Attack) affirmative radio pulse
  public playCommandAffirmative() {
    if (this.isMuted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'triangle';
    osc2.type = 'sine';

    osc1.frequency.setValueAtTime(440, now);
    osc1.frequency.setValueAtTime(659.25, now + 0.06);

    osc2.frequency.setValueAtTime(220, now);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.sfxGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.14);
    osc2.stop(now + 0.14);
  }

  // Building placement sound (hydraulic stamp)
  public playBuildPlace() {
    if (this.isMuted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.18);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  // Construction or Unit Complete Fanfare
  public playComplete() {
    if (this.isMuted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = now + idx * 0.07;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.18);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.18);
    });
  }

  // Gunfire / Rifle burst
  public playRifleShot() {
    if (this.isMuted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    // Fast noise burst
    const bufferSize = this.ctx.sampleRate * 0.07;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.Q.setValueAtTime(3.0, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.07);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    noise.start(now);
    noise.stop(now + 0.07);
  }

  // Tank Cannon firing (heavy blast)
  public playCannonShot() {
    if (this.isMuted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.35);

    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

    // Add noise impact
    const bufferSize = this.ctx.sampleRate * 0.2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.4, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    noise.connect(noiseGain);
    noiseGain.connect(this.sfxGain);

    osc.start(now);
    noise.start(now);
    osc.stop(now + 0.35);
    noise.stop(now + 0.25);
  }

  // Missile whoosh launch
  public playMissileLaunch() {
    if (this.isMuted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(750, now + 0.28);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  // Explosion effect
  public playExplosion(isLarge: boolean = false) {
    if (this.isMuted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const duration = isLarge ? 0.7 : 0.4;

    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(isLarge ? 350 : 500, now);
    filter.frequency.exponentialRampToValueAtTime(80, now + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(isLarge ? 0.6 : 0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    noise.start(now);
    noise.stop(now + duration);
  }

  // Alert alarm (Base Under Attack)
  public playAlarm() {
    if (this.isMuted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    for (let i = 0; i < 2; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = now + i * 0.18;

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(700, t);
      osc.frequency.setValueAtTime(550, t + 0.08);

      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.16);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.16);
    }
  }

  // Tactical Radar Threat Alert
  public playThreatWarning(level: 'YELLOW' | 'ORANGE' | 'RED') {
    if (this.isMuted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    if (level === 'YELLOW') {
      // Subdued sonar ping
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.22);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.22);
    } else if (level === 'ORANGE') {
      // Urgent double beep warning
      for (let i = 0; i < 2; i++) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const t = now + i * 0.12;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(950, t);
        osc.frequency.setValueAtTime(800, t + 0.05);
        gain.gain.setValueAtTime(0.24, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.09);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.09);
      }
    } else {
      // RED: Full base alarm siren
      this.playAlarm();
    }
  }

  // Ambient Military Tension Music Generator
  public startAmbientMusic() {
    if (this.isMusicPlaying || !this.ctx || !this.musicGain) return;
    this.isMusicPlaying = true;

    const chordTones = [
      [110, 164.81, 220],     // A2 minor
      [98, 146.83, 196],      // G2
      [87.31, 130.81, 174.61], // F2
      [82.41, 123.47, 164.81], // E2
    ];
    let step = 0;

    const playChord = () => {
      if (!this.ctx || !this.musicGain || !this.isMusicPlaying) return;
      const now = this.ctx.currentTime;
      const freqs = chordTones[step % chordTones.length];
      step++;

      freqs.forEach(freq => {
        if (!this.ctx || !this.musicGain) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(260, now);
        filter.Q.setValueAtTime(4, now);

        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.06, now + 1.2);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 4.5);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.musicGain);

        osc.start(now);
        osc.stop(now + 4.6);
      });
    };

    playChord();
    this.musicInterval = window.setInterval(playChord, 4500);
  }

  public stopAmbientMusic() {
    this.isMusicPlaying = false;
    if (this.musicInterval !== null) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
  }
}

export const soundEngine = new SoundEngine();
