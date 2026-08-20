import { useCallback, useEffect, useState } from "react";
import { fetchWordCloud, prefetchWordCloud } from "../../../api";
import type { WordCloudPayload, WordCloudTerm } from "../../../types";
import {
  WORD_CLOUD_INVALIDATE_EVENT,
} from "../../../wordCloudInvalidation";
import { trackMainTitle } from "../release/releaseTrackPanelMeta";

type Props = {
  bandId: number;
  embedded?: boolean;
  onOpenRelease?: (bandId: number, releaseId: string) => void;
};

function formatTopicLabel(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export default function ArtistWordCloud({
  bandId,
  embedded = false,
  onOpenRelease,
}: Props) {
  const [data, setData] = useState<WordCloudPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [topicTerm, setTopicTerm] = useState<WordCloudTerm | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchWordCloud(bandId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [bandId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onInvalidate = (event: Event) => {
      const detail = (event as CustomEvent<{ bandId: number }>).detail;
      if (detail?.bandId === bandId) {
        void load();
      }
    };
    window.addEventListener(WORD_CLOUD_INVALIDATE_EVENT, onInvalidate);
    return () => {
      window.removeEventListener(WORD_CLOUD_INVALIDATE_EVENT, onInvalidate);
    };
  }, [bandId, load]);

  const build = async () => {
    setBuilding(true);
    setError(null);
    try {
      const res = await prefetchWordCloud(bandId);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBuilding(false);
    }
  };

  if (loading && !data) {
    return embedded ? <span className="muted artist-word-cloud__hint">…</span> : null;
  }

  const hint = (
    <p className="muted artist-word-cloud__hint">
      Open Lyrics on a few tracks to build the word cloud, or{" "}
      <button
        type="button"
        className="artist-word-cloud__hint-link"
        disabled={building}
        onClick={() => void build()}
      >
        {building ? "Building…" : "Build from cached lyrics"}
      </button>
      .
    </p>
  );

  const terms = data?.ready && data.terms.length > 0 ? data.terms : [];
  const topTerms = terms.slice(0, 5);
  const hasMore = terms.length > 5;

  const openTopic = (t: WordCloudTerm) => {
    setTopicTerm(t);
    setModalOpen(false);
  };

  const pills =
    terms.length > 0 ? (
      <div className="artist-word-cloud__pills">
        {topTerms.map((t) => (
          <button
            type="button"
            key={t.text}
            className="artist-about__pill artist-word-cloud__pill"
            title={`${t.count} mentions — view tracks`}
            onClick={() => openTopic(t)}
          >
            {formatTopicLabel(t.text)}
          </button>
        ))}
        {hasMore && (
          <button
            type="button"
            className="artist-about__pill artist-word-cloud__pill artist-word-cloud__pill--more"
            onClick={() => setModalOpen(true)}
          >
            See more +
          </button>
        )}
      </div>
    ) : (
      hint
    );

  const topicTracks = topicTerm?.tracks || [];
  const topicLabel = topicTerm ? formatTopicLabel(topicTerm.text) : "";

  const body = (
    <>
      {error && <p className="error">{error}</p>}
      {pills}
      {modalOpen && terms.length > 0 && (
        <div className="artist-word-cloud-modal" role="dialog" aria-modal="true">
          <div
            className="artist-word-cloud-modal__backdrop"
            onClick={() => setModalOpen(false)}
          />
          <div className="artist-word-cloud-modal__panel">
            <header className="artist-word-cloud-modal__head">
              <h3>Lyrics topics</h3>
              <button
                type="button"
                className="artist-word-cloud-modal__close"
                onClick={() => setModalOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </header>
            <div className="artist-word-cloud__canvas" aria-label="Lyrics word cloud">
              {terms.map((t) => (
                <button
                  type="button"
                  key={t.text}
                  className="artist-word-cloud__term artist-word-cloud__term--btn"
                  style={{ fontSize: `${0.82 + t.weight * 1.15}rem` }}
                  title={`${formatTopicLabel(t.text)} (${t.count})`}
                  onClick={() => openTopic(t)}
                >
                  {formatTopicLabel(t.text)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {topicTerm && (
        <div className="artist-word-cloud-modal" role="dialog" aria-modal="true">
          <div
            className="artist-word-cloud-modal__backdrop"
            onClick={() => setTopicTerm(null)}
          />
          <div className="artist-word-cloud-modal__panel artist-topic-tracks-panel">
            <header className="artist-word-cloud-modal__head">
              <h3>Tracks tagged “{topicLabel}”</h3>
              <button
                type="button"
                className="artist-word-cloud-modal__close"
                onClick={() => setTopicTerm(null)}
                aria-label="Close"
              >
                ×
              </button>
            </header>
            {topicTracks.length === 0 ? (
              <p className="muted artist-word-cloud__hint">
                No local tracks linked to this topic yet (lyrics may be from
                cache only).
              </p>
            ) : (
              <ul className="artist-topic-tracks">
                {topicTracks.map((tr) => {
                  const canGo =
                    Boolean(tr.release_id) && Boolean(onOpenRelease);
                  return (
                    <li key={tr.play_path}>
                      <button
                        type="button"
                        className="artist-topic-tracks__row"
                        disabled={!canGo}
                        onClick={() => {
                          if (canGo && tr.release_id) {
                            onOpenRelease?.(
                              tr.navigate_band_id ?? bandId,
                              tr.release_id
                            );
                            setTopicTerm(null);
                          }
                        }}
                      >
                        <span className="artist-topic-tracks__title">
                          {trackMainTitle(tr.title)}
                        </span>
                        {tr.release_title ? (
                          <span className="artist-topic-tracks__album muted">
                            {tr.release_title}
                          </span>
                        ) : null}
                        {canGo ? (
                          <span className="artist-topic-tracks__go">
                            Go to release
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );

  if (embedded) {
    return <div className="artist-word-cloud artist-word-cloud--embedded">{body}</div>;
  }

  return (
    <section className="artist-word-cloud">
      <div className="artist-word-cloud__head">
        <h3 className="artist-word-cloud__title">Topics</h3>
      </div>
      {body}
    </section>
  );
}
