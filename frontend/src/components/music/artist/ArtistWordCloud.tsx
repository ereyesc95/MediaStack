import { useCallback, useEffect, useState } from "react";
import { fetchWordCloud, prefetchWordCloud } from "../../../api";
import type { WordCloudPayload } from "../../../types";

type Props = {
  bandId: number;
  embedded?: boolean;
};

export default function ArtistWordCloud({ bandId, embedded = false }: Props) {
  const [data, setData] = useState<WordCloudPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const cloud =
    data?.ready && data.terms.length > 0 ? (
      <div className="artist-word-cloud__canvas" aria-label="Lyrics word cloud">
        {data.terms.map((t) => (
          <span
            key={t.text}
            className="artist-word-cloud__term"
            style={{ fontSize: `${0.72 + t.weight * 1.1}rem` }}
            title={`${t.text} (${t.count})`}
          >
            {t.text}
          </span>
        ))}
      </div>
    ) : (
      hint
    );

  if (embedded) {
    return (
      <div className="artist-word-cloud artist-word-cloud--embedded">
        {error && <p className="error">{error}</p>}
        {cloud}
      </div>
    );
  }

  return (
    <section className="artist-word-cloud">
      <div className="artist-word-cloud__head">
        <h3 className="artist-word-cloud__title">Topics</h3>
      </div>
      {error && <p className="error">{error}</p>}
      {cloud}
    </section>
  );
}
