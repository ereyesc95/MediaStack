import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatTrackDate } from "../../../formatDate";
import {
  fetchQuizDiscography,
  fetchQuizLineup,
  fetchQuizScores,
  fetchQuizSongs,
  playTrack,
  saveQuizScore,
} from "../../../api";
import { useBeatPulse } from "../../../useBeatPulse";
import type { QuizScoreEntry, QuizScores } from "../../../types";
import { useMiniAudio } from "./MiniAudioPlayer";

export type QuizMode = "discography" | "lineup" | "songs";

export const QUIZ_MODES: {
  id: QuizMode;
  label: string;
  soloHidden?: boolean;
}[] = [
  { id: "discography", label: "DISCOGRAPHY" },
  { id: "lineup", label: "LINEUP", soloHidden: true },
  { id: "songs", label: "SONGS" },
];

type Props = {
  bandId: number;
  isSolo: boolean;
  mode: QuizMode;
  onModeChange: (mode: QuizMode) => void;
  /** Stops artist-page playback so quiz audio (songs mode) does not overlap. */
  onStopPageAudio?: () => void;
  onSongsBeatChange?: (active: boolean, playing: boolean) => void;
};

const QUIZ_INTROS: Record<QuizMode, string> = {
  discography:
    "Every release and track title is hiding in the tables. Type a name from memory and watch the puzzle unlock — race the clock to reveal them all.",
  lineup:
    "Empty circles wait for each member. Type a name and their photo, role, and years snap into place. How fast can you complete the roster?",
  songs:
    "Study the covers, trust your ears, and pick the right song before moving on. Each round plays a different track.",
};

type Phase = "loading" | "ready" | "playing" | "finished";

type DiscographyRelease = {
  id: string;
  title: string;
  tracks: { title: string; number: number }[];
};

type LineupMember = {
  id: number;
  name: string;
  photo_url?: string | null;
  years?: string | null;
  roles?: string[];
  is_deceased?: boolean;
};

type SongChoice = {
  id: string;
  play_path?: string;
  title: string;
  cover_url?: string | null;
  release_date?: string | null;
};

type SongQuestion = {
  play_path: string;
  correct_title: string;
  choices: SongChoice[];
};

const SONG_ROUNDS = 10;
const DISCO_COLUMNS = 3;
const SONG_CHOICE_COUNT = 3;
const SONG_ROUND_DELAY_MS = 650;

function normalizeGuess(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripBracketSuffixes(title: string): string {
  return title.replace(/\s*\[[^\]]*\]/g, "").trim();
}

/** Title shown in quiz tables and song choices (no bracket suffixes). */
function quizDisplayTitle(title: string): string {
  return stripBracketSuffixes(title);
}

function normalizeQuizMatch(text: string): string {
  const stripped = stripBracketSuffixes(text).replace(/[()]/g, "");
  return normalizeGuess(stripped);
}

function matchesGuess(guess: string, answer: string): boolean {
  return normalizeQuizMatch(guess) === normalizeQuizMatch(answer);
}

function formatQuizTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatQuizTrackNum(n: number): string {
  return String(Math.max(1, n)).padStart(2, "0");
}

function normalizeDiscographyReleases(
  releases: { id: string; title: string; tracks: { title: string; number?: number }[] }[]
): DiscographyRelease[] {
  return releases.map((rel) => ({
    ...rel,
    tracks: rel.tracks.map((t, i) => ({
      title: t.title,
      number: t.number ?? i + 1,
    })),
  }));
}

function splitRows<T>(items: T[]): { top: T[]; bottom: T[] } {
  const topCount = Math.ceil(items.length / 2);
  return { top: items.slice(0, topCount), bottom: items.slice(topCount) };
}

function splitColumns<T>(items: T[], cols: number): T[][] {
  const out: T[][] = Array.from({ length: cols }, () => []);
  items.forEach((item, i) => out[i % cols].push(item));
  return out;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function quizTimeLimitMs(totalItems: number): number {
  return Math.max(180_000, totalItems * 12_000);
}

function scrollRevealIntoView(
  container: HTMLElement | null,
  target: string
) {
  if (!container) return;
  const el = container.querySelector<HTMLElement>(
    `[data-quiz-target="${CSS.escape(target)}"]`
  );
  if (!el) return;
  requestAnimationFrame(() => {
    const pad = 16;
    const cRect = container.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    const visible =
      eRect.top >= cRect.top + pad && eRect.bottom <= cRect.bottom - pad;
    if (!visible) {
      const elTop =
        el.getBoundingClientRect().top -
        container.getBoundingClientRect().top +
        container.scrollTop;
      const next = elTop - (container.clientHeight - el.offsetHeight) / 2;
      container.scrollTo({
        top: Math.max(0, next),
        behavior: "smooth",
      });
    }
  });
}

type QuizControlBarProps = {
  guessInputRef: React.RefObject<HTMLInputElement | null>;
  placeholder: string;
  guessInput: string;
  onGuessChange: (value: string) => void;
  timerProgress: number | null;
  timeLimitMs: number | null;
  elapsedMs: number;
  onFinish: () => void;
};

function QuizControlBar({
  guessInputRef,
  placeholder,
  guessInput,
  onGuessChange,
  timerProgress,
  timeLimitMs,
  elapsedMs,
  onFinish,
}: QuizControlBarProps) {
  return (
    <div className="artist-quiz__chrome">
      <div className="artist-quiz__input-row">
        <input
          ref={guessInputRef}
          type="text"
          className="artist-quiz__guess-input"
          placeholder={placeholder}
          value={guessInput}
          onChange={(e) => onGuessChange(e.target.value)}
          autoFocus
        />
        <div className="artist-quiz__timer" aria-hidden>
          <div
            className="artist-quiz__timer-bar"
            style={
              timerProgress != null
                ? { width: `${(1 - timerProgress) * 100}%` }
                : undefined
            }
          />
          <span className="artist-quiz__timer-label">
            {timeLimitMs != null
              ? formatQuizTime(Math.max(0, timeLimitMs - elapsedMs))
              : formatQuizTime(elapsedMs)}
          </span>
        </div>
        <button
          type="button"
          className="artist-quiz__finish"
          onClick={onFinish}
        >
          Finish
        </button>
      </div>
    </div>
  );
}

function ScoreSummary({
  label,
  score,
  total,
  timeMs,
  best,
}: {
  label: string;
  score: number;
  total: number;
  timeMs: number;
  best?: QuizScoreEntry;
}) {
  const isNewBest =
    best &&
    score === best.best_score &&
    score === total &&
    timeMs === (best.best_time_ms ?? timeMs);

  return (
    <div className="artist-quiz__summary">
      <p className="artist-quiz__summary-main">
        {label}: {score} / {total}
        {timeMs > 0 && <span> · {formatQuizTime(timeMs)}</span>}
      </p>
      {best && (best.best_score > 0 || best.best_total > 0) && (
        <p className="artist-quiz__summary-best muted">
          {isNewBest ? (
            <>New personal best</>
          ) : (
            <>
              Best: {best.best_score}/{best.best_total}
              {(best.best_time_ms ?? 0) > 0 && (
                <> · {formatQuizTime(best.best_time_ms!)}</>
              )}
            </>
          )}
        </p>
      )}
    </div>
  );
}

export default function ArtistQuiz({
  bandId,
  isSolo,
  mode,
  onModeChange,
  onStopPageAudio,
  onSongsBeatChange,
}: Props) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [scores, setScores] = useState<QuizScores>({});

  const [discography, setDiscography] = useState<DiscographyRelease[]>([]);
  const [lineup, setLineup] = useState<LineupMember[]>([]);
  const [songQuestions, setSongQuestions] = useState<SongQuestion[]>([]);

  const [guessInput, setGuessInput] = useState("");
  const [revealedReleases, setRevealedReleases] = useState<Set<string>>(
    () => new Set()
  );
  const [revealedTracks, setRevealedTracks] = useState<Set<string>>(
    () => new Set()
  );
  const [revealedMembers, setRevealedMembers] = useState<Set<number>>(
    () => new Set()
  );

  const [songRound, setSongRound] = useState(0);
  const [songCorrect, setSongCorrect] = useState(0);
  const [songPicked, setSongPicked] = useState<string | null>(null);
  const songQuestionsRef = useRef(songQuestions);
  const songRoundRef = useRef(songRound);
  const songCorrectRef = useRef(songCorrect);
  const songAdvanceRef = useRef<number | null>(null);
  const songAnsweringRef = useRef(false);
  const guessInputRef = useRef<HTMLInputElement>(null);
  const discoScrollRef = useRef<HTMLDivElement>(null);
  const lineupScrollRef = useRef<HTMLDivElement>(null);
  const [pendingScrollTarget, setPendingScrollTarget] = useState<string | null>(
    null
  );

  songQuestionsRef.current = songQuestions;
  songRoundRef.current = songRound;
  songCorrectRef.current = songCorrect;

  const quizAudio = useMiniAudio();
  useBeatPulse(
    quizAudio.audioRef,
    phase === "playing" && mode === "songs" && Boolean(quizAudio.src),
    quizAudio.playing
  );

  useEffect(() => {
    if (!onSongsBeatChange) return;
    const active =
      phase === "playing" && mode === "songs" && Boolean(quizAudio.src);
    onSongsBeatChange(active, active && quizAudio.playing);
  }, [
    onSongsBeatChange,
    phase,
    mode,
    quizAudio.src,
    quizAudio.playing,
  ]);

  useEffect(() => {
    return () => onSongsBeatChange?.(false, false);
  }, [onSongsBeatChange]);

  const [elapsedMs, setElapsedMs] = useState(0);
  const [timeLimitMs, setTimeLimitMs] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const finishRef = useRef<(() => void) | null>(null);

  const [finishState, setFinishState] = useState<{
    score: number;
    total: number;
    timeMs: number;
    label: string;
  } | null>(null);

  const discographyTotals = useMemo(() => {
    let tracks = 0;
    for (const rel of discography) tracks += rel.tracks.length;
    return { releases: discography.length, tracks, all: discography.length + tracks };
  }, [discography]);

  const stopTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(
    (limit: number | null) => {
      stopTimer();
      setElapsedMs(0);
      setTimeLimitMs(limit);
      const started = Date.now();
      timerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - started;
        setElapsedMs(elapsed);
        if (limit != null && elapsed >= limit) {
          stopTimer();
          finishRef.current?.();
        }
      }, 200);
    },
    [stopTimer]
  );

  useEffect(() => {
    return () => stopTimer();
  }, [stopTimer]);

  useEffect(() => {
    return () => {
      if (songAdvanceRef.current != null) {
        window.clearTimeout(songAdvanceRef.current);
        songAdvanceRef.current = null;
      }
      songAnsweringRef.current = false;
    };
  }, []);

  const playSnippet = useCallback(
    async (path: string) => {
      try {
        const res = await playTrack({ path, artist_id: bandId, title: "Quiz" });
        quizAudio.loadSrc(res.stream_url, true);
      } catch {
        /* ignore */
      }
    },
    [bandId, quizAudio.loadSrc]
  );

  useEffect(() => () => quizAudio.clear(), [quizAudio.clear]);

  useEffect(() => {
    fetchQuizScores(bandId)
      .then(setScores)
      .catch(() => {});
  }, [bandId]);

  const loadMode = useCallback(
    async (next: QuizMode) => {
      setPhase("loading");
      setError(null);
      setFinishState(null);
      setGuessInput("");
      setRevealedReleases(new Set());
      setRevealedTracks(new Set());
      setRevealedMembers(new Set());
      setSongRound(0);
      setSongCorrect(0);
      setSongPicked(null);
      songAnsweringRef.current = false;
      if (songAdvanceRef.current != null) {
        window.clearTimeout(songAdvanceRef.current);
        songAdvanceRef.current = null;
      }
      stopTimer();

      try {
        if (next === "discography") {
          const data = await fetchQuizDiscography(bandId);
          if (!data.releases.length) {
            setError("No official releases with local tracks found.");
            setPhase("ready");
            setDiscography([]);
            return;
          }
          setDiscography(normalizeDiscographyReleases(data.releases));
        } else if (next === "lineup") {
          const data = await fetchQuizLineup(bandId);
          if (data.disabled || !data.members.length) {
            setError("Lineup quiz is not available.");
            setPhase("ready");
            setLineup([]);
            return;
          }
          setLineup(data.members);
        } else {
          const data = await fetchQuizSongs(bandId, SONG_ROUNDS);
          if (!data.questions.length) {
            setError("Not enough local tracks for a songs quiz.");
            setPhase("ready");
            setSongQuestions([]);
            return;
          }
          setSongQuestions(
            data.questions.map((q) => ({
              ...q,
              choices: q.choices.slice(0, SONG_CHOICE_COUNT),
            }))
          );
        }
        setPhase("ready");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase("ready");
      }
    },
    [bandId, stopTimer]
  );

  useEffect(() => {
    if (mode === "lineup" && isSolo) {
      onModeChange("discography");
      return;
    }
    void loadMode(mode);
  }, [mode, bandId, isSolo, loadMode, onModeChange]);

  const finishDiscography = useCallback(async () => {
    stopTimer();
    const score = revealedTracks.size + revealedReleases.size;
    const total = discographyTotals.all;
    const timeMs = elapsedMs;
    try {
      const res = await saveQuizScore(bandId, {
        quiz_type: "discography",
        score,
        total,
        time_ms: timeMs,
      });
      setScores((s) => ({ ...s, discography: res }));
    } catch {
      /* ignore */
    }
    setFinishState({ score, total, timeMs, label: "Discography" });
    setPhase("finished");
  }, [
    bandId,
    discographyTotals.all,
    elapsedMs,
    revealedReleases.size,
    revealedTracks.size,
    stopTimer,
  ]);

  const finishLineup = useCallback(async () => {
    stopTimer();
    const score = revealedMembers.size;
    const total = lineup.length;
    const timeMs = elapsedMs;
    try {
      const res = await saveQuizScore(bandId, {
        quiz_type: "lineup",
        score,
        total,
        time_ms: timeMs,
      });
      setScores((s) => ({ ...s, lineup: res }));
    } catch {
      /* ignore */
    }
    setFinishState({ score, total, timeMs, label: "Lineup" });
    setPhase("finished");
  }, [bandId, elapsedMs, lineup.length, revealedMembers.size, stopTimer]);

  const finishSongs = useCallback(async (overrideScore?: number) => {
    stopTimer();
    const score = overrideScore ?? songCorrect;
    const total = songQuestions.length;
    const timeMs = elapsedMs;
    try {
      const res = await saveQuizScore(bandId, {
        quiz_type: "songs",
        score,
        total,
        time_ms: timeMs,
      });
      setScores((s) => ({ ...s, songs: res }));
    } catch {
      /* ignore */
    }
    setFinishState({ score, total, timeMs, label: "Songs" });
    setPhase("finished");
  }, [bandId, elapsedMs, songCorrect, songQuestions.length, stopTimer]);

  useEffect(() => {
    if (mode === "discography") finishRef.current = () => void finishDiscography();
    else if (mode === "lineup") finishRef.current = () => void finishLineup();
    else finishRef.current = () => void finishSongs();
  }, [mode, finishDiscography, finishLineup, finishSongs]);

  const checkDiscographyComplete = useCallback(
    (nextReleases: Set<string>, nextTracks: Set<string>) => {
      if (nextReleases.size < discography.length) return false;
      let trackTotal = 0;
      for (const rel of discography) trackTotal += rel.tracks.length;
      return nextTracks.size >= trackTotal;
    },
    [discography]
  );

  useEffect(() => {
    if (!pendingScrollTarget || phase !== "playing") return;
    const container =
      mode === "discography"
        ? discoScrollRef.current
        : mode === "lineup"
          ? lineupScrollRef.current
          : null;
    scrollRevealIntoView(container, pendingScrollTarget);
    setPendingScrollTarget(null);
  }, [
    pendingScrollTarget,
    phase,
    mode,
    revealedTracks,
    revealedReleases,
    revealedMembers,
  ]);

  const processGuessValue = useCallback(
    (raw: string): string => {
      const trimmed = raw.trim();
      if (!trimmed) return raw;

      if (mode === "discography") {
        const nextReleases = new Set(revealedReleases);
        const nextTracks = new Set(revealedTracks);
        let matched = false;
        let scrollTarget: string | null = null;
        for (const rel of discography) {
          if (!nextReleases.has(rel.id) && matchesGuess(trimmed, rel.title)) {
            nextReleases.add(rel.id);
            matched = true;
            scrollTarget = `release:${rel.id}`;
          }
          for (const track of rel.tracks) {
            const key = `${rel.id}:${track.title}`;
            if (!nextTracks.has(key) && matchesGuess(trimmed, track.title)) {
              nextTracks.add(key);
              matched = true;
              scrollTarget = `track:${key}`;
            }
          }
        }
        if (!matched) return raw;
        if (scrollTarget) setPendingScrollTarget(scrollTarget);
        setRevealedReleases(nextReleases);
        setRevealedTracks(nextTracks);
        if (checkDiscographyComplete(nextReleases, nextTracks)) {
          void finishDiscography();
        }
        requestAnimationFrame(() => guessInputRef.current?.focus());
        return "";
      }

      if (mode === "lineup") {
        const next = new Set(revealedMembers);
        let matched = false;
        let scrollTarget: string | null = null;
        for (const m of lineup) {
          if (!next.has(m.id) && matchesGuess(trimmed, m.name)) {
            next.add(m.id);
            matched = true;
            scrollTarget = `member:${m.id}`;
          }
        }
        if (!matched) return raw;
        if (scrollTarget) setPendingScrollTarget(scrollTarget);
        setRevealedMembers(next);
        if (next.size >= lineup.length) {
          void finishLineup();
        }
        requestAnimationFrame(() => guessInputRef.current?.focus());
        return "";
      }

      return raw;
    },
    [
      checkDiscographyComplete,
      discography,
      finishDiscography,
      finishLineup,
      lineup,
      mode,
      revealedMembers,
      revealedReleases,
      revealedTracks,
    ]
  );

  const handleGuessChange = (value: string) => {
    setGuessInput(processGuessValue(value));
  };

  const beginQuiz = () => {
    if (mode === "songs") {
      onStopPageAudio?.();
    }
    setPendingScrollTarget(null);
    setFinishState(null);
    setGuessInput("");
    setRevealedReleases(new Set());
    setRevealedTracks(new Set());
    setRevealedMembers(new Set());
    setSongRound(0);
    setSongCorrect(0);
    setSongPicked(null);
    songAnsweringRef.current = false;
    if (songAdvanceRef.current != null) {
      window.clearTimeout(songAdvanceRef.current);
      songAdvanceRef.current = null;
    }
    setPhase("playing");

    if (mode === "discography") {
      startTimer(quizTimeLimitMs(discographyTotals.all));
    } else if (mode === "lineup") {
      startTimer(quizTimeLimitMs(lineup.length));
    } else {
      startTimer(null);
      const q = songQuestions[0];
      if (q) void playSnippet(q.play_path);
    }
  };

  const handleFinishEarly = useCallback(() => {
    if (phase !== "playing") return;
    if (mode === "discography") void finishDiscography();
    else if (mode === "lineup") void finishLineup();
    else void finishSongs();
  }, [phase, mode, finishDiscography, finishLineup, finishSongs]);

  const clearSongAdvance = useCallback(() => {
    if (songAdvanceRef.current != null) {
      window.clearTimeout(songAdvanceRef.current);
      songAdvanceRef.current = null;
    }
  }, []);

  const answerSong = useCallback(
    (choiceId: string, choiceTitle: string) => {
      if (songAnsweringRef.current || songPicked || phase !== "playing") return;
      const round = songRoundRef.current;
      const q = songQuestionsRef.current[round];
      if (!q) return;

      songAnsweringRef.current = true;
      clearSongAdvance();

      const correct = matchesGuess(choiceTitle, q.correct_title);
      setSongPicked(choiceId);
      const nextCorrect = songCorrectRef.current + (correct ? 1 : 0);
      setSongCorrect(nextCorrect);

      songAdvanceRef.current = window.setTimeout(() => {
        songAdvanceRef.current = null;
        songAnsweringRef.current = false;
        setSongPicked(null);

        const questions = songQuestionsRef.current;
        const nextRound = round + 1;
        if (nextRound >= questions.length) {
          setSongCorrect(nextCorrect);
          void finishSongs(nextCorrect);
          return;
        }

        setSongRound(nextRound);
        const nextQ = questions[nextRound];
        if (nextQ) void playSnippet(nextQ.play_path);
      }, SONG_ROUND_DELAY_MS);
    },
    [songPicked, phase, clearSongAdvance, finishSongs, playSnippet]
  );

  const timerProgress =
    timeLimitMs != null && timeLimitMs > 0
      ? Math.min(1, elapsedMs / timeLimitMs)
      : null;

  const discographyColumns = useMemo(
    () => splitColumns(discography, DISCO_COLUMNS),
    [discography]
  );

  const lineupRows = useMemo(() => splitRows(lineup), [lineup]);

  const quizActive =
    phase === "playing" &&
    (mode === "discography" || mode === "lineup" || mode === "songs");

  return (
    <div
      className={`artist-quiz${quizActive ? " artist-quiz--active" : ""}`}
    >
      {error && <p className="error">{error}</p>}
      {phase === "loading" && <p className="muted">Loading quiz…</p>}

      {phase === "ready" && !error && (
        <div className="artist-quiz__ready">
          <p className="artist-quiz__intro">
            {mode === "songs" && songQuestions.length > 0
              ? `${songQuestions.length} round${
                  songQuestions.length === 1 ? "" : "s"
                } of mystery audio. ${QUIZ_INTROS.songs}`
              : QUIZ_INTROS[mode]}
          </p>
          <button type="button" className="artist-quiz__start" onClick={beginQuiz}>
            Start
          </button>
          {mode === "discography" && scores.discography && (
            <p className="artist-quiz__ready-best muted">
              Best: {scores.discography.best_score}/{scores.discography.best_total}
              {(scores.discography.best_time_ms ?? 0) > 0 && (
                <> · {formatQuizTime(scores.discography.best_time_ms!)}</>
              )}
            </p>
          )}
          {mode === "lineup" && scores.lineup && (
            <p className="artist-quiz__ready-best muted">
              Best: {scores.lineup.best_score}/{scores.lineup.best_total}
              {(scores.lineup.best_time_ms ?? 0) > 0 && (
                <> · {formatQuizTime(scores.lineup.best_time_ms!)}</>
              )}
            </p>
          )}
          {mode === "songs" && scores.songs && (
            <p className="artist-quiz__ready-best muted">
              Best: {scores.songs.best_score}/{scores.songs.best_total}
              {(scores.songs.best_time_ms ?? 0) > 0 && (
                <> · {formatQuizTime(scores.songs.best_time_ms!)}</>
              )}
            </p>
          )}
        </div>
      )}

      {phase === "finished" && finishState && (
        <div className="artist-quiz__finished">
          <ScoreSummary
            label={finishState.label}
            score={finishState.score}
            total={finishState.total}
            timeMs={finishState.timeMs}
            best={
              mode === "discography"
                ? scores.discography
                : mode === "lineup"
                  ? scores.lineup
                  : scores.songs
            }
          />
          <button
            type="button"
            className="artist-quiz__start"
            onClick={() => {
              setFinishState(null);
              setPhase("ready");
            }}
          >
            Play again
          </button>
        </div>
      )}

      {phase === "playing" && mode === "discography" && (
        <div className="artist-quiz__panel artist-quiz__panel--scrollable">
          <QuizControlBar
            guessInputRef={guessInputRef}
            placeholder="Type a release or track title…"
            guessInput={guessInput}
            onGuessChange={handleGuessChange}
            timerProgress={timerProgress}
            timeLimitMs={timeLimitMs}
            elapsedMs={elapsedMs}
            onFinish={handleFinishEarly}
          />
          <div ref={discoScrollRef} className="artist-quiz__scroll">
            <div className="artist-quiz__disco-grid">
              {discographyColumns.map((col, ci) => (
                <div key={ci} className="artist-quiz__disco-col">
                  {col.map((rel) => (
                    <section
                      key={rel.id}
                      className="artist-quiz__release"
                      data-quiz-target={`release:${rel.id}`}
                    >
                      <h3 className="artist-quiz__release-title">
                        {revealedReleases.has(rel.id)
                          ? quizDisplayTitle(rel.title)
                          : "—"}
                      </h3>
                      <ul className="artist-quiz__track-list">
                        {rel.tracks.map((t) => {
                          const key = `${rel.id}:${t.title}`;
                          const revealed = revealedTracks.has(key);
                          return (
                            <li
                              key={key}
                              className="artist-quiz__track-cell"
                              data-quiz-target={`track:${key}`}
                            >
                              <span className="artist-quiz__track-num">
                                {formatQuizTrackNum(t.number)}
                              </span>
                              <span
                                className={
                                  revealed
                                    ? "artist-quiz__track-revealed"
                                    : "artist-quiz__track-hidden"
                                }
                              >
                                {revealed ? quizDisplayTitle(t.title) : "—"}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {phase === "playing" && mode === "lineup" && (
        <div className="artist-quiz__panel artist-quiz__panel--scrollable artist-quiz__panel--lineup">
          <QuizControlBar
            guessInputRef={guessInputRef}
            placeholder="Type a member name…"
            guessInput={guessInput}
            onGuessChange={handleGuessChange}
            timerProgress={timerProgress}
            timeLimitMs={timeLimitMs}
            elapsedMs={elapsedMs}
            onFinish={handleFinishEarly}
          />
          <div
            ref={lineupScrollRef}
            className="artist-quiz__scroll artist-quiz__scroll--lineup"
          >
            <div
              className="artist-quiz__lineup-grid"
              data-count={Math.min(Math.max(lineup.length, 1), 8)}
            >
              {[lineupRows.top, lineupRows.bottom].map((row, ri) => (
                <div key={ri} className="artist-quiz__lineup-row">
                  {row.map((m) => {
                    const revealed = revealedMembers.has(m.id);
                    return (
                      <div
                        key={m.id}
                        data-quiz-target={`member:${m.id}`}
                        className={`artist-quiz__member${
                          m.is_deceased ? " artist-quiz__member--deceased" : ""
                        }`}
                      >
                      <span className="artist-quiz__member-photo">
                        {revealed ? (
                          m.photo_url ? (
                            <img src={m.photo_url} alt="" />
                          ) : (
                            <span className="artist-quiz__member-ph">
                              {initials(m.name)}
                            </span>
                          )
                        ) : (
                          <span className="artist-quiz__member-ph artist-quiz__member-ph--empty" />
                        )}
                      </span>
                      <div className="artist-quiz__member-meta">
                        {revealed ? (
                          <>
                            <span className="artist-quiz__member-name">
                              {m.name}
                              {m.is_deceased && (
                                <span title="Deceased"> †</span>
                              )}
                            </span>
                            <span
                              className={`artist-quiz__member-years${
                                m.years ? "" : " artist-quiz__member-years--empty"
                              }`}
                            >
                              {m.years ?? "\u00A0"}
                            </span>
                          </>
                        ) : (
                          <>
                            <span
                              className="artist-quiz__member-name artist-quiz__member-name--reserve"
                              aria-hidden="true"
                            >
                              {"\u00A0"}
                            </span>
                            <span
                              className="artist-quiz__member-years artist-quiz__member-years--reserve"
                              aria-hidden="true"
                            >
                              {"\u00A0"}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {phase === "playing" && mode === "songs" && songQuestions[songRound] && (
        <div
          key={`songs-round-${songRound}`}
          className="artist-quiz__panel artist-quiz__panel--songs"
        >
          <div className="artist-quiz__songs-head">
            <div className="artist-quiz__songs-head-right">
              <span className="artist-quiz__timer-label">
                {formatQuizTime(elapsedMs)}
              </span>
              <button
                type="button"
                className="artist-quiz__finish"
                onClick={handleFinishEarly}
              >
                Finish
              </button>
            </div>
          </div>
          <p className="artist-quiz__songs-prompt">Which track is playing?</p>
          <div className="artist-quiz__songs-body">
            <div className="artist-quiz__song-cards">
            {songQuestions[songRound].choices
              .slice(0, SONG_CHOICE_COUNT)
              .map((c) => {
              const q = songQuestions[songRound];
              const choiceId = c.id;
              const picked = songPicked === choiceId;
              const showResult = songPicked != null;
              const isCorrect = matchesGuess(c.title, q.correct_title);
              const dateLabel = formatTrackDate(c.release_date);
              return (
                <button
                  key={`${songRound}-${c.id}`}
                  type="button"
                  className={`artist-quiz__song-card${
                    showResult && isCorrect ? " artist-quiz__song-card--correct" : ""
                  }${
                    showResult && picked && !isCorrect
                      ? " artist-quiz__song-card--wrong"
                      : ""
                  }`}
                  disabled={songPicked != null}
                  onClick={() => answerSong(choiceId, c.title)}
                >
                  <span className="artist-quiz__song-cover">
                    <span
                      className="artist-quiz__song-cover-bg"
                      style={
                        c.cover_url
                          ? { backgroundImage: `url("${c.cover_url}")` }
                          : undefined
                      }
                    />
                  </span>
                  <span className="artist-quiz__song-title">
                    {quizDisplayTitle(c.title)}
                  </span>
                  {dateLabel && (
                    <span className="artist-quiz__song-date">{dateLabel}</span>
                  )}
                </button>
              );
            })}
            </div>
            {songQuestions[songRound].choices.length < SONG_CHOICE_COUNT && (
              <p className="error artist-quiz__songs-error">
                Not enough choices for this round — restart the quiz.
              </p>
            )}
          </div>
          <p className="artist-quiz__songs-round muted">
            Round {songRound + 1} / {songQuestions.length}
          </p>
        </div>
      )}

      {quizAudio.src && (
        <audio ref={quizAudio.audioRef} src={quizAudio.src} preload="auto" />
      )}
    </div>
  );
}
