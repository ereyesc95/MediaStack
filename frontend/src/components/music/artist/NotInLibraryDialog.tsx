import ModalPortal from "../../ModalPortal";

type Props = {
  name: string;
  urls: Record<string, string>;
  onClose: () => void;
};

export default function NotInLibraryDialog({ name, urls, onClose }: Props) {
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(`${name} musician`)}`;

  const links: { href: string; label: string }[] = [];
  if (urls.wikipedia) {
    links.push({ href: urls.wikipedia, label: "Wikipedia" });
  }
  if (urls.musicbrainz) {
    links.push({ href: urls.musicbrainz, label: "MusicBrainz" });
  }
  links.push({ href: googleUrl, label: "Search Google" });

  return (
    <ModalPortal onClose={onClose} layer={2}>
      <div
        className="modal-panel artist-not-in-library"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-panel-header">
          <h3>Not in library</h3>
          <button
            type="button"
            className="modal-close-x"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p className="artist-not-in-library__lead">
          <strong>{name}</strong> is not in your local music library yet.
        </p>
        <div className="artist-not-in-library__actions">
          {links.map((link, i) => (
            <span key={link.label}>
              {i > 0 && <span className="artist-not-in-library__sep"> • </span>}
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="artist-not-in-library__link"
              >
                {link.label}
              </a>
            </span>
          ))}
        </div>
      </div>
    </ModalPortal>
  );
}
