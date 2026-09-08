/**
 * Optional audio layer synthesized with WebAudio. No assets required; every
 * sound is a tiny procedural cue. Muted by default; toggle in the HUD.
 */
type Cue = 'click' | 'nav' | 'alert' | 'god' | 'cinematic' | 'reveal';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private enabled = false;
  private master: GainNode | null = null;
  private ambience: { osc: OscillatorNode; gain: GainNode; lfo: OscillatorNode } | null = null;

  setEnabled(v: boolean): void {
    this.enabled = v;
    if (v) { this.ensure(); this.startAmbience(); } else this.stopAmbience();
  }
  isEnabled(): boolean { return this.enabled; }

  private ensure(): AudioContext | null {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return this.ctx; }
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
    } catch { this.ctx = null; }
    return this.ctx;
  }

  private startAmbience(): void {
    const ctx = this.ensure(); if (!ctx || !this.master || this.ambience) return;
    const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 55;
    const gain = ctx.createGain(); gain.gain.value = 0.0;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain); lfoGain.connect(gain.gain);
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 220;
    osc.connect(filter); filter.connect(gain); gain.connect(this.master);
    osc.start(); lfo.start();
    gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 2);
    this.ambience = { osc, gain, lfo };
  }
  private stopAmbience(): void {
    if (!this.ambience || !this.ctx) return;
    const { osc, gain, lfo } = this.ambience;
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.5);
    setTimeout(() => { try { osc.stop(); lfo.stop(); } catch { /* */ } }, 600);
    this.ambience = null;
  }

  play(cue: Cue): void {
    if (!this.enabled) return;
    const ctx = this.ensure(); if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const tone = (freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slide?: number) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t + delay);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + delay + dur);
      g.gain.setValueAtTime(0, t + delay); g.gain.linearRampToValueAtTime(vol, t + delay + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
      o.connect(g); g.connect(this.master!); o.start(t + delay); o.stop(t + delay + dur + 0.05);
    };
    switch (cue) {
      case 'click': tone(1200, 0.05, 'square', 0.03); break;
      case 'nav': tone(660, 0.08, 'sine', 0.05); tone(990, 0.08, 'sine', 0.04, 0.05); break;
      case 'alert': tone(880, 0.12, 'triangle', 0.08); tone(660, 0.18, 'triangle', 0.08, 0.13); break;
      case 'god': tone(110, 1.4, 'sawtooth', 0.08, 0, 220); tone(220, 1.2, 'sine', 0.1, 0.1, 440); tone(1760, 0.4, 'sine', 0.04, 0.3); break;
      case 'cinematic': tone(55, 2.2, 'sine', 0.25, 0, 30); tone(82, 1.6, 'triangle', 0.08, 0.05); tone(440, 0.5, 'sine', 0.05, 0.4, 880); break;
      case 'reveal': for (let i = 0; i < 5; i++) tone(330 * Math.pow(1.5, i / 2), 0.6, 'sine', 0.05, i * 0.12); tone(55, 3, 'sine', 0.15, 0.2); break;
    }
  }
}

export const audio = new AudioEngine();
