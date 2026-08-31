import { useEffect, useState } from "react";
import {
  fetchSeriesRemote,
  saveSeriesRemote,
  type RemoteSeriesSeasonPayload,
} from "../../api";
import ModalPortal from "../ModalPortal";

type EpisodeDraft = {
  key: string;
  number: string;
  title: string;
  date_iso: string;
  url: string;
};

type SeasonDraft = {
  key: string;
  title: string;
  date_iso: string;
  episodes: EpisodeDraft[];
};

type Props = {
  folderPath: string;
  title?: string;
  onClose: () => void;
  onSaved: () => void;
};

let draftKey = 0;
function nextKey(prefix: string) {
  draftKey += 1;
  return `${prefix}_${draftKey}`;
}

function emptyEpisode(): EpisodeDraft {
  return { key: nextKey("ep"), number: "", title: "", date_iso: "", url: "" };
}

function emptySeason(title = ""): SeasonDraft {
  return {
    key: nextKey("sea"),
    title,
    date_iso: "",
    episodes: [emptyEpisode()],
  };
}

function EpisodeRows({
  episodes,
  onChange,
  onRemove,
}: {
  episodes: EpisodeDraft[];
  onChange: (epKey: string, patch: Partial<EpisodeDraft>) => void;
  onRemove: (epKey: string) => void;
}) {
  return (
    <div className="release-video-set-modal__videos">
      {episodes.map((ep, epIdx) => (
        <div key={ep.key} className="release-video-set-modal__video-row">
          <input
            type="text"
            className="release-video-set-modal__meta-input remote-media-modal__num"
            value={ep.number}
            placeholder={String(epIdx + 1)}
            aria-label="Episode number"
            onChange={(e) => onChange(ep.key, { number: e.target.value })}
          />
          <input
            type="text"
            className="release-video-set-modal__label-input remote-media-modal__ep-title"
            value={ep.title}
            placeholder="Episode title"
            onChange={(e) => onChange(ep.key, { title: e.target.value })}
          />
          <input
            type="date"
            className="release-video-set-modal__meta-input release-video-set-modal__meta-input--date remote-media-modal__date"
            value={ep.date_iso}
            aria-label="Episode date"
            onChange={(e) => onChange(ep.key, { date_iso: e.target.value })}
          />
          <input
            type="text"
            className="release-video-set-modal__input"
            value={ep.url}
            placeholder="Episode URL"
            onChange={(e) => onChange(ep.key, { url: e.target.value })}
          />
          {episodes.length > 1 ? (
            <button
              type="button"
              className="release-video-set-modal__icon-btn release-video-set-modal__icon-btn--remove"
              title="Remove episode"
              aria-label="Remove episode"
              onClick={() => onRemove(ep.key)}
            >
              ×
            </button>
          ) : (
            <span className="release-video-set-modal__row-spacer" aria-hidden />
          )}
        </div>
      ))}
    </div>
  );
}

export default function RemoteSeriesEpisodesModal({
  folderPath,
  onClose,
  onSaved,
}: Props) {
  const [seasons, setSeasons] = useState<SeasonDraft[]>([emptySeason()]);
  const [specials, setSpecials] = useState<SeasonDraft | null>(null);
  const [extras, setExtras] = useState<SeasonDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchSeriesRemote(folderPath)
      .then((data) => {
        if (cancelled) return;
        const regular: SeasonDraft[] = [];
        let specialsDraft: SeasonDraft | null = null;
        let extrasDraft: SeasonDraft | null = null;
        for (const s of data.seasons || []) {
          const draft: SeasonDraft = {
            key: nextKey("sea"),
            title: s.title || "",
            date_iso: (s.date_iso || "").slice(0, 10),
            episodes: (s.episodes || []).length
              ? (s.episodes || []).map((ep) => ({
                  key: nextKey("ep"),
                  number:
                    ep.number != null && ep.number > 0 ? String(ep.number) : "",
                  title: ep.title || "",
                  date_iso: (ep.date_iso || "").slice(0, 10),
                  url: ep.url || "",
                }))
              : [emptyEpisode()],
          };
          const t = (s.title || "").toLowerCase();
          if (s.is_specials || t === "specials") {
            specialsDraft = { ...draft, title: "Specials" };
          } else if (t === "extras") {
            extrasDraft = { ...draft, title: "Extras" };
          } else {
            regular.push(draft);
          }
        }
        setSeasons(regular.length ? regular : [emptySeason()]);
        setSpecials(specialsDraft);
        setExtras(extrasDraft);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setSeasons([emptySeason()]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [folderPath]);

  const updateSeason = (key: string, patch: Partial<SeasonDraft>) => {
    setSeasons((prev) =>
      prev.map((s) => (s.key === key ? { ...s, ...patch } : s))
    );
  };

  const updateEpisode = (
    target: "season" | "specials" | "extras",
    seasonKey: string,
    epKey: string,
    patch: Partial<EpisodeDraft>
  ) => {
    const mapEps = (s: SeasonDraft) => ({
      ...s,
      episodes: s.episodes.map((ep) =>
        ep.key === epKey ? { ...ep, ...patch } : ep
      ),
    });
    if (target === "specials") {
      setSpecials((s) => (s ? mapEps(s) : s));
      return;
    }
    if (target === "extras") {
      setExtras((s) => (s ? mapEps(s) : s));
      return;
    }
    setSeasons((prev) =>
      prev.map((s) => (s.key === seasonKey ? mapEps(s) : s))
    );
  };

  const toPayloadSeason = (
    s: SeasonDraft,
    opts?: { is_specials?: boolean }
  ): RemoteSeriesSeasonPayload | null => {
    const titleText = s.title.trim();
    if (!titleText) return null;
    const dateIso = s.date_iso.trim();
    if (!dateIso) {
      throw new Error(`Season "${titleText}" requires a date`);
    }
    const episodes = s.episodes
      .map((ep, i) => {
        const epTitle = ep.title.trim();
        const url = ep.url.trim();
        if (!epTitle || !url) return null;
        const num = ep.number.trim() ? Number(ep.number) : i + 1;
        return {
          number: Number.isFinite(num) && num > 0 ? num : i + 1,
          title: epTitle,
          date_iso: ep.date_iso.trim() || null,
          url,
        };
      })
      .filter(Boolean) as NonNullable<RemoteSeriesSeasonPayload["episodes"]>;
    return {
      title: titleText,
      date_iso: dateIso,
      is_specials: Boolean(opts?.is_specials),
      episodes,
    };
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload: RemoteSeriesSeasonPayload[] = [];
      for (const s of seasons) {
        const row = toPayloadSeason(s);
        if (row) {
          row.sort_order = payload.length;
          payload.push(row);
        }
      }
      if (specials) {
        const row = toPayloadSeason(
          { ...specials, title: specials.title.trim() || "Specials" },
          { is_specials: true }
        );
        if (row) {
          row.sort_order = payload.length;
          payload.push(row);
        }
      }
      if (extras) {
        const row = toPayloadSeason({
          ...extras,
          title: extras.title.trim() || "Extras",
        });
        if (row) {
          row.sort_order = payload.length;
          payload.push(row);
        }
      }
      await saveSeriesRemote(folderPath, payload);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const renderSeasonBlock = (
    season: SeasonDraft,
    kind: "season" | "specials" | "extras",
    index?: number
  ) => (
    <li key={season.key} className="release-video-set-modal__item">
      <div className="release-video-set-modal__track-head">
        <div className="release-video-set-modal__title-row remote-media-modal__season-head">
          <input
            type="text"
            className="release-video-set-modal__label-input remote-media-modal__season-title"
            placeholder={
              kind === "specials"
                ? "Specials"
                : kind === "extras"
                  ? "Extras"
                  : `Season ${(index ?? 0) + 1} title`
            }
            value={season.title}
            onChange={(e) => {
              if (kind === "specials") {
                setSpecials({ ...season, title: e.target.value });
              } else if (kind === "extras") {
                setExtras({ ...season, title: e.target.value });
              } else {
                updateSeason(season.key, { title: e.target.value });
              }
            }}
          />
          <input
            type="date"
            className="release-video-set-modal__meta-input release-video-set-modal__meta-input--date remote-media-modal__date"
            value={season.date_iso}
            aria-label="Season date"
            onChange={(e) => {
              if (kind === "specials") {
                setSpecials({ ...season, date_iso: e.target.value });
              } else if (kind === "extras") {
                setExtras({ ...season, date_iso: e.target.value });
              } else {
                updateSeason(season.key, { date_iso: e.target.value });
              }
            }}
          />
          <button
            type="button"
            className="btn ghost remote-media-modal__add-episode"
            onClick={() => {
              const next = {
                ...season,
                episodes: [...season.episodes, emptyEpisode()],
              };
              if (kind === "specials") setSpecials(next);
              else if (kind === "extras") setExtras(next);
              else updateSeason(season.key, { episodes: next.episodes });
            }}
          >
            Add episode
          </button>
          {kind === "season" && seasons.length > 1 ? (
            <button
              type="button"
              className="release-video-set-modal__icon-btn release-video-set-modal__icon-btn--remove"
              title="Remove season"
              aria-label="Remove season"
              onClick={() =>
                setSeasons((prev) => prev.filter((s) => s.key !== season.key))
              }
            >
              ×
            </button>
          ) : kind !== "season" ? (
            <button
              type="button"
              className="release-video-set-modal__icon-btn release-video-set-modal__icon-btn--remove"
              title={`Remove ${kind}`}
              aria-label={`Remove ${kind}`}
              onClick={() =>
                kind === "specials" ? setSpecials(null) : setExtras(null)
              }
            >
              ×
            </button>
          ) : null}
        </div>
      </div>
      <EpisodeRows
        episodes={season.episodes}
        onChange={(epKey, patch) =>
          updateEpisode(kind, season.key, epKey, patch)
        }
        onRemove={(epKey) => {
          const next = {
            ...season,
            episodes: season.episodes.filter((x) => x.key !== epKey),
          };
          if (kind === "specials") setSpecials(next);
          else if (kind === "extras") setExtras(next);
          else updateSeason(season.key, { episodes: next.episodes });
        }}
      />
    </li>
  );

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="artist-word-cloud-modal__panel release-video-set-modal remote-media-modal remote-media-modal--wide"
        role="dialog"
        aria-labelledby="remote-series-modal-title"
      >
        <div className="artist-word-cloud-modal__head">
          <h2 id="remote-series-modal-title">Set episodes</h2>
          <button
            type="button"
            className="modal-close-x"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {loading ? <p className="muted">Loading…</p> : null}
        {!loading ? (
          <ul className="release-video-set-modal__list ms-scrollbar">
            {seasons.map((season, sIdx) =>
              renderSeasonBlock(season, "season", sIdx)
            )}
            {specials ? renderSeasonBlock(specials, "specials") : null}
            {extras ? renderSeasonBlock(extras, "extras") : null}
          </ul>
        ) : null}
        <div className="modal-actions-row remote-media-modal__actions">
          <div className="remote-media-modal__action-group">
            <button
              type="button"
              className="btn ghost"
              disabled={saving || loading}
              onClick={() => setSeasons((prev) => [...prev, emptySeason()])}
            >
              Add season
            </button>
            {!specials ? (
              <button
                type="button"
                className="btn ghost"
                disabled={saving || loading}
                onClick={() => setSpecials(emptySeason("Specials"))}
              >
                Specials
              </button>
            ) : null}
            {!extras ? (
              <button
                type="button"
                className="btn ghost"
                disabled={saving || loading}
                onClick={() => setExtras(emptySeason("Extras"))}
              >
                Extras
              </button>
            ) : null}
          </div>
          <button
            type="button"
            className="btn"
            disabled={saving || loading}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}
