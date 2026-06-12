/** Shared Web Audio graph so beat analysis survives seek, era changes, and re-renders. */

let sharedCtx: AudioContext | null = null;
const analysers = new WeakMap<HTMLMediaElement, AnalyserNode>();

function ensureContext(): AudioContext {
  if (!sharedCtx || sharedCtx.state === "closed") {
    sharedCtx = new AudioContext();
  }
  return sharedCtx;
}

export function resumeBeatAudioContext(): void {
  const ctx = sharedCtx;
  if (ctx && ctx.state === "suspended") {
    void ctx.resume();
  }
}

export function getBeatAnalyser(audio: HTMLMediaElement): AnalyserNode | null {
  const existing = analysers.get(audio);
  if (existing) {
    resumeBeatAudioContext();
    return existing;
  }

  try {
    const ctx = ensureContext();
    resumeBeatAudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.3;
    const source = ctx.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(ctx.destination);
    analysers.set(audio, analyser);
    return analyser;
  } catch {
    return null;
  }
}

export function releaseBeatAnalyser(audio: HTMLMediaElement | null): void {
  if (audio) analysers.delete(audio);
}
