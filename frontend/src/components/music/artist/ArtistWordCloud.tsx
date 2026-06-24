import { useCallback, useEffect, useState } from "react";
import { fetchWordCloud, prefetchWordCloud } from "../../../api";
import type { WordCloudPayload } from "../../../types";
import {
  WORD_CLOUD_INVALIDATE_EVENT,
} from "../../../wordCloudInvalidation";

type Props = {
  bandId: number;
  embedded?: boolean;
};

function formatTopicLabel(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export default function ArtistWordCloud({ bandId, embedded = false }: Props) {
  const [data, setData] = useState<WordCloudPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

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

  const pills =
    terms.length > 0 ? (
      <div className="artist-word-cloud__pills">
        {topTerms.map((t) => (
          <span
            key={t.text}
            className="artist-about__pill artist-word-cloud__pill"
            title={`${t.count} mentions`}
          >
            {formatTopicLabel(t.text)}
          </span>
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
                <span
                  key={t.text}
                  className="artist-word-cloud__term"
                  style={{ fontSize: `${0.82 + t.weight * 1.15}rem` }}
                  title={`${formatTopicLabel(t.text)} (${t.count})`}
                >
                  {formatTopicLabel(t.text)}
                </span>
              ))}
            </div>
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
