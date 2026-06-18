import { useMemo, useState } from "react";
import { saveTrackYoutube } from "../../../api";
import { trackDisplayTitle, trackMainTitle } from "./releaseTrackPanelMeta";
import ModalPortal from "../../ModalPortal";

export type YoutubeFetchItem = {
  title: string;
  play_path: string;
  edition_kind?: string;
  group_kind?: string;
  existing_url?: string | null;
  status: string;
  candidates: { url: string; label: string; source: string }[];
};

type Props = {
  bandId: number;
  artistName: string;
  items: YoutubeFetchItem[];
  onClose: () => void;
  onApplied: () => void;
};

export default function ReleaseVideoFetchModal({
  bandId,
  artistName,
  items,
  onClose,
  onApplied,
}: Props) {
  const reviewable = useMemo(
    () => items.filter((item) => item.status === "candidate" && item.candidates.length > 0),
    [items]
  );
  const skippedItems = useMemo(
    () => items.filter((item) => item.status === "skipped"),
    [items]
  );
  const [selections, setSelections] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const item of reviewable) {
      init[item.play_path] = item.candidates[0]?.url ?? "";
    }
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApplySelected() {
    setSaving(true);
    setError(null);
    try {
      for (const item of reviewable) {
        const url = selections[item.play_path];
        if (!url) continue;
        await saveTrackYoutube({
          artist: artistName,
          title: trackMainTitle(item.title),
          play_path: item.play_path,
          youtube_url: url,
          band_id: bandId,
        });
      }
      onApplied();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const notFound = items.filter((i) => i.status === "not_found").length;

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="artist-word-cloud-modal__panel release-video-fetch-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="artist-word-cloud-modal__head">
          <h3>Get videos</h3>
          <button
            type="button"
            className="artist-word-cloud-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {error && <p className="error">{error}</p>}

        <p className="muted release-video-fetch-modal__summary">
          {reviewable.length} to review · {skippedItems.length} already set · {notFound} not
          found on MusicBrainz
        </p>

        {skippedItems.length > 0 && (
          <section className="release-video-fetch-modal__section">
            <h4 className="release-video-fetch-modal__section-title">Already set</h4>
            <ul className="release-video-fetch-modal__skipped ms-scrollbar">
              {skippedItems.map((item) => (
                <li key={item.play_path}>
                  <span className="release-video-fetch-modal__skipped-title">
                    {trackDisplayTitle(item.title)}
                  </span>
                  {item.existing_url && (
                    <a
                      href={item.existing_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="release-video-fetch-modal__skipped-url"
                    >
                      {item.existing_url}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {reviewable.length === 0 ? (
          <p className="muted">
            No new candidates from MusicBrainz. Use Set video to add links manually.
          </p>
        ) : (
          <ul className="release-video-fetch-modal__list ms-scrollbar">
            {reviewable.map((item) => (
              <li key={item.play_path} className="release-video-fetch-modal__item">
                <div className="release-video-fetch-modal__title">
                  {trackDisplayTitle(item.title)}
                  {(item.group_kind === "single" || item.edition_kind === "single") && (
                    <span className="release-video-fetch-modal__badge">Single</span>
                  )}
                </div>
                <select
                  value={selections[item.play_path] ?? ""}
                  onChange={(e) =>
                    setSelections((prev) => ({
                      ...prev,
                      [item.play_path]: e.target.value,
                    }))
                  }
                >
                  {item.candidates.map((c) => (
                    <option key={c.url} value={c.url}>
                      {c.label} — {c.url}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}

        <div className="modal-actions-row">
          {reviewable.length > 0 && (
            <button
              type="button"
              className="btn"
              disabled={saving}
              onClick={() => void handleApplySelected()}
            >
              {saving
                ? "Saving…"
                : `Apply ${reviewable.length} video${reviewable.length === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
