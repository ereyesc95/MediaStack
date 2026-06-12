import { useEffect, useRef } from "react";
import { getBeatAnalyser, resumeBeatAudioContext } from "./beatAudioGraph";

const DECAY_PER_FRAME = 0.88;
const BASELINE_LERP = 0.017;
const FLUX_BASELINE_LERP = 0.02;
const PEAK_DECAY = 0.996;
const ATTACK_LERP = 0.24;
const RELEASE_LERP = 0.17;
const DISPLAY_CAP = 0.82;
const OUTPUT_GAIN = 1.1;

function readRawLevels(data: Uint8Array) {
  let bassSum = 0;
  let bassPeak = 0;
  const bassBins = Math.min(10, data.length);
  for (let i = 0; i < bassBins; i++) {
    const v = data[i];
    bassSum += v;
    if (v > bassPeak) bassPeak = v;
  }
  const bassAvg = bassSum / (bassBins * 255);
  const bassPk = bassPeak / 255;

  let mixSum = 0;
  let mixPeak = 0;
  const mixBins = Math.min(48, data.length);
  for (let i = 0; i < mixBins; i++) {
    const v = data[i];
    mixSum += v;
    if (v > mixPeak) mixPeak = v;
  }
  const mixAvg = mixSum / (mixBins * 255);
  const mixPk = mixPeak / 255;

  const bass = Math.min(1, bassAvg * 0.88 + bassPk * 1.36);
  const pulse = Math.min(1, mixAvg * 0.82 + mixPk * 1.28);
  return { bass, pulse };
}

function spectralFlux(data: Uint8Array, prev: Uint8Array | null): number {
  if (!prev || prev.length !== data.length) return 0;
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const d = data[i] - prev[i];
    if (d > 0) sum += d;
  }
  return Math.min(1, sum / (data.length * 42));
}

function beatAboveBaseline(instant: number, baseline: number): number {
  const floor = baseline * 0.88;
  const headroom = Math.max(0.065, baseline * 0.38 + 0.045);
  const delta = Math.max(0, instant - floor);
  const norm = Math.min(1, delta / headroom);
  return Math.pow(norm, 0.82);
}

function sustainLevel(instant: number, baseline: number, peak: number): number {
  const peakRef = Math.max(0.14, peak);
  return Math.min(1, (baseline / (peakRef * 0.9)) * 0.5 + (instant / peakRef) * 0.5);
}

function combineBeatSignal(
  instant: number,
  prev: number,
  baseline: number,
  peak: number,
  flux: number,
  fluxBaseline: number
): number {
  const sustain = sustainLevel(instant, baseline, peak);
  const loud = sustain > 0.72 && peak > 0.5;

  const cappedBaseline = Math.min(baseline, peak * 0.82);
  const relative = beatAboveBaseline(instant, cappedBaseline);

  const frameFlux = Math.max(0, instant - prev);
  const fluxAbove = Math.max(0, flux - fluxBaseline * 0.85);
  const fluxScale = Math.max(0.05, peak * 0.15 + 0.03);
  const fluxBeat = Math.min(
    1,
    Math.max(frameFlux / fluxScale, fluxAbove / Math.max(0.06, peak * 0.18 + 0.03))
  );

  const peakBeat = Math.min(
    1,
    Math.max(0, instant - peak * 0.72) / Math.max(0.065, peak * 0.28 + 0.04)
  );

  let blended = loud
    ? Math.max(fluxBeat * 1.08, relative * 0.52, peakBeat * 0.28)
    : Math.max(relative * 0.78, fluxBeat * 0.88, peakBeat * 0.42);

  if (peak < 0.45) {
    blended = Math.min(1, blended * 1.1);
  } else if (loud && sustain > 0.8) {
    blended = Math.pow(blended, 1.2);
  }

  return Math.pow(Math.min(1, blended), 0.84);
}

function smoothToward(current: number, target: number, fastRelease = false): number {
  const lerp =
    target > current ? ATTACK_LERP : fastRelease ? RELEASE_LERP * 1.25 : RELEASE_LERP;
  return current + (target - current) * Math.min(1, lerp);
}

function decayValue(value: number) {
  const next = value * DECAY_PER_FRAME;
  return next < 0.006 ? 0 : next;
}

function writeBeatVars(root: HTMLElement, bass: number, pulse: number) {
  const boostedBass = Math.min(1, bass * OUTPUT_GAIN);
  const boostedPulse = Math.min(1, pulse * OUTPUT_GAIN);
  const strength = Math.min(
    DISPLAY_CAP,
    Math.max(
      boostedBass * 0.5 + boostedPulse * 0.6,
      boostedBass * 0.82,
      boostedPulse * 0.82
    )
  );
  root.style.setProperty("--beat-bass", String(boostedBass));
  root.style.setProperty("--beat-pulse", String(boostedPulse));
  root.style.setProperty("--beat-strength", String(strength));
}

function clearBeatVars(root: HTMLElement) {
  root.style.setProperty("--beat-bass", "0");
  root.style.setProperty("--beat-pulse", "0");
  root.style.setProperty("--beat-strength", "0");
}

let beatPulseConsumers = 0;

/**
 * Drives beat CSS vars from audio. `active` keeps the layer mounted (smooth fade);
 * `playing` mirrors transport state for CSS; analysis uses the audio element directly.
 */
export function useBeatPulse(
  audioRef: React.RefObject<HTMLAudioElement | null>,
  active: boolean,
  playing: boolean
) {
  const analyserRef = useRef<AnalyserNode | null>(null);
  const wiredAudioRef = useRef<HTMLMediaElement | null>(null);
  const rafRef = useRef<number>(0);
  const bassBaselineRef = useRef(0);
  const pulseBaselineRef = useRef(0);
  const fluxBaselineRef = useRef(0);
  const bassPeakRef = useRef(0);
  const pulsePeakRef = useRef(0);
  const prevBassRef = useRef(0);
  const prevPulseRef = useRef(0);
  const prevSpectrumRef = useRef<Uint8Array | null>(null);
  const bassOutRef = useRef(0);
  const pulseOutRef = useRef(0);
  const consumerRef = useRef(false);
  const activeRef = useRef(active);
  const playingRef = useRef(playing);
  const lastWrittenRef = useRef({ bass: -1, pulse: -1 });

  activeRef.current = active;
  playingRef.current = playing;

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const root = document.documentElement;
    let cancelled = false;

    const ensureAnalyser = () => {
      const audio = audioRef.current;
      if (!audio) return null;
      if (wiredAudioRef.current !== audio) {
        wiredAudioRef.current = audio;
        bassBaselineRef.current = 0;
        pulseBaselineRef.current = 0;
        fluxBaselineRef.current = 0;
        bassPeakRef.current = 0;
        pulsePeakRef.current = 0;
        prevBassRef.current = 0;
        prevPulseRef.current = 0;
        prevSpectrumRef.current = null;
        analyserRef.current = null;
      }
      if (!analyserRef.current) {
        analyserRef.current = getBeatAnalyser(audio);
      }
      return analyserRef.current;
    };

    const onAudioActivity = () => {
      resumeBeatAudioContext();
      ensureAnalyser();
    };

    const attachAudioListeners = (audio: HTMLMediaElement) => {
      audio.addEventListener("play", onAudioActivity);
      audio.addEventListener("seeking", onAudioActivity);
      audio.addEventListener("seeked", onAudioActivity);
      return () => {
        audio.removeEventListener("play", onAudioActivity);
        audio.removeEventListener("seeking", onAudioActivity);
        audio.removeEventListener("seeked", onAudioActivity);
      };
    };

    let detachAudioListeners: (() => void) | null = null;
    let watchedAudio: HTMLMediaElement | null = null;

    const syncAudioListeners = () => {
      const audio = audioRef.current;
      if (audio === watchedAudio) return;
      detachAudioListeners?.();
      detachAudioListeners = null;
      watchedAudio = audio;
      if (audio) {
        detachAudioListeners = attachAudioListeners(audio);
        ensureAnalyser();
      }
    };

    const tick = () => {
      if (cancelled) return;

      syncAudioListeners();
      resumeBeatAudioContext();

      const isActive = activeRef.current && !reduced;

      if (!isActive) {
        if (consumerRef.current) {
          consumerRef.current = false;
          beatPulseConsumers = Math.max(0, beatPulseConsumers - 1);
        }
        bassOutRef.current = decayValue(bassOutRef.current);
        pulseOutRef.current = decayValue(pulseOutRef.current);
        if (beatPulseConsumers === 0) {
          if (bassOutRef.current > 0 || pulseOutRef.current > 0) {
            writeBeatVars(root, bassOutRef.current, pulseOutRef.current);
          } else {
            clearBeatVars(root);
          }
        }
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      if (!consumerRef.current) {
        consumerRef.current = true;
        beatPulseConsumers += 1;
      }

      const audio = audioRef.current;
      const analyser = ensureAnalyser();
      const isPlaying = Boolean(
        audio && !audio.paused && !audio.ended && audio.readyState >= 2
      );

      if (isPlaying && analyser) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const { bass, pulse } = readRawLevels(data);
        const flux = spectralFlux(data, prevSpectrumRef.current);
        prevSpectrumRef.current = new Uint8Array(data);

        bassPeakRef.current = Math.max(bass, bassPeakRef.current * PEAK_DECAY);
        pulsePeakRef.current = Math.max(pulse, pulsePeakRef.current * PEAK_DECAY);

        bassBaselineRef.current +=
          (bass - bassBaselineRef.current) * BASELINE_LERP;
        pulseBaselineRef.current +=
          (pulse - pulseBaselineRef.current) * BASELINE_LERP;
        fluxBaselineRef.current +=
          (flux - fluxBaselineRef.current) * FLUX_BASELINE_LERP;

        const bassSustain = sustainLevel(
          bass,
          bassBaselineRef.current,
          bassPeakRef.current
        );
        const pulseSustain = sustainLevel(
          pulse,
          pulseBaselineRef.current,
          pulsePeakRef.current
        );
        const fastRelease = bassSustain > 0.68 || pulseSustain > 0.68;

        const bassTarget = combineBeatSignal(
          bass,
          prevBassRef.current,
          bassBaselineRef.current,
          bassPeakRef.current,
          flux,
          fluxBaselineRef.current
        );
        const pulseTarget = combineBeatSignal(
          pulse,
          prevPulseRef.current,
          pulseBaselineRef.current,
          pulsePeakRef.current,
          flux * 0.92,
          fluxBaselineRef.current
        );

        prevBassRef.current = bass;
        prevPulseRef.current = pulse;

        bassOutRef.current = smoothToward(
          bassOutRef.current,
          bassTarget,
          fastRelease
        );
        pulseOutRef.current = smoothToward(
          pulseOutRef.current,
          pulseTarget,
          fastRelease
        );
      } else {
        bassOutRef.current = decayValue(bassOutRef.current);
        pulseOutRef.current = decayValue(pulseOutRef.current);
      }

      const bass = bassOutRef.current;
      const pulse = pulseOutRef.current;
      const last = lastWrittenRef.current;
      const changed =
        Math.abs(bass - last.bass) >= 0.01 ||
        Math.abs(pulse - last.pulse) >= 0.01;
      const settling =
        bass < 0.01 &&
        pulse < 0.01 &&
        (last.bass >= 0.01 || last.pulse >= 0.01);
      if (changed || settling) {
        lastWrittenRef.current = { bass, pulse };
        writeBeatVars(root, bass, pulse);
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      detachAudioListeners?.();
      if (consumerRef.current) {
        consumerRef.current = false;
        beatPulseConsumers = Math.max(0, beatPulseConsumers - 1);
      }
      if (beatPulseConsumers === 0) {
        clearBeatVars(root);
      }
    };
  }, [audioRef]);
}
