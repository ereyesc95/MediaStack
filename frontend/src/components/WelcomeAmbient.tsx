import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  fetchWelcomeAmbientPhotocards,
  type WelcomeAmbientPhotocard,
} from "../api";

const STORAGE_KEY = "mystack.welcomeAmbient";

type Mode = "portrait" | "landscape";

type Particle = {
  key: string;
  card: WelcomeAmbientPhotocard;
  depth: 0 | 1 | 2;
  size: number;
  lane: number;
  durationSec: number;
  delaySec: number;
  flipEverySec: number;
  flipDelaySec: number;
};

function nextMode(prev: Mode | null): Mode {
  return prev === "portrait" ? "landscape" : "portrait";
}

function readLastMode(): Mode | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "portrait" || raw === "landscape") return raw;
  } catch {
    /* ignore */
  }
  return null;
}

function writeLastMode(mode: Mode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

function concurrentForTotal(total: number, mode: Mode): number {
  const max = mode === "landscape" ? 16 : 20;
  if (total <= 0) return 0;
  if (total <= 4) return Math.min(Math.max(total, 3), 6);
  return Math.min(max, 4 + Math.floor(Math.sqrt(total) * 2));
}

function buildParticles(
  items: WelcomeAmbientPhotocard[],
  mode: Mode,
  total: number
): Particle[] {
  const count = concurrentForTotal(total, mode);
  if (!items.length || count <= 0) return [];
  const pool = [...items];
  const out: Particle[] = [];
  for (let i = 0; i < count; i += 1) {
    const card = pool[i % pool.length];
    const depth = (i % 3) as 0 | 1 | 2;
    const size =
      mode === "portrait"
        ? depth === 2
          ? 118
          : depth === 1
            ? 88
            : 64
        : depth === 2
          ? 150
          : depth === 1
            ? 112
            : 84;
    out.push({
      key: `${card.id}-${i}`,
      card,
      depth,
      size,
      lane: Math.random(),
      durationSec:
        mode === "portrait"
          ? 18 + Math.random() * 16 + depth * 4
          : 22 + Math.random() * 18 + depth * 5,
      delaySec: -Math.random() * 20,
      flipEverySec: 7 + Math.random() * 6,
      flipDelaySec: 2 + Math.random() * 8,
    });
  }
  return out;
}

function AmbientCard({
  particle,
  mode,
}: {
  particle: Particle;
  mode: Mode;
}) {
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    let intervalId: number | undefined;
    const start = window.setTimeout(() => {
      setFlipped((v) => !v);
      intervalId = window.setInterval(() => {
        setFlipped((v) => !v);
      }, particle.flipEverySec * 1000);
    }, particle.flipDelaySec * 1000);
    return () => {
      window.clearTimeout(start);
      if (intervalId != null) window.clearInterval(intervalId);
    };
  }, [particle.flipDelaySec, particle.flipEverySec, particle.key]);

  const style = {
    ["--welcome-lane" as string]: String(particle.lane),
    ["--welcome-size" as string]: `${particle.size}px`,
    ["--welcome-duration" as string]: `${particle.durationSec}s`,
    ["--welcome-delay" as string]: `${particle.delaySec}s`,
  } as CSSProperties;

  return (
    <div
      className={[
        "welcome-ambient__card",
        `welcome-ambient__card--${mode}`,
        `welcome-ambient__card--depth-${particle.depth}`,
        flipped ? "welcome-ambient__card--flipped" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
      aria-hidden
    >
      <div className="welcome-ambient__scene">
        <div className="welcome-ambient__face welcome-ambient__face--front">
          <img src={particle.card.front_url} alt="" draggable={false} />
        </div>
        <div className="welcome-ambient__face welcome-ambient__face--back">
          <img src={particle.card.back_url} alt="" draggable={false} />
        </div>
      </div>
    </div>
  );
}

export default function WelcomeAmbient() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [items, setItems] = useState<WelcomeAmbientPhotocard[]>([]);
  const [total, setTotal] = useState(0);
  const [ready, setReady] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const onVis = () => setHidden(document.visibilityState === "hidden");
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const last = readLastMode();
    const preferred = nextMode(last);

    async function load() {
      const tryOrientations: Mode[] =
        preferred === "portrait"
          ? ["portrait", "landscape"]
          : ["landscape", "portrait"];

      for (const orient of tryOrientations) {
        try {
          const res = await fetchWelcomeAmbientPhotocards(orient, 32);
          if (cancelled) return;
          if ((res.items || []).length > 0) {
            setMode(orient);
            writeLastMode(orient);
            setItems(res.items);
            setTotal(res.total || res.items.length);
            window.setTimeout(() => {
              if (!cancelled) setReady(true);
            }, 280);
            return;
          }
        } catch {
          /* try other orientation / stay empty */
        }
      }
      if (!cancelled) {
        setMode(preferred);
        writeLastMode(preferred);
        setItems([]);
        setTotal(0);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const particles = useMemo(() => {
    if (!mode || !items.length) return [];
    return buildParticles(items, mode, total || items.length);
  }, [items, mode, total]);

  if (!mode || !particles.length || reducedMotion) {
    return null;
  }

  return (
    <div
      className={[
        "welcome-ambient",
        `welcome-ambient--${mode}`,
        ready ? "welcome-ambient--ready" : "",
        hidden ? "welcome-ambient--paused" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden
    >
      {particles.map((p) => (
        <AmbientCard key={p.key} particle={p} mode={mode} />
      ))}
    </div>
  );
}
