import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { TrackYoutubeVideo } from "../../types";
import {
  openTrackVideo,
  trackYoutubeVideos,
  videoDateMeta,
  videoOpenUrl,
} from "../../utils/videoMedia";
import { TrackActionYoutubeIcon } from "./release/releaseTrackActionIcons";

export { trackYoutubeVideos };

type Props = {
  videos: TrackYoutubeVideo[];
  className?: string;
  onBeforeOpen?: () => void;
};

export default function TrackYoutubeButton({
  videos,
  className,
  onBeforeOpen,
}: Props) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      const target = event.target as Node;
      if (wrapRef.current && !wrapRef.current.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  useEffect(() => {
    if (!open || !btnRef.current || !panelRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const panelWidth = panelRef.current.offsetWidth;
    const left = Math.min(
      Math.max(8, rect.left),
      Math.max(8, window.innerWidth - panelWidth - 8)
    );
    setPanelStyle({
      position: "fixed",
      top: rect.bottom + 4,
      left,
      zIndex: 6000,
    });
  }, [open, videos]);

  if (videos.length === 0) return null;

  const openUrl = (video: TrackYoutubeVideo) => {
    setOpen(false);
    openTrackVideo(videoOpenUrl(video), onBeforeOpen);
  };

  return (
    <div
      ref={wrapRef}
      className={["release-tracklist__youtube-wrap", className].filter(Boolean).join(" ")}
    >
      <button
        ref={btnRef}
        type="button"
        className="release-tracklist__youtube-btn"
        data-tooltip={videos.length > 1 ? "Choose video" : "Official video"}
        aria-label={videos.length > 1 ? "Choose video" : "Official video"}
        aria-expanded={videos.length > 1 ? open : undefined}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (videos.length <= 1) {
            openUrl(videos[0]!);
            return;
          }
          setOpen((v) => !v);
        }}
      >
        <TrackActionYoutubeIcon className="release-tracklist__youtube-icon" />
      </button>
      {videos.length > 1 && open && (
        <div
          ref={panelRef}
          className="release-tracklist__youtube-picker"
          role="menu"
          style={panelStyle}
        >
          {videos.map((video, index) => {
            const metaParts = [
              (video.director ?? "").trim(),
              videoDateMeta(video),
            ].filter(Boolean);
            return (
              <button
                key={`${videoOpenUrl(video)}-${index}`}
                type="button"
                className="release-tracklist__youtube-picker-item"
                role="menuitem"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openUrl(video);
                }}
              >
                <span className="release-tracklist__youtube-picker-label">
                  {video.label}
                </span>
                {metaParts.length > 0 ? (
                  <span className="release-tracklist__youtube-picker-meta">
                    {metaParts.join(" · ")}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
