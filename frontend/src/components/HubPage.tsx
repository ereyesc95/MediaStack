const PANES = [
  { id: 200, slug: "music", label: "Music" },
  { id: 400, slug: "series", label: "Series" },
  { id: 300, slug: "movies", label: "Movies" },
  { id: 500, slug: "books", label: "Books" },
  { id: 600, slug: "games", label: "Games" },
] as const;

type Props = {
  onSelect: (contentTypeId: number) => void;
};

export default function HubPage({ onSelect }: Props) {
  return (
    <div className="hub-panes">
      {PANES.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`hub-pane hub-pane--${p.slug}`}
          onClick={() => onSelect(p.id)}
        >
          <span
            className="hub-pane-bg card-bg-layer"
            style={{
              backgroundImage: `url(/api/assets/system/media/${p.slug})`,
            }}
          />
          <span className="hub-pane-overlay" />
          <span className="hub-pane-label">{p.label}</span>
        </button>
      ))}
    </div>
  );
}
