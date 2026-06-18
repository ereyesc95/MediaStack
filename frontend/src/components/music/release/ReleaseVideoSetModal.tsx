import { useEffect, useMemo, useState } from "react";
import { fetchReleaseTracklist, saveTrackYoutube } from "../../../api";
import type { ReleaseTrackItem } from "../../../types";
import { trackDisplayTitle, trackMainTitle } from "./releaseTrackPanelMeta";
import ModalPortal from "../../ModalPortal";

type Props = {
  bandId: number;
  releaseId: string;
  artistName: string;
  onClose: () => void;
  onSaved: () => void;
};

function allTracks(
  editions: { groups: { tracks: ReleaseTrackItem[] }[] }[]
): ReleaseTrackItem[] {
  return editions.flatMap((ed) => ed.groups.flatMap((g) => g.tracks));
}

export default function ReleaseVideoSetModal({
  bandId,
  releaseId,
  artistName,
  onClose,
  onSaved,
}: Props) {
  const [tracks, setTracks] = useState<ReleaseTrackItem[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchReleaseTracklist(bandId, releaseId)
      .then((payload) => {
        if (cancelled) return;
        const list = allTracks(payload.editions);
        setTracks(list);
        const init: Record<string, string> = {};
        for (const track of list) {
          init[track.play_path] = track.youtube_url ?? "";
        }
        setUrls(init);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bandId, releaseId]);

  const changedCount = useMemo(
    () =>
      tracks.filter((track) => (urls[track.play_path] ?? "") !== (track.youtube_url ?? ""))
        .length,
    [tracks, urls]
  );

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      for (const track of tracks) {
        const next = (urls[track.play_path] ?? "").trim();
        const prev = (track.youtube_url ?? "").trim();
        if (next === prev) continue;
        await saveTrackYoutube({
          artist: artistName,
          title: trackMainTitle(track.title),
          play_path: track.play_path,
          youtube_url: next || null,
          band_id: bandId,
        });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="artist-word-cloud-modal__panel release-video-set-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="artist-word-cloud-modal__head">
          <h3>Set official videos</h3>
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
        {loading && <p className="muted">Loading tracks…</p>}

        {!loading && tracks.length > 0 && (
          <ul className="release-video-set-modal__list ms-scrollbar">
            {tracks.map((track) => (
              <li key={track.play_path} className="release-video-set-modal__item">
                <label className="release-video-set-modal__field">
                  <span className="release-video-set-modal__title">
                    {trackDisplayTitle(track.title)}
                  </span>
                  <input
                    type="text"
                    className="release-video-set-modal__input"
                    value={urls[track.play_path] ?? ""}
                    placeholder="YouTube URL or video ID"
                    onChange={(e) =>
                      setUrls((prev) => ({
                        ...prev,
                        [track.play_path]: e.target.value,
                      }))
                    }
                  />
                </label>
              </li>
            ))}
          </ul>
        )}

        <div className="modal-actions-row">
          <button
            type="button"
            className="btn"
            disabled={saving || loading || changedCount === 0}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving…" : changedCount > 0 ? `Save ${changedCount} change${changedCount === 1 ? "" : "s"}` : "Save"}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}
