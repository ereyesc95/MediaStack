import { useEffect, useState } from "react";
import {
  fetchMediaAuthors,
  fetchMediaDirectors,
  fetchMediaGenres,
  fetchMediaPublishers,
  patchMediaItemOverview,
} from "../../../api";
import type { MediaItemOverview } from "../../../types";
import ModalPortal from "../../ModalPortal";
import GenreTagsInput, {
  joinSemicolonList,
  splitSemicolonList,
} from "./GenreTagsInput";
import PublisherSuggestInput from "./PublisherSuggestInput";

type Props = {
  bandId: number;
  kind: "video" | "library";
  itemId: string;
  data: MediaItemOverview;
  onClose: () => void;
  onSaved: (data: MediaItemOverview) => void;
};

function titleCaseWords(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function normalizePublisher(raw: string, catalog: string[]): string {
  const typed = titleCaseWords(raw.trim());
  if (!typed) return "";
  const match = catalog.find((p) => p.toLowerCase() === typed.toLowerCase());
  return match ?? typed;
}

export default function MediaItemAboutEditModal({
  bandId,
  kind,
  itemId,
  data,
  onClose,
  onSaved,
}: Props) {
  const [description, setDescription] = useState(data.description ?? "");
  const [directors, setDirectors] = useState<string[]>(() =>
    splitSemicolonList(data.director)
  );
  const [authors, setAuthors] = useState<string[]>(() =>
    splitSemicolonList(data.author)
  );
  const [publisher, setPublisher] = useState(data.publisher ?? "");
  const [genres, setGenres] = useState<string[]>(data.genres ?? []);
  const [genreOptions, setGenreOptions] = useState<string[]>([]);
  const [publisherOptions, setPublisherOptions] = useState<string[]>([]);
  const [directorOptions, setDirectorOptions] = useState<string[]>([]);
  const [authorOptions, setAuthorOptions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const peopleFetch =
      kind === "video"
        ? fetchMediaDirectors(kind).then((r) => r.directors)
        : fetchMediaAuthors(kind).then((r) => r.authors);
    void Promise.all([
      fetchMediaGenres(kind),
      fetchMediaPublishers(kind),
      peopleFetch,
    ])
      .then(([genreRes, pubRes, people]) => {
        if (cancelled) return;
        setGenreOptions(genreRes.genres.map((g) => g.name).filter(Boolean));
        setPublisherOptions(pubRes.publishers.filter(Boolean));
        if (kind === "video") {
          setDirectorOptions(people.filter(Boolean));
        } else {
          setAuthorOptions(people.filter(Boolean));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGenreOptions([]);
          setPublisherOptions([]);
          setDirectorOptions([]);
          setAuthorOptions([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await patchMediaItemOverview(bandId, kind, itemId, {
        description,
        director: kind === "video" ? joinSemicolonList(directors) : null,
        author: kind === "library" ? joinSemicolonList(authors) : null,
        publisher: normalizePublisher(publisher, publisherOptions),
        genres,
      });
      onSaved(updated);
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
        className="artist-word-cloud-modal__panel release-about-edit-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="artist-word-cloud-modal__head">
          <h3>Edit Release</h3>
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

        <div className="artist-admin-form release-about-edit-modal__form">
          <label>
            Description
            <textarea
              className="release-about-edit-modal__textarea ms-scrollbar"
              rows={8}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          {kind === "video" ? (
            <GenreTagsInput
              label="Director"
              options={directorOptions}
              value={directors}
              onChange={setDirectors}
              allowCustom
              placeholder="Directors separated with ;"
              disabled={saving}
            />
          ) : (
            <GenreTagsInput
              label="Author"
              options={authorOptions}
              value={authors}
              onChange={setAuthors}
              allowCustom
              placeholder="Authors separated with ;"
              disabled={saving}
            />
          )}
          <PublisherSuggestInput
            label="Publisher"
            value={publisher}
            options={publisherOptions}
            onChange={setPublisher}
            onCommit={(next) =>
              setPublisher(normalizePublisher(next, publisherOptions))
            }
            disabled={saving}
            placeholder="Type to search publishers…"
          />
          <GenreTagsInput
            label="Genres"
            options={genreOptions}
            value={genres}
            onChange={setGenres}
            placeholder="Genres separated with ;"
            disabled={saving}
          />
        </div>

        <div className="modal-actions-row">
          <button
            type="button"
            className="btn"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}
