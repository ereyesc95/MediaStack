import { useEffect, useRef, useState } from "react";
import ModalPortal from "./ModalPortal";
import {
  clearNowPlaying,
  setNowPlaying,
  type NowPlayingInfo,
} from "../mediaSession";
import {
  getLocalVideoOpener,
  setLocalVideoOpener,
  type LocalVideoRequest,
} from "../utils/videoMedia";

/**
 * In-app fullscreen player for local music videos so Media Session can show
 * title/artist/artwork instead of a raw browser tab.
 */
export default function LocalVideoPlayerHost() {
  const [req, setReq] = useState<LocalVideoRequest | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const reqRef = useRef<LocalVideoRequest | null>(null);
  reqRef.current = req;

  useEffect(() => {
    const prev = getLocalVideoOpener();
    setLocalVideoOpener((next) => setReq(next));
    return () => setLocalVideoOpener(prev);
  }, []);

  useEffect(() => {
    if (!req) {
      clearNowPlaying();
      return;
    }
    const publish = (el: HTMLVideoElement | null) => {
      if (!el) return;
      const info: NowPlayingInfo = {
        title: req.title || "Video",
        artist: req.artist || null,
        album: req.album || null,
        artworkUrl: req.artworkUrl || null,
      };
      setNowPlaying(info, {
        element: el,
        handlers: {
          play: () => void el.play().catch(() => {}),
          pause: () => el.pause(),
          seekTo: (seconds) => {
            el.currentTime = seconds;
          },
        },
      });
    };
    publish(videoRef.current);
    return () => {
      clearNowPlaying();
    };
  }, [req]);

  if (!req) return null;

  return (
    <ModalPortal onClose={() => setReq(null)}>
      <div
        className="local-video-player"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="local-video-player__close"
          aria-label="Close"
          onClick={() => setReq(null)}
        >
          ×
        </button>
        <video
          ref={(el) => {
            videoRef.current = el;
            if (!el || !reqRef.current) return;
            const info: NowPlayingInfo = {
              title: reqRef.current.title || "Video",
              artist: reqRef.current.artist || null,
              album: reqRef.current.album || null,
              artworkUrl: reqRef.current.artworkUrl || null,
            };
            setNowPlaying(info, {
              element: el,
              handlers: {
                play: () => void el.play().catch(() => {}),
                pause: () => el.pause(),
                seekTo: (seconds) => {
                  el.currentTime = seconds;
                },
              },
            });
          }}
          className="local-video-player__video"
          src={req.url}
          controls
          autoPlay
          playsInline
        />
        <div className="local-video-player__meta">
          <p className="local-video-player__title">{req.title || "Video"}</p>
          {req.artist ? (
            <p className="local-video-player__artist">{req.artist}</p>
          ) : null}
        </div>
      </div>
    </ModalPortal>
  );
}
