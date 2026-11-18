// audio.js — every sound in Verano Bay is synthesized live with WebAudio:
// there are no audio files. An engine loop and a police siren loop bend with
// the action; one-shot voices cover gunfire, crashes, doors, pickups and the
// mission jingle. The context is built lazily on the first user gesture, and
// every entry point is safe to call before that (it simply stays silent).

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    return true;
  }

  function tone(freq, seconds, type, volume, slideTo) {
    if (muted || !ensure()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + seconds);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }

  function noise(seconds, volume, lowpass) {
    if (muted || !ensure()) return;
    const t = ctx.currentTime;
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(t);
  }

  function startEngine() {
    if (muted || !ensure() || engineOsc) return;
    engineOsc = ctx.createOscillator();
    engineGain = ctx.createGain();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineGain.gain.value = 0.0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    engineOsc.connect(filter).connect(engineGain).connect(ctx.destination);
    engineOsc.start();
  }

  function startSiren() {
    if (muted || !ensure() || sirenOsc) return;
    sirenOsc = ctx.createOscillator();
    sirenGain = ctx.createGain();
    sirenLfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 760;
    sirenLfo.frequency.value = 0.7;
    lfoGain.gain.value = 190;
    sirenLfo.connect(lfoGain).connect(sirenOsc.frequency);
    sirenGain.gain.value = 0.0;
    sirenOsc.connect(sirenGain).connect(ctx.destination);
    sirenOsc.start();
    sirenLfo.start();
  }

  return {
    unlock() { ensure(); },
    toggleMute() {
      muted = !muted;
      if (engineGain) engineGain.gain.value = 0;
      if (sirenGain) sirenGain.gain.value = 0;
      return muted;
    },
    get muted() { return muted; },
    // speedRatio 0..1 and throttle shape the engine note; silent on foot.
    engine(driving, speedRatio, throttle) {
      if (!driving) {
        if (engineGain) engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        return;
      }
      startEngine();
      if (!engineOsc) return;
      const t = ctx.currentTime;
      engineOsc.frequency.setTargetAtTime(52 + speedRatio * 130 + (throttle ? 14 : 0), t, 0.08);
      engineGain.gain.setTargetAtTime(muted ? 0 : 0.028 + speedRatio * 0.03, t, 0.1);
    },
    siren(active, distance01) {
      if (!active) {
        if (sirenGain && ctx) sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
        return;
      }
      startSiren();
      if (!sirenGain) return;
      sirenGain.gain.setTargetAtTime(muted ? 0 : 0.016 * (1 - distance01 * 0.7), ctx.currentTime, 0.2);
    },
    shot() { noise(0.11, 0.22, 2600); tone(160, 0.07, 'square', 0.1, 60); },
    guardShot() { noise(0.09, 0.13, 2000); },
    crash(hard) { noise(hard ? 0.3 : 0.16, hard ? 0.3 : 0.16, 900); tone(90, 0.18, 'sine', 0.16, 40); },
    door() { tone(210, 0.06, 'sine', 0.12, 120); noise(0.05, 0.06, 1200); },
    pickup() { tone(660, 0.09, 'sine', 0.14); setTimeout(() => tone(990, 0.12, 'sine', 0.14), 70); },
    cash() { tone(880, 0.07, 'triangle', 0.12); setTimeout(() => tone(1320, 0.1, 'triangle', 0.12), 55); },
    checkpoint() { tone(740, 0.08, 'sine', 0.13); setTimeout(() => tone(1108, 0.11, 'sine', 0.13), 60); },
    jingle() {
      if (muted || !ensure()) return;
      const notes = [523, 659, 784, 1046];
      notes.forEach((n, i) => setTimeout(() => tone(n, 0.16, 'triangle', 0.15), i * 95));
    },
    alarm() { tone(1180, 0.14, 'square', 0.07, 900); },
  };
}
