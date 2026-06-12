import { useEffect, useRef } from "react";

/**
 * Drives --beat-pulse (0..1) on documentElement from audio element RMS.
 */
export function useBeatPulse(
  audioRef: React.RefObject<HTMLAudioElement | null>,
  enabled: boolean
) {
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!enabled || reduced) {
      document.documentElement.style.removeProperty("--beat-pulse");
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;

    let analyser: AnalyserNode;
    let source: MediaElementAudioSourceNode;
    try {
      const ctx = ctxRef.current ?? new AudioContext();
      ctxRef.current = ctx;
      if (ctx.state === "suspended") void ctx.resume();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source = ctx.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(ctx.destination);
    } catch {
      return;
    }

    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      if (audio.paused) {
        document.documentElement.style.setProperty("--beat-pulse", "0");
      } else {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        const n = Math.min(12, data.length);
        for (let i = 0; i < n; i++) sum += data[i];
        const level = Math.min(1, sum / (n * 180));
        document.documentElement.style.setProperty("--beat-pulse", String(level));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      document.documentElement.style.removeProperty("--beat-pulse");
      try {
        source.disconnect();
        analyser.disconnect();
      } catch {
        /* already disconnected */
      }
    };
  }, [audioRef, enabled]);
}
