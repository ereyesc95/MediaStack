/** Subtle accent glow + edge vignette above blurred art, below page content. */
export default function MediaBeatFx() {
  return (
    <div className="media-beat-fx" aria-hidden>
      <div className="media-beat-fx__glow" />
      <div className="media-beat-fx__vignette" />
    </div>
  );
}
