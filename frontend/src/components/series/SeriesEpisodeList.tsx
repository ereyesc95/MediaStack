import { useEffect, useMemo, useRef, useState } from "react";
import type { SeriesEpisodeItem } from "../../types";
import { formatTrackDate } from "../../formatDate";

type Props = {
  episodes: SeriesEpisodeItem[];
  emptyLabel?: string;
  onSelect?: (ep: SeriesEpisodeItem) => void;
  /** When true, show release date before duration (movies / specials). */
  showReleaseDate?: boolean;
  /** Highlight the last-clicked / active episode row. */
  activeId?: string | null;
  /** Default hover action text when episode has no duration (link rows). */
  hoverActionLabel?: string;
  /** Episode id → tags (as typed). */
  tagsByEpisode?: Record<string, string[]>;
  /** Show-local suggestions for the add popover. */
  suggestedTags?: string[];
  isAdmin?: boolean;
  onTagsChange?: (episodeId: string, tags: string[]) => void;
};

const MAX_TAGS = 3;

function openEpisode(ep: SeriesEpisodeItem) {
  const url = ep.open_url?.trim();
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

function tagKey(t: string) {
  return t.trim().toLowerCase();
}

export default function SeriesEpisodeList({
  episodes,
  emptyLabel = "No episode video files in this season folder.",
  onSelect,
  showReleaseDate = false,
  activeId = null,
  hoverActionLabel = "Watch episode",
  tagsByEpisode = {},
  suggestedTags = [],
  isAdmin = false,
  onTagsChange,
}: Props) {
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addingFor) {
      inputRef.current?.focus();
    }
  }, [addingFor]);

  const suggestionPool = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of suggestedTags) {
      const k = tagKey(t);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(t);
    }
    return out;
  }, [suggestedTags]);

  if (!episodes.length) {
    return (
      <p className="muted release-tracklist__edition-empty">{emptyLabel}</p>
    );
  }

  function commitAdd(epId: string, current: string[]) {
    const cleaned = draft.trim().replace(/\s+/g, " ");
    if (!cleaned || !onTagsChange) {
      setAddingFor(null);
      setDraft("");
      return;
    }
    if (cleaned.length > 32) {
      window.alert("Tags are limited to 32 characters.");
      return;
    }
    if (
      !/^[A-Za-z0-9](?:[A-Za-z0-9\- ]{0,30}[A-Za-z0-9])?$|^[A-Za-z0-9]$/.test(
        cleaned
      )
    ) {
      window.alert(
        "Tags may only use letters, numbers, hyphens, and spaces."
      );
      return;
    }
    if (current.length >= MAX_TAGS) {
      setAddingFor(null);
      setDraft("");
      return;
    }
    const k = tagKey(cleaned);
    if (current.some((t) => tagKey(t) === k)) {
      setAddingFor(null);
      setDraft("");
      return;
    }
    onTagsChange(epId, [...current, cleaned]);
    setAddingFor(null);
    setDraft("");
  }

  return (
    <div className="release-tracklist__content series-episode-list">
      <ul className="release-tracklist__tracks series-episode-list__tracks">
        {episodes.map((ep, index) => {
          const num =
            ep.number != null
              ? ep.number
              : showReleaseDate
                ? index + 1
                : "–";
          const dateLabel =
            showReleaseDate ||
            ep.kind === "movie" ||
            Boolean(ep.display_date || ep.date_iso)
              ? ep.display_date || formatTrackDate(ep.date_iso)
              : null;
          const canOpen = Boolean(ep.open_url?.trim());
          const active = Boolean(activeId && activeId === ep.id);
          const isLinkRow =
            ep.source === "remote" ||
            ep.open_mode === "tab" ||
            (!ep.duration && canOpen);
          const actionLabel =
            ep.hover_label?.trim() || (isLinkRow ? hoverActionLabel : null);
          const tags = tagsByEpisode[ep.id] || [];
          const canAdd =
            isAdmin && Boolean(onTagsChange) && tags.length < MAX_TAGS;
          const filteredSuggestions = suggestionPool.filter(
            (s) => !tags.some((t) => tagKey(t) === tagKey(s))
          );

          return (
            <li key={ep.id} className="series-episode-list__item">
              <div
                className={`release-tracklist__row series-episode-list__row${
                  active ? " active" : ""
                }${canOpen ? "" : " series-episode-list__row--unavailable"}${
                  actionLabel ? " series-episode-list__row--link-action" : ""
                }`}
              >
                <div className="series-episode-list__main-line">
                  <button
                    type="button"
                    className="series-episode-list__main"
                    onClick={() => {
                      onSelect?.(ep);
                      if (canOpen) openEpisode(ep);
                    }}
                    title={
                      canOpen
                        ? actionLabel
                          ? `${actionLabel}: ${ep.title}`
                          : `Open ${ep.title}`
                        : `${ep.title} (file not linked)`
                    }
                    disabled={!canOpen && !onSelect}
                  >
                    <span className="release-tracklist__num series-episode-list__num">
                      {num}
                    </span>
                    <span className="release-tracklist__title series-episode-list__title">
                      {ep.title}
                      {(ep as { video_suffix?: string | null }).video_suffix ? (
                        <span className="release-tracklist__video-badge">
                          {(ep as { video_suffix?: string }).video_suffix}
                        </span>
                      ) : null}
                    </span>
                  </button>
                  <span className="series-episode-list__trailing">
                    {dateLabel ? (
                      <span className="series-episode-list__date">
                        {dateLabel}
                      </span>
                    ) : null}
                    {tags.length > 0 ? (
                      <span className="series-episode-list__tags">
                        {tags.map((t) => (
                          <button
                            key={`${ep.id}-${tagKey(t)}`}
                            type="button"
                            className={`series-episode-list__tag${
                              isAdmin && onTagsChange
                                ? " series-episode-list__tag--editable"
                                : ""
                            }`}
                            title={
                              isAdmin && onTagsChange ? `Remove “${t}”` : t
                            }
                            onClick={() => {
                              if (!isAdmin || !onTagsChange) return;
                              onTagsChange(
                                ep.id,
                                tags.filter((x) => tagKey(x) !== tagKey(t))
                              );
                            }}
                          >
                            {t}
                          </button>
                        ))}
                      </span>
                    ) : null}
                    {canAdd ? (
                      addingFor === ep.id ? (
                        <span className="series-episode-list__tag-add-wrap">
                          <input
                            ref={inputRef}
                            className="series-episode-list__tag-input"
                            value={draft}
                            maxLength={32}
                            placeholder="Tag…"
                            list={`ep-tag-suggest-${ep.id}`}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                commitAdd(ep.id, tags);
                              } else if (e.key === "Escape") {
                                setAddingFor(null);
                                setDraft("");
                              }
                            }}
                            onBlur={() => {
                              window.setTimeout(() => {
                                if (draft.trim()) commitAdd(ep.id, tags);
                                else {
                                  setAddingFor(null);
                                  setDraft("");
                                }
                              }, 120);
                            }}
                          />
                          <datalist id={`ep-tag-suggest-${ep.id}`}>
                            {filteredSuggestions.map((s) => (
                              <option key={s} value={s} />
                            ))}
                          </datalist>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="series-episode-list__tag-add"
                          title="Add tag"
                          onClick={() => {
                            setAddingFor(ep.id);
                            setDraft("");
                          }}
                        >
                          +
                        </button>
                      )
                    ) : null}
                    {actionLabel ? (
                      <>
                        <span className="release-tracklist__duration release-tracklist__duration--empty series-episode-list__duration-idle">
                          {ep.duration || "–"}
                        </span>
                        <span className="series-episode-list__hover-action">
                          {actionLabel}
                        </span>
                      </>
                    ) : ep.duration ? (
                      <span className="release-tracklist__duration">
                        {ep.duration}
                      </span>
                    ) : (
                      <span className="release-tracklist__duration release-tracklist__duration--empty">
                        –
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
