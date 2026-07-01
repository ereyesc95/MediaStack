import type { ReleaseEdition, ReleaseTrackItem, SetlistTrackItem } from "../../../types";
import { ReleaseTrackTitle } from "../release/releaseTrackTitle";
import { TrackActionYoutubeIcon } from "../release/releaseTrackActionIcons";
import { trackDisplayTitle } from "../release/releaseTrackPanelMeta";

function TapeTrackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="4"
        y="6"
        width="16"
        height="12"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <circle cx="9" cy="12" r="2.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="15" cy="12" r="2.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M7 6V4.5A1.5 1.5 0 0 1 8.5 3h7A1.5 1.5 0 0 1 17 4.5V6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function youtubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

type Props = {
  editions: ReleaseEdition[];
  playingPath: string | null;
  setlistId: string;
  onPlay: (path: string, title: string, playbackKey: string) => void;
  onPanelTrack?: (track: ReleaseTrackItem) => void;
};

export default function SetlistTracklist({
  editions,
  playingPath,
  setlistId,
  onPlay,
  onPanelTrack,
}: Props) {
  return (
    <div className="release-tracklist setlist-tracklist">
      <div className="release-tracklist__body">
        <div className="release-tracklist__content">
          {editions.map((ed) => (
            <div key={ed.id} className="release-tracklist__edition-block">
              {ed.groups.map((group) => {
                const showGroupLabels = ed.groups.length > 1 || Boolean(group.label);
                return (
                  <div key={group.id} className="release-tracklist__group">
                    {showGroupLabels && group.label && (
                      <h3 className="release-tracklist__group-label">{group.label}</h3>
                    )}
                    <ol className="release-tracklist__tracks">
                      {(group.tracks as SetlistTrackItem[]).map((track) => {
                        const active = Boolean(track.play_path && playingPath === track.play_path);
                        const unavailable = Boolean(track.unavailable || !track.play_path);
                        const title = track.setlist_title ?? track.title;
                        const displayTitle = trackDisplayTitle(title);
                        return (
                          <li
                            key={track.id}
                            className={[
                              "release-tracklist__row",
                              active ? "active" : "",
                              unavailable ? "release-tracklist__row--unavailable" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          >
                            {unavailable ? (
                              <div className="release-tracklist__play release-tracklist__play--static">
                                <span className="release-tracklist__num">
                                  {track.is_tape ? (
                                    <TapeTrackIcon className="release-tracklist__tape-icon" />
                                  ) : (
                                    track.number ?? "·"
                                  )}
                                </span>
                                <span className="release-tracklist__title-wrap">
                                  <ReleaseTrackTitle title={title} />
                                </span>
                                {track.youtube_query ? (
                                  <a
                                    className="setlist-tracklist__youtube-link"
                                    href={youtubeSearchUrl(track.youtube_query)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`Search ${displayTitle} on YouTube`}
                                    title="Search on YouTube"
                                  >
                                    <TrackActionYoutubeIcon className="setlist-tracklist__youtube-icon" />
                                  </a>
                                ) : (
                                  <span className="release-tracklist__duration" aria-hidden />
                                )}
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="release-tracklist__play"
                                onClick={() => {
                                  if (!track.play_path) return;
                                  onPlay(
                                    track.play_path,
                                    track.title,
                                    `${setlistId}:${track.play_path}`
                                  );
                                  onPanelTrack?.(track);
                                }}
                                aria-label={`Play ${displayTitle}`}
                              >
                                <span className="release-tracklist__num">
                                  {track.is_tape ? (
                                    <TapeTrackIcon className="release-tracklist__tape-icon" />
                                  ) : (
                                    track.number ?? "·"
                                  )}
                                </span>
                                <span className="release-tracklist__title-wrap">
                                  <ReleaseTrackTitle title={title} />
                                </span>
                                {track.duration ? (
                                  <span className="release-tracklist__duration">{track.duration}</span>
                                ) : null}
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function flattenPlayableSetlistTracks(editions: ReleaseEdition[]): ReleaseTrackItem[] {
  const out: ReleaseTrackItem[] = [];
  for (const ed of editions) {
    for (const group of ed.groups) {
      for (const track of group.tracks) {
        if (track.play_path && !(track as SetlistTrackItem).unavailable) {
          out.push(track);
        }
      }
    }
  }
  return out;
}
