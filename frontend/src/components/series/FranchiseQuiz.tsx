import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchFranchiseQuizAvailability,
  fetchFranchiseQuizCatalog,
  fetchFranchiseQuizEncyclopedia,
  fetchFranchiseQuizScores,
  fetchFranchiseQuizSoundtrack,
  playTrack,
  saveFranchiseQuizScore,
  type FranchiseQuizAvailability,
  type FranchiseQuizCatalogItem,
  type FranchiseQuizEncyclopediaItem,
  type FranchiseQuizMode,
  type FranchiseQuizSoundQuestion,
} from "../../api";
import type { QuizScoreEntry } from "../../types";
import PlaylistBoot from "../PlaylistBoot";
import { useMiniAudio } from "../music/artist/MiniAudioPlayer";

type Props = {
  franchiseId: string;
  scopePath?: string | null;
  initialAvailability?: FranchiseQuizAvailability | null;
  onOpenCatalogItem?: (item: FranchiseQuizCatalogItem) => void;
  onAvailabilityChange?: (value: FranchiseQuizAvailability) => void;
  onStopPageAudio?: () => void;
};

type Phase = "loading" | "ready" | "playing" | "finished";

const MODE_LABELS: Record<FranchiseQuizMode, string> = {
  catalog: "CATALOG",
  encyclopedia: "ENCYCLOPEDIA",
  soundtrack: "SOUNDTRACK",
};

function normalizeGuess(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function quizTimeLimitMs(total: number) {
  return Math.max(60, Math.min(15 * 60, total * 15)) * 1000;
}

function formatTime(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function initialMode(value: FranchiseQuizAvailability): FranchiseQuizMode {
  if (value.catalog) return "catalog";
  if (value.encyclopedia) return "encyclopedia";
  return "soundtrack";
}

export default function FranchiseQuiz({
  franchiseId,
  scopePath = null,
  initialAvailability = null,
  onOpenCatalogItem,
  onAvailabilityChange,
  onStopPageAudio,
}: Props) {
  const [availability, setAvailability] =
    useState<FranchiseQuizAvailability | null>(initialAvailability);
  const [mode, setMode] = useState<FranchiseQuizMode | null>(
    initialAvailability ? initialMode(initialAvailability) : null
  );
  const [phase, setPhase] = useState<Phase>("loading");
  const [catalogColumns, setCatalogColumns] = useState<
    { key: string; label: string; items: FranchiseQuizCatalogItem[] }[]
  >([]);
  const [encyclopedia, setEncyclopedia] = useState<
    FranchiseQuizEncyclopediaItem[]
  >([]);
  const [questions, setQuestions] = useState<FranchiseQuizSoundQuestion[]>([]);
  const [encyclopediaTopic, setEncyclopediaTopic] = useState(
    initialAvailability?.encyclopedia_topics[0]?.key || ""
  );
  const [soundtrackTopic, setSoundtrackTopic] = useState(
    initialAvailability?.soundtrack_topics[0]?.key || "original"
  );
  const [guess, setGuess] = useState("");
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [variantIndexes, setVariantIndexes] = useState<Record<string, number>>(
    {}
  );
  const [round, setRound] = useState(0);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [timeLimitMs, setTimeLimitMs] = useState<number | null>(null);
  const [finishState, setFinishState] = useState<{
    score: number;
    total: number;
    timeMs: number;
  } | null>(null);
  const [scores, setScores] = useState<Record<string, QuizScoreEntry>>({});
  const timerRef = useRef<number | null>(null);
  const revealedRef = useRef<Set<string>>(new Set());
  const finishRef = useRef<((score: number) => void) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const audio = useMiniAudio();

  const scoreKey =
    mode === "encyclopedia"
      ? `encyclopedia:${encyclopediaTopic}`
      : mode === "soundtrack"
        ? `soundtrack:${soundtrackTopic}`
        : "catalog";

  const total = useMemo(() => {
    if (mode === "catalog") {
      return catalogColumns.reduce((sum, column) => sum + column.items.length, 0);
    }
    if (mode === "encyclopedia") return encyclopedia.length;
    return questions.length;
  }, [catalogColumns, encyclopedia.length, mode, questions.length]);

  const stopTimer = useCallback(() => {
    if (timerRef.current != null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const stopAudio = useCallback(() => audio.clear(), [audio.clear]);

  useEffect(
    () => () => {
      stopTimer();
      stopAudio();
    },
    [stopAudio, stopTimer]
  );

  useEffect(() => {
    fetchFranchiseQuizScores(franchiseId).then(setScores).catch(() => {});
  }, [franchiseId]);

  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    fetchFranchiseQuizAvailability(franchiseId, scopePath)
      .then((value) => {
        if (cancelled) return;
        setAvailability(value);
        onAvailabilityChange?.(value);
        setEncyclopediaTopic(
          (current) => current || value.encyclopedia_topics[0]?.key || ""
        );
        setSoundtrackTopic((current) =>
          value.soundtrack_topics.some((topic) => topic.key === current)
            ? current
            : value.soundtrack_topics[0]?.key || "original"
        );
        setMode((current) => {
          if (current && value[current]) return current;
          return initialMode(value);
        });
      })
      .catch(() => setAvailability(null));
    return () => {
      cancelled = true;
    };
  }, [franchiseId, onAvailabilityChange, scopePath]);

  const resetRound = useCallback(() => {
    stopTimer();
    stopAudio();
    setGuess("");
    setRevealed(new Set());
    revealedRef.current = new Set();
    setPreviewId(null);
    setVariantIndexes({});
    setRound(0);
    setPickedId(null);
    setCorrect(0);
    setElapsedMs(0);
    setTimeLimitMs(null);
    setFinishState(null);
  }, [stopAudio, stopTimer]);

  useEffect(() => {
    if (!availability || !mode) return;
    let cancelled = false;
    resetRound();
    setPhase("loading");
    const request =
      mode === "catalog"
        ? fetchFranchiseQuizCatalog(franchiseId).then((data) => {
            if (!cancelled) setCatalogColumns(data.columns);
          })
        : mode === "encyclopedia"
          ? fetchFranchiseQuizEncyclopedia(
              franchiseId,
              encyclopediaTopic || availability.encyclopedia_topics[0]?.key || "",
              scopePath
            ).then((data) => {
              if (!cancelled) setEncyclopedia(data.items);
            })
          : fetchFranchiseQuizSoundtrack(
              franchiseId,
              soundtrackTopic,
              scopePath,
              10
            ).then((data) => {
              if (!cancelled) setQuestions(data.questions);
            });
    request
      .then(() => {
        if (!cancelled) setPhase("ready");
      })
      .catch(() => {
        if (!cancelled) setPhase("ready");
      });
    return () => {
      cancelled = true;
    };
  }, [
    availability,
    encyclopediaTopic,
    franchiseId,
    mode,
    resetRound,
    scopePath,
    soundtrackTopic,
  ]);

  const finish = useCallback(
    async (score: number) => {
      stopTimer();
      stopAudio();
      const timeMs = elapsedMs;
      setFinishState({ score, total, timeMs });
      setPhase("finished");
      try {
        const saved = await saveFranchiseQuizScore(franchiseId, {
          quiz_type: scoreKey,
          score,
          total,
          time_ms: timeMs,
        });
        setScores((current) => ({ ...current, [scoreKey]: saved }));
      } catch {
        /* Scores are optional; never interrupt a completed quiz. */
      }
    },
    [elapsedMs, franchiseId, scoreKey, stopAudio, stopTimer, total]
  );

  useEffect(() => {
    finishRef.current = (score) => void finish(score);
  }, [finish]);

  const begin = () => {
    onStopPageAudio?.();
    resetRound();
    setPhase("playing");
    if (mode !== "soundtrack") {
      const limit = quizTimeLimitMs(total);
      setTimeLimitMs(limit);
      const started = Date.now();
      timerRef.current = window.setInterval(() => {
        const next = Date.now() - started;
        setElapsedMs(next);
        if (next >= limit) {
          void finishRef.current?.(revealedRef.current.size);
        }
      }, 200);
    } else {
      const started = Date.now();
      timerRef.current = window.setInterval(
        () => setElapsedMs(Date.now() - started),
        200
      );
      const first = questions[0];
      if (first) void playQuestion(first);
    }
  };

  const playQuestion = async (question: FranchiseQuizSoundQuestion) => {
    try {
      const response = await playTrack({
        path: question.play_path,
        record: false,
      });
      audio.loadSrc(response.stream_url, true);
    } catch {
      /* Keep choices usable even when a media file cannot play. */
    }
  };

  const processGuess = (value: string) => {
    const normalized = normalizeGuess(value);
    if (!normalized) return;
    const items =
      mode === "catalog"
        ? catalogColumns.flatMap((column) => column.items)
        : encyclopedia;
    const matches = items.filter(
      (item) =>
        !revealed.has(item.id) &&
        normalizeGuess(item.title) === normalized
    );
    if (!matches.length) return;
    const next = new Set(revealed);
    for (const item of matches) next.add(item.id);
    setRevealed(next);
    revealedRef.current = next;
    setGuess("");
    if (next.size >= total) void finish(next.size);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const chooseSound = (choiceId: string) => {
    if (pickedId || !questions[round]) return;
    const question = questions[round];
    const isCorrect = choiceId === question.correct_id;
    const nextScore = correct + (isCorrect ? 1 : 0);
    setPickedId(choiceId);
    if (isCorrect) setCorrect(nextScore);
    window.setTimeout(() => {
      const nextRound = round + 1;
      if (nextRound >= questions.length) {
        void finish(nextScore);
        return;
      }
      setRound(nextRound);
      setPickedId(null);
      void playQuestion(questions[nextRound]);
    }, 650);
  };

  if (!availability || !mode) {
    return <PlaylistBoot className="playlist-boot--compact" label="Loading quiz…" />;
  }

  const modes = (Object.keys(MODE_LABELS) as FranchiseQuizMode[]).filter(
    (key) => availability[key]
  );
  const currentQuestion = questions[round];
  const best = scores[scoreKey];

  return (
    <div
      className={`artist-quiz franchise-quiz${
        phase === "playing" ? " artist-quiz--active" : ""
      }`}
    >
      <nav className="artist-page__subtabs franchise-quiz__modes">
        {modes.map((key) => (
          <button
            type="button"
            key={key}
            className={mode === key ? "active" : ""}
            onClick={() => setMode(key)}
          >
            {MODE_LABELS[key]}
          </button>
        ))}
      </nav>

      {mode === "encyclopedia" &&
      availability.encyclopedia_topics.length > 1 ? (
        <label className="franchise-quiz__topic">
          <span>Topic</span>
          <select
            value={encyclopediaTopic}
            onChange={(event) => setEncyclopediaTopic(event.target.value)}
          >
            {availability.encyclopedia_topics.map((topic) => (
              <option key={topic.key} value={topic.key}>
                {topic.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {mode === "soundtrack" && availability.soundtrack_topics.length > 1 ? (
        <label className="franchise-quiz__topic">
          <span>Topic</span>
          <select
            value={soundtrackTopic}
            onChange={(event) => setSoundtrackTopic(event.target.value)}
          >
            {availability.soundtrack_topics.map((topic) => (
              <option key={topic.key} value={topic.key}>
                {topic.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {phase === "loading" ? (
        <PlaylistBoot className="playlist-boot--compact" label="Loading quiz…" />
      ) : phase === "ready" ? (
        <div className="artist-quiz__ready">
          <p className="artist-quiz__intro">
            {mode === "catalog"
              ? "Type every Series, Movies, and Books title in this franchise."
              : mode === "encyclopedia"
                ? "Reveal every entry in the selected topic."
                : "Listen to each excerpt and choose the correct title."}
          </p>
          <button type="button" className="artist-quiz__start" onClick={begin}>
            Start
          </button>
          {best ? (
            <p className="artist-quiz__ready-best muted">
              Best: {best.best_score}/{best.best_total}
            </p>
          ) : null}
        </div>
      ) : phase === "finished" && finishState ? (
        <div className="artist-quiz__finished">
          <div className="artist-quiz__summary">
            <p className="artist-quiz__summary-main">
              {finishState.score}/{finishState.total} ·{" "}
              {formatTime(finishState.timeMs)}
            </p>
          </div>
          <button
            type="button"
            className="artist-quiz__start"
            onClick={() => setPhase("ready")}
          >
            Play again
          </button>
        </div>
      ) : mode === "soundtrack" && currentQuestion ? (
        <div className="franchise-quiz__soundtrack">
          <div className="artist-quiz__songs-head">
            Round {round + 1} / {questions.length}
          </div>
          <div className="artist-quiz__song-cards">
            {currentQuestion.choices.map((choice) => {
              const picked = pickedId === choice.id;
              const answer = currentQuestion.correct_id === choice.id;
              return (
                <button
                  type="button"
                  key={choice.id}
                  className={`artist-quiz__song-card${
                    pickedId
                      ? answer
                        ? " artist-quiz__song-card--correct"
                        : picked
                          ? " artist-quiz__song-card--wrong"
                          : ""
                      : ""
                  }`}
                  disabled={Boolean(pickedId)}
                  onClick={() => chooseSound(choice.id)}
                >
                  <span
                    className={`artist-quiz__song-cover franchise-quiz__sound-cover${
                      choice.cover_aspect === "portrait"
                        ? " franchise-quiz__sound-cover--portrait"
                        : ""
                    }`}
                  >
                    {choice.cover_url ? (
                      <img src={choice.cover_url} alt="" />
                    ) : (
                      <span className="artist-quiz__song-cover-ph">♪</span>
                    )}
                  </span>
                  <span className="artist-quiz__song-title">{choice.title}</span>
                  {choice.subtitle ? (
                    <span className="franchise-quiz__sound-subtitle">
                      {choice.subtitle}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="artist-quiz__panel artist-quiz__panel--scrollable">
          <div className="artist-quiz__chrome">
            <div className="artist-quiz__input-row">
              <input
                ref={inputRef}
                className="artist-quiz__guess-input"
                value={guess}
                placeholder={
                  mode === "catalog" ? "Type a title" : "Type an entry name"
                }
                onChange={(event) => {
                  const value = event.target.value;
                  setGuess(value);
                  processGuess(value);
                }}
              />
              {timeLimitMs ? (
                <span className="artist-quiz__timer-label">
                  {formatTime(Math.max(0, timeLimitMs - elapsedMs))}
                </span>
              ) : null}
              <button
                type="button"
                className="artist-quiz__finish"
                onClick={() => void finish(revealed.size)}
              >
                Finish
              </button>
            </div>
          </div>
          <div className="artist-quiz__scroll">
            {mode === "catalog" ? (
              <div className="artist-quiz__disco-grid franchise-quiz__catalog">
                {catalogColumns.map((column) => (
                  <div className="artist-quiz__disco-col" key={column.key}>
                    <h3 className="artist-quiz__release-title">{column.label}</h3>
                    {column.items.map((item) => {
                      const isRevealed = revealed.has(item.id);
                      return (
                        <div className="franchise-quiz__answer" key={item.id}>
                          <button
                            type="button"
                            className="artist-quiz__release-title-trigger artist-quiz__release-title-trigger--clickable"
                            disabled={!isRevealed}
                            onClick={() =>
                              setPreviewId((current) =>
                                current === item.id ? null : item.id
                              )
                            }
                          >
                            {isRevealed ? item.title : "—"}
                          </button>
                          {isRevealed &&
                          previewId === item.id &&
                          item.cover_url ? (
                            <button
                              type="button"
                              className="artist-quiz__release-cover-popover"
                              onClick={() => onOpenCatalogItem?.(item)}
                            >
                              <img src={item.cover_url} alt="" />
                              <span className="artist-quiz__release-cover-label">
                                Go to release
                              </span>
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : (
              <div className="franchise-quiz__encyclopedia">
                {encyclopedia.map((item) => {
                  const isRevealed = revealed.has(item.id);
                  const activeIndex = Math.min(
                    variantIndexes[item.id] || 0,
                    Math.max(0, item.variants.length - 1)
                  );
                  const variant = item.variants[activeIndex];
                  return (
                    <div className="franchise-quiz__answer" key={item.id}>
                      <span className="artist-quiz__track-num">
                        {item.number != null
                          ? String(item.number).padStart(4, "0")
                          : "—"}
                      </span>
                      <button
                        type="button"
                        disabled={!isRevealed}
                        className="artist-quiz__release-title-trigger artist-quiz__release-title-trigger--clickable"
                        onClick={() =>
                          setPreviewId((current) =>
                            current === item.id ? null : item.id
                          )
                        }
                      >
                        {isRevealed ? item.title : "—"}
                      </button>
                      {isRevealed && previewId === item.id && variant ? (
                        <div className="franchise-quiz__encyclopedia-popover">
                          <img src={variant.url} alt="" />
                          {item.variants.length > 1 ? (
                            <>
                              <button
                                type="button"
                                className="franchise-quiz__variant-nav franchise-quiz__variant-nav--prev"
                                aria-label="Previous image"
                                onClick={() =>
                                  setVariantIndexes((current) => ({
                                    ...current,
                                    [item.id]:
                                      (activeIndex - 1 + item.variants.length) %
                                      item.variants.length,
                                  }))
                                }
                              >
                                ‹
                              </button>
                              <button
                                type="button"
                                className="franchise-quiz__variant-nav franchise-quiz__variant-nav--next"
                                aria-label="Next image"
                                onClick={() =>
                                  setVariantIndexes((current) => ({
                                    ...current,
                                    [item.id]:
                                      (activeIndex + 1) % item.variants.length,
                                  }))
                                }
                              >
                                ›
                              </button>
                            </>
                          ) : null}
                          <span className="franchise-quiz__variant-title">
                            {variant.title}
                            <small>{variant.source_title}</small>
                          </span>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
      {audio.src ? (
        <audio ref={audio.audioRef} src={audio.src} preload="auto" />
      ) : null}
    </div>
  );
}
