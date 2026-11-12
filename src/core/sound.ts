let ctx: AudioContext | null = null;
let enabled = true;

export function setSound(on: boolean) {
  enabled = on;
}

function audio() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function tick(final = false) {
  if (!enabled) return;
  try {
    const a = audio();
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = 'sine';
    o.frequency.value = final ? 1320 : 880;
    g.gain.setValueAtTime(0.0001, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, a.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + (final ? 0.22 : 0.12));
    o.connect(g).connect(a.destination);
    o.start();
    o.stop(a.currentTime + 0.25);
  } catch {
    /* áudio indisponível */
  }
}

export function shutter() {
  if (!enabled) return;
  try {
    const a = audio();
    const len = Math.floor(a.sampleRate * 0.09);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      d[i] = (Math.random() * 2 - 1) * (t < 0.18 ? 1 : Math.exp(-(t - 0.18) * 14)) * (i < len * 0.5 || i > len * 0.55 ? 1 : 0.2);
    }
    const src = a.createBufferSource();
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2400;
    f.Q.value = 0.8;
    const g = a.createGain();
    g.gain.value = 0.55;
    src.connect(f).connect(g).connect(a.destination);
    src.start();
  } catch {
    /* áudio indisponível */
  }
}
