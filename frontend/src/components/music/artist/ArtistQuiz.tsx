import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatTrackDate } from "../../../formatDate";
import {
  fetchQuizDiscography,
  fetchQuizLineup,
  fetchQuizScores,
  fetchQuizSongs,
  saveQuizScore,
} from "../../../api";
import type { QuizScoreEntry, QuizScores } from "../../../types";

type Props = {
  bandId: number;
  isSolo: boolean;
  onPlaySnippet: (path: string) => void;
};

type QuizMode = "discography" | "lineup" | "songs";
type Phase = "loading" | "ready" | "playing" | "finished";

type DiscographyRelease = {
  id: string;
  title: string;
  tracks: { title: string }[];
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

function normalizeGuess(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesGuess(guess: string, answer: string): boolean {
  return normalizeGuess(guess) === normalizeGuess(answer);
}

function formatQuizTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
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

export default function ArtistQuiz({ bandId, isSolo, onPlaySnippet }: Props) {
  const [mode, setMode] = useState<QuizMode>("discography");
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
          setDiscography(data.releases);
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
          setSongQuestions(data.questions);
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
      setMode("discography");
      return;
    }
    void loadMode(mode);
  }, [mode, bandId, isSolo, loadMode]);

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

  const tryRevealGuess = useCallback(() => {
    const raw = guessInput.trim();
    if (!raw) return;
    const norm = normalizeGuess(raw);
    if (!norm) return;

    if (mode === "discography") {
      const nextReleases = new Set(revealedReleases);
      const nextTracks = new Set(revealedTracks);
      for (const rel of discography) {
        if (!nextReleases.has(rel.id) && matchesGuess(raw, rel.title)) {
          nextReleases.add(rel.id);
        }
        for (const track of rel.tracks) {
          const key = `${rel.id}:${track.title}`;
          if (!nextTracks.has(key) && matchesGuess(raw, track.title)) {
            nextTracks.add(key);
          }
        }
      }
      if (
        nextReleases.size === revealedReleases.size &&
        nextTracks.size === revealedTracks.size
      ) {
        return;
      }
      setRevealedReleases(nextReleases);
      setRevealedTracks(nextTracks);
      setGuessInput("");
      if (checkDiscographyComplete(nextReleases, nextTracks)) {
        void finishDiscography();
      }
    } else if (mode === "lineup") {
      const next = new Set(revealedMembers);
      for (const m of lineup) {
        if (!next.has(m.id) && matchesGuess(raw, m.name)) {
          next.add(m.id);
        }
      }
      if (next.size === revealedMembers.size) return;
      setRevealedMembers(next);
      setGuessInput("");
      if (next.size >= lineup.length) {
        void finishLineup();
      }
    }
  }, [
    checkDiscographyComplete,
    discography,
    finishDiscography,
    finishLineup,
    guessInput,
    lineup,
    mode,
    revealedMembers,
    revealedReleases,
    revealedTracks,
  ]);

  const beginQuiz = () => {
    setFinishState(null);
    setGuessInput("");
    setRevealedReleases(new Set());
    setRevealedTracks(new Set());
    setRevealedMembers(new Set());
    setSongRound(0);
    setSongCorrect(0);
    setSongPicked(null);
    setPhase("playing");

    if (mode === "discography") {
      startTimer(quizTimeLimitMs(discographyTotals.all));
    } else if (mode === "lineup") {
      startTimer(quizTimeLimitMs(lineup.length));
    } else {
      startTimer(null);
      const q = songQuestions[0];
      if (q) onPlaySnippet(q.play_path);
    }
  };

  const handleFinishEarly = useCallback(() => {
    if (phase !== "playing") return;
    if (mode === "discography") void finishDiscography();
    else if (mode === "lineup") void finishLineup();
    else void finishSongs();
  }, [phase, mode, finishDiscography, finishLineup, finishSongs]);

  const answerSong = (choice: string) => {
    if (songPicked || phase !== "playing") return;
    const q = songQuestions[songRound];
    if (!q) return;
    const correct = matchesGuess(choice, q.correct_title);
    setSongPicked(choice);
    const nextCorrect = songCorrect + (correct ? 1 : 0);
    setSongCorrect(nextCorrect);

    window.setTimeout(() => {
      const nextRound = songRound + 1;
      if (nextRound >= songQuestions.length) {
        setSongCorrect(nextCorrect);
        void finishSongs(nextCorrect);
        return;
      }
      setSongRound(nextRound);
      setSongPicked(null);
      onPlaySnippet(songQuestions[nextRound].play_path);
    }, 650);
  };

  const timerProgress =
    timeLimitMs != null && timeLimitMs > 0
      ? Math.min(1, elapsedMs / timeLimitMs)
      : null;

  const discographyColumns = useMemo(
    () => splitColumns(discography, DISCO_COLUMNS),
    [discography]
  );

  const lineupRows = useMemo(() => splitRows(lineup), [lineup]);

  const modes: { id: QuizMode; label: string; hidden?: boolean }[] = [
    { id: "discography", label: "Discography" },
    { id: "lineup", label: "Lineup", hidden: isSolo },
    { id: "songs", label: "Songs" },
  ];

  return (
    <div className="artist-quiz">
      <nav className="artist-page__subtabs artist-quiz__subtabs">
        {modes
          .filter((m) => !m.hidden)
          .map((m) => (
            <button
              key={m.id}
              type="button"
              className={mode === m.id ? "active" : ""}
              onClick={() => setMode(m.id)}
            >
              <span>{m.label}</span>
            </button>
          ))}
      </nav>

      {error && <p className="error">{error}</p>}
      {phase === "loading" && <p className="muted">Loading quiz…</p>}

      {phase === "ready" && !error && (
        <div className="artist-quiz__ready">
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
        <div className="artist-quiz__panel">
          <div className="artist-quiz__input-row">
            <input
              type="text"
              className="artist-quiz__guess-input"
              placeholder="Type a release or track title…"
              value={guessInput}
              onChange={(e) => setGuessInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  tryRevealGuess();
                }
              }}
              onBlur={() => tryRevealGuess()}
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
              onClick={handleFinishEarly}
            >
              Finish
            </button>
          </div>
          <div className="artist-quiz__disco-grid">
            {discographyColumns.map((col, ci) => (
              <div key={ci} className="artist-quiz__disco-col">
                {col.map((rel) => (
                  <section key={rel.id} className="artist-quiz__release">
                    <h3 className="artist-quiz__release-title">
                      {revealedReleases.has(rel.id) ? rel.title : "—"}
                    </h3>
                    <ul className="artist-quiz__track-list">
                      {rel.tracks.map((t) => {
                        const key = `${rel.id}:${t.title}`;
                        const revealed = revealedTracks.has(key);
                        return (
                          <li key={key} className="artist-quiz__track-cell">
                            <span className="artist-quiz__track-bullet">•</span>
                            <span
                              className={
                                revealed
                                  ? "artist-quiz__track-revealed"
                                  : "artist-quiz__track-hidden"
                              }
                            >
                              {revealed ? t.title : "—"}
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
      )}

      {phase === "playing" && mode === "lineup" && (
        <div className="artist-quiz__panel artist-quiz__panel--lineup">
          <div className="artist-quiz__input-row">
            <input
              type="text"
              className="artist-quiz__guess-input"
              placeholder="Type a member name…"
              value={guessInput}
              onChange={(e) => setGuessInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  tryRevealGuess();
                }
              }}
              onBlur={() => tryRevealGuess()}
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
              onClick={handleFinishEarly}
            >
              Finish
            </button>
          </div>
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
                      {revealed && (
                        <>
                          <span className="artist-quiz__member-name">
                            {m.name}
                            {m.is_deceased && (
                              <span title="Deceased"> †</span>
                            )}
                          </span>
                          {m.years && (
                            <span className="artist-quiz__member-years">
                              {m.years}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {phase === "playing" && mode === "songs" && songQuestions[songRound] && (
        <div className="artist-quiz__panel artist-quiz__panel--songs">
          <div className="artist-quiz__songs-head">
            <span className="muted">
              Round {songRound + 1} / {songQuestions.length}
            </span>
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
          <div className="artist-quiz__song-cards">
            {songQuestions[songRound].choices.map((c) => {
              const q = songQuestions[songRound];
              const picked = songPicked === c.title;
              const showResult = songPicked != null;
              const isCorrect = matchesGuess(c.title, q.correct_title);
              const dateLabel = formatTrackDate(c.release_date);
              return (
                <button
                  key={c.title}
                  type="button"
                  className={`artist-quiz__song-card${
                    showResult && isCorrect ? " artist-quiz__song-card--correct" : ""
                  }${
                    showResult && picked && !isCorrect
                      ? " artist-quiz__song-card--wrong"
                      : ""
                  }`}
                  disabled={songPicked != null}
                  onClick={() => answerSong(c.title)}
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
                  <span className="artist-quiz__song-title">{c.title}</span>
                  {dateLabel && (
                    <span className="artist-quiz__song-date">{dateLabel}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
