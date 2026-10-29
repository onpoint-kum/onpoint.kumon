// Gerador de Efeitos Sonoros via Web Audio API (100% Offline, sem dependência de MP3)
class KumonAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Som suave de toque de interface
  playClick() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    } catch (e) {
      console.warn('Audio error', e);
    }
  }

  // Melodia acolhedora de ENTRADA (Check-in: Dó - Mi - Sol alegre)
  playCheckIn() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      const times = [0, 0.09, 0.18, 0.28];
      notes.forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime + times[i]);
        gain.gain.setValueAtTime(0, this.ctx.currentTime + times[i]);
        gain.gain.linearRampToValueAtTime(0.2, this.ctx.currentTime + times[i] + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + times[i] + 0.22);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(this.ctx.currentTime + times[i]);
        osc.stop(this.ctx.currentTime + times[i] + 0.25);
      });
    } catch (e) {
      console.warn('Audio error', e);
    }
  }

  // Fanfarra suave de SAÍDA / Missão cumprida (Sol - Lá - Si - Dó)
  playCheckOut() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const notes = [659.25, 783.99, 987.77, 1318.51]; // E5, G5, B5, E6
      const times = [0, 0.11, 0.22, 0.35];
      notes.forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime + times[i]);
        gain.gain.setValueAtTime(0, this.ctx.currentTime + times[i]);
        gain.gain.linearRampToValueAtTime(0.22, this.ctx.currentTime + times[i] + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + times[i] + (i === 3 ? 0.45 : 0.25));
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(this.ctx.currentTime + times[i]);
        osc.stop(this.ctx.currentTime + times[i] + (i === 3 ? 0.5 : 0.3));
      });
    } catch (e) {
      console.warn('Audio error', e);
    }
  }

  // Som suave de aviso/erro
  playAlert() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, this.ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(220, this.ctx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.22);
    } catch (e) {
      console.warn('Audio error', e);
    }
  }
}

window.kumonAudio = new KumonAudio();
