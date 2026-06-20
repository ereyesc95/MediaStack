import { useEffect, useMemo, useState } from "react";
import { fetchReleaseTracklist, saveTrackLyrics } from "../../../api";
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

type PendingLrc = {
  content: string;
  fileName: string;
};

type UniqueTrack = {
  id: string;
  title: string;
  mainTitle: string;
  paths: string[];
  has_synced_lrc: boolean;
};

function allTracks(
  editions: { groups: { tracks: ReleaseTrackItem[] }[] }[]
): ReleaseTrackItem[] {
  return editions.flatMap((ed) => ed.groups.flatMap((g) => g.tracks));
}

function uniqueTracksByMainTitle(tracks: ReleaseTrackItem[]): UniqueTrack[] {
  const byKey = new Map<string, UniqueTrack>();
  for (const track of tracks) {
    const mainTitle = trackMainTitle(track.title);
    const key = mainTitle.toLowerCase();
    const existing = byKey.get(key);
    if (existing) {
      existing.paths.push(track.play_path);
      existing.has_synced_lrc =
        existing.has_synced_lrc || Boolean(track.has_synced_lrc);
    } else {
      byKey.set(key, {
        id: key,
        title: trackDisplayTitle(track.title),
        mainTitle,
        paths: [track.play_path],
        has_synced_lrc: Boolean(track.has_synced_lrc),
      });
    }
  }
  return [...byKey.values()];
}

function plainFromLrc(raw: string): string {
  return raw
    .replace(/\[[^\]]+\]/g, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function hasLrcTimestamps(raw: string): boolean {
  return /\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/.test(raw);
}

export default function ReleaseLyricsSetModal({
  bandId,
  releaseId,
  artistName,
  onClose,
  onSaved,
}: Props) {
  const [tracks, setTracks] = useState<UniqueTrack[]>([]);
  const [pending, setPending] = useState<Record<string, PendingLrc>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchReleaseTracklist(bandId, releaseId)
      .then((payload) => {
        if (cancelled) return;
        setTracks(uniqueTracksByMainTitle(allTracks(payload.editions)));
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

  const changedCount = useMemo(() => Object.keys(pending).length, [pending]);

  async function handleFileChange(track: UniqueTrack, file: File | null) {
    if (!file) {
      setPending((prev) => {
        const next = { ...prev };
        delete next[track.id];
        return next;
      });
      return;
    }
    try {
      const content = (await file.text()).trim();
      if (!content) {
        setError("The selected file is empty.");
        return;
      }
      if (!hasLrcTimestamps(content)) {
        setError("LRC files must include timestamps like [00:12.34].");
        return;
      }
      setError(null);
      setPending((prev) => ({
        ...prev,
        [track.id]: { content, fileName: file.name },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleSave() {
    if (!changedCount) return;
    setSaving(true);
    setError(null);
    try {
      for (const track of tracks) {
        const item = pending[track.id];
        if (!item) continue;
        const plain = plainFromLrc(item.content);
        if (!plain) {
          throw new Error(`Could not read lyrics from ${item.fileName}.`);
        }
        for (const playPath of track.paths) {
          await saveTrackLyrics({
            artist: artistName,
            title: track.mainTitle,
            play_path: playPath,
            lyrics: plain,
            synced_lyrics: item.content,
            band_id: bandId,
          });
        }
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
        className="artist-word-cloud-modal__panel release-lyrics-set-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="artist-word-cloud-modal__head">
          <h3>Set Synced Lyrics</h3>
          <button
            type="button"
            className="artist-word-cloud-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <p className="release-lyrics-set-modal__hint muted">
          Upload one .lrc file per song. Find more synced lyrics{" "}
          <a
            href="https://lrclib.net"
            target="_blank"
            rel="noopener noreferrer"
            className="lyrics-source-link"
          >
            <strong>here</strong>
          </a>
          .
        </p>

        {error && <p className="error">{error}</p>}
        {loading && <p className="muted">Loading tracks…</p>}

        {!loading && tracks.length > 0 && (
          <ul className="release-lyrics-set-modal__list ms-scrollbar">
            {tracks.map((track) => {
              const queued = pending[track.id];
              return (
                <li key={track.id} className="release-lyrics-set-modal__item">
                  <div className="release-lyrics-set-modal__row">
                    <span className="release-lyrics-set-modal__title">
                      {track.title}
                    </span>
                    {track.has_synced_lrc && !queued && (
                      <span className="lyrics-status-badge lyrics-status-badge--synced">
                        Synced
                      </span>
                    )}
                    {queued && (
                      <span className="lyrics-status-badge lyrics-status-badge--queued">
                        Ready
                      </span>
                    )}
                  </div>
                  <label className="release-lyrics-set-modal__file">
                    <span className="release-lyrics-set-modal__file-label">
                      {queued ? queued.fileName : "Choose .lrc file"}
                    </span>
                    <input
                      type="file"
                      accept=".lrc,text/plain"
                      className="release-lyrics-set-modal__file-input"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        void handleFileChange(track, file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        <div className="modal-actions-row">
          <button
            type="button"
            className="btn"
            disabled={saving || loading || changedCount === 0}
            onClick={() => void handleSave()}
          >
            {saving
              ? "Saving…"
              : changedCount > 0
                ? `Save ${changedCount} file${changedCount === 1 ? "" : "s"}`
                : "Save"}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}
