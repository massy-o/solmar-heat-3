// SOLMAR HEAT - tiny WebAudio synth. No audio files: every sound is
// an oscillator or a filtered noise burst shaped in code.

export class SoundKit {
  constructor() {
    this.ctx = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenFlip = null;
  }

  // Browsers only allow audio after a gesture; main calls this on Start.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  // Continuous engine hum whose pitch follows the car's speed.
  engine(on, speedRatio) {
    if (!this.ctx) return;
    if (on && !this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this.engineOsc.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
    }
    if (this.engineOsc) {
      const t = this.ctx.currentTime;
      if (on) {
        this.engineOsc.frequency.setTargetAtTime(55 + speedRatio * 165, t, 0.08);
        this.engineGain.gain.setTargetAtTime(0.05 + speedRatio * 0.06, t, 0.1);
      } else {
        this.engineGain.gain.setTargetAtTime(0.0, t, 0.1);
      }
    }
  }

  // Two-tone police siren, audible while a cruiser is close.
  siren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      let high = false;
      this.sirenFlip = window.setInterval(() => {
        if (!this.sirenOsc) return;
        high = !high;
        this.sirenOsc.frequency.value = high ? 880 : 660;
      }, 380);
    }
    if (this.sirenOsc) {
      this.sirenGain.gain.setTargetAtTime(on ? 0.035 : 0.0, this.ctx.currentTime, 0.2);
      if (!on && this.sirenFlip) {
        window.clearInterval(this.sirenFlip);
        this.sirenFlip = null;
        const osc = this.sirenOsc;
        window.setTimeout(() => { try { osc.stop(); } catch (e) { /* already stopped */ } }, 400);
        this.sirenOsc = null;
      }
    }
  }

  // Short square blip for checkpoints and pickups.
  blip(freq = 740) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.setValueAtTime(freq * 1.5, t + 0.09);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.24);
  }

  // Low noise thud for crashes.
  thud(strength = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * 0.18);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    const gain = this.ctx.createGain();
    gain.gain.value = Math.min(0.5, 0.18 * strength);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  // Cash register-ish arpeggio when a mission pays out.
  payday() {
    if (!this.ctx) return;
    [660, 880, 990, 1320].forEach((f, i) => {
      window.setTimeout(() => this.blip(f), i * 90);
    });
  }
}
