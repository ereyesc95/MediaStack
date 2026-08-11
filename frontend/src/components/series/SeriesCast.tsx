import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  addBooksBookCastMember,
  addMoviesFilmCastMember,
  addSeriesCastMember,
  patchMoviesFilmCastMember,
  patchSeriesCastMember,
  removeSeriesCastMember,
} from "../../api";
import type {
  SeriesCastMember,
  SeriesCastPerformance,
  SeriesCastTab,
  SeriesLanguageOption,
  SeriesSubseriesCard,
} from "../../types";
import { isPhoneLayout, useDeviceLayout } from "../../usePhoneLayout";
import { IconEditProfile } from "../MenuIcons";
import ModalPortal from "../ModalPortal";

type Props = {
  franchiseId: string;
  franchiseName: string;
  cast: {
    characters?: SeriesCastMember[];
    staff?: SeriesCastMember[];
    animated?: SeriesCastMember[];
    people?: SeriesCastMember[];
  };
  /** Franchise-selected language codes (About). */
  languages?: string[];
  languageOptions?: SeriesLanguageOption[];
  originLanguage?: string | null;
  /** Prefer this language first when ordering actor name rows. */
  activeLanguage?: string | null;
  subseries?: SeriesSubseriesCard[];
  /** "all" or a subseries id — filters members by subseries_ids. */
  castSubFilter?: string;
  /** Horizontal scrolling single row (subseries overview). */
  layout?: "grid" | "row";
  tab: SeriesCastTab;
  isAdmin?: boolean;
  addOpen?: boolean;
  onAddClose?: () => void;
  /** Open Update cast when empty-state CTA is clicked. */
  onAddEmptyClick?: () => void;
  onDataChanged: () => void;
  /** Use movies/books leaf cast endpoints when set. */
  castApi?: "series" | "movies" | "books";
  filmId?: string;
  /** Books: character-only form (no actors). */
  characterOnly?: boolean;
};

/** Language code → flag-icons country ISO */
const LANG_FLAG_ISO: Record<string, string> = {
  ja: "jp",
  en: "gb",
  "es-ES": "es",
  "es-419": "mx",
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function splitRows<T>(items: T[], perRow?: number): { top: T[]; bottom: T[] } {
  if (perRow != null && perRow > 0) {
    return { top: items.slice(0, perRow), bottom: items.slice(perRow) };
  }
  const topCount = Math.ceil(items.length / 2);
  return { top: items.slice(0, topCount), bottom: items.slice(topCount) };
}

function flagIso(lang: string): string {
  return LANG_FLAG_ISO[lang] || lang.slice(0, 2).toLowerCase();
}

function peopleFromPerf(
  perf: SeriesCastPerformance | null
): { name: string; photo_url?: string | null }[] {
  if (!perf) return [];
  const nested = perf.actors;
  if (Array.isArray(nested) && nested.length) {
    return nested
      .filter((a) => a?.name?.trim())
      .map((a) => ({
        name: a.name!.trim(),
        photo_url: a.photo_url ?? null,
      }));
  }
  const names = actorNamesFromPerf(perf);
  return names.map((name, i) => ({
    name,
    photo_url: i === 0 ? perf.photo_url ?? null : null,
  }));
}

function performancesMatchingLang(
  member: SeriesCastMember,
  lang: string | null
): SeriesCastPerformance[] {
  const perfs = member.performances || [];
  if (!lang) return perfs;
  return perfs.filter(
    (p) => (p.language || "").toLowerCase() === lang.toLowerCase()
  );
}

/** Pick performances for a language + optional subseries scope. */
function performancesForScope(
  member: SeriesCastMember,
  lang: string | null,
  subFilter: string = "all"
): SeriesCastPerformance[] {
  const langPerfs = performancesMatchingLang(member, lang);
  if (!langPerfs.length) return [];
  if (!subFilter || subFilter === "all") {
    return langPerfs;
  }
  const scoped = langPerfs.filter((p) =>
    (p.subseries_ids || []).includes(subFilter)
  );
  if (scoped.length) return scoped;
  // Fallback: franchise-wide defaults (no subseries_ids)
  return langPerfs.filter((p) => !(p.subseries_ids && p.subseries_ids.length));
}

function actorNamesFromPerf(perf: SeriesCastPerformance | null): string[] {
  if (!perf) return [];
  if (perf.actor_names?.length) {
    return perf.actor_names.map((n) => n.trim()).filter(Boolean);
  }
  if (perf.actor_name?.trim()) return [perf.actor_name.trim()];
  return [];
}

function actorsForLangDetailed(
  member: SeriesCastMember,
  lang: string,
  subFilter: string = "all"
): { name: string; photo_url?: string | null }[] {
  const perfs = performancesForScope(member, lang, subFilter);
  if (perfs.length) {
    const seen = new Set<string>();
    const out: { name: string; photo_url?: string | null }[] = [];
    for (const perf of perfs) {
      for (const person of peopleFromPerf(perf)) {
        const key = person.name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(person);
      }
    }
    if (out.length) return out;
  }
  // Legacy flat actors[] — only when no scoped performances
  if (member.actors?.length && (subFilter === "all" || !subFilter)) {
    const byLang = lang
      ? member.actors.filter(
          (a) =>
            a.name &&
            (!a.language || a.language.toLowerCase() === lang.toLowerCase())
        )
      : member.actors.filter((a) => a.name);
    if (byLang.length) {
      const seen = new Set<string>();
      const out: { name: string; photo_url?: string | null }[] = [];
      for (const a of byLang) {
        const key = a.name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ name: a.name, photo_url: a.photo_url ?? null });
      }
      return out;
    }
  }
  if (subFilter === "all" || !subFilter) {
    return (member.roles || [])
      .filter(Boolean)
      .map((name) => ({ name, photo_url: null }));
  }
  return [];
}

/** One row per language: flag + individually hoverable actor names. */
function actorGroupsForDisplay(
  member: SeriesCastMember,
  franchiseLangs: string[],
  originLanguage?: string | null,
  subFilter: string = "all",
  activeLanguage?: string | null
): {
  language: string;
  people: { name: string; photo_url?: string | null }[];
}[] {
  const out: {
    language: string;
    people: { name: string; photo_url?: string | null }[];
  }[] = [];
  let langs =
    franchiseLangs.length > 0
      ? [...franchiseLangs]
      : (member.performances || [])
          .map((p) => p.language)
          .filter(Boolean) as string[];

  const preferred = activeLanguage || originLanguage;
  if (preferred) {
    langs = [
      preferred,
      ...langs.filter(
        (l) => l.toLowerCase() !== preferred.toLowerCase()
      ),
    ];
  }

  for (const lang of langs) {
    const people = actorsForLangDetailed(member, lang, subFilter);
    if (!people.length) continue;
    out.push({ language: lang, people });
  }

  if (!out.length && (member.roles?.length || member.actors?.length)) {
    const lang = preferred || franchiseLangs[0] || "ja";
    const people = actorsForLangDetailed(member, lang, subFilter);
    if (people.length) out.push({ language: lang, people });
  }
  return out;
}

/** Flat list for modal “Portrayed by” (joined names per language). */
function actorsForDisplay(
  member: SeriesCastMember,
  franchiseLangs: string[],
  originLanguage?: string | null,
  subFilter: string = "all",
  activeLanguage?: string | null
): { language: string; name: string; photo_url?: string | null }[] {
  return actorGroupsForDisplay(
    member,
    franchiseLangs,
    originLanguage,
    subFilter,
    activeLanguage
  ).map((g) => ({
    language: g.language,
    name: g.people.map((p) => p.name).join(", "),
    photo_url: g.people[0]?.photo_url ?? null,
  }));
}

function MemberCard({
  member,
  characterCentered,
  franchiseLangs,
  originLanguage,
  activeLanguage,
  castSubFilter = "all",
  onSelect,
}: {
  member: SeriesCastMember;
  characterCentered: boolean;
  franchiseLangs: string[];
  originLanguage?: string | null;
  activeLanguage?: string | null;
  castSubFilter?: string;
  onSelect: (m: SeriesCastMember) => void;
}) {
  const layout = useDeviceLayout();
  const tapToSwap =
    isPhoneLayout(layout) ||
    (typeof window !== "undefined" &&
      window.matchMedia("(hover: none)").matches);

  const [photoFailed, setPhotoFailed] = useState(false);
  /** Which actor row is hovered / pinned — by language+name, never by photo URL. */
  const [activeActorKey, setActiveActorKey] = useState<string | null>(null);
  const [actorSrc, setActorSrc] = useState<string | null>(null);
  const [actorVisible, setActorVisible] = useState(false);
  const hoverImgRef = useRef<HTMLImageElement | null>(null);
  const fadeRaf = useRef(0);
  const clearTimer = useRef(0);
  const hoverGen = useRef(0);

  const characterUrl = member.photo_url;
  const actorGroups = characterCentered
    ? actorGroupsForDisplay(
        member,
        franchiseLangs,
        originLanguage,
        castSubFilter,
        activeLanguage
      )
    : [];
  const baseUrl = characterUrl && !photoFailed ? characterUrl : null;
  const staffSubtitle = !characterCentered
    ? member.roles?.filter(Boolean).join(" · ")
    : null;
  const actorPreview = Boolean(activeActorKey);

  const clearActorPhoto = () => {
    hoverGen.current += 1;
    cancelAnimationFrame(fadeRaf.current);
    window.clearTimeout(clearTimer.current);
    setActorVisible(false);
    clearTimer.current = window.setTimeout(() => setActorSrc(null), 280);
  };

  const showActorPhoto = (url: string | null) => {
    cancelAnimationFrame(fadeRaf.current);
    window.clearTimeout(clearTimer.current);
    if (!url) {
      // Name can still highlight via activeActorKey; photo stays on character.
      hoverGen.current += 1;
      setActorVisible(false);
      clearTimer.current = window.setTimeout(() => setActorSrc(null), 280);
      return;
    }
    const gen = ++hoverGen.current;
    const preload = new Image();
    preload.src = url;
    const arm = () => {
      if (gen !== hoverGen.current) return;
      setActorSrc(url);
      setActorVisible(false);
    };
    if (preload.complete) arm();
    else preload.onload = arm;
  };

  // After actorSrc mounts / changes, force a layout pass then fade in.
  useLayoutEffect(() => {
    if (!actorSrc) {
      setActorVisible(false);
      return;
    }
    setActorVisible(false);
    const gen = hoverGen.current;
    fadeRaf.current = requestAnimationFrame(() => {
      void hoverImgRef.current?.offsetWidth;
      fadeRaf.current = requestAnimationFrame(() => {
        if (gen !== hoverGen.current) return;
        setActorVisible(true);
      });
    });
    return () => cancelAnimationFrame(fadeRaf.current);
  }, [actorSrc]);

  useEffect(() => {
    setPhotoFailed(false);
    hoverGen.current += 1;
    cancelAnimationFrame(fadeRaf.current);
    window.clearTimeout(clearTimer.current);
    setActiveActorKey(null);
    setActorSrc(null);
    setActorVisible(false);
  }, [member.photo_url, member.id]);

  useEffect(
    () => () => {
      cancelAnimationFrame(fadeRaf.current);
      window.clearTimeout(clearTimer.current);
    },
    []
  );

  const activateActor = (key: string, photo: string | null) => {
    setActiveActorKey(key);
    showActorPhoto(photo);
  };

  const deactivateActor = () => {
    setActiveActorKey(null);
    clearActorPhoto();
  };

  return (
    <div
      className={`artist-lineup-card series-cast-card${
        member.is_deceased ? " artist-lineup-card--deceased" : ""
      }${actorPreview ? " series-cast-card--actor-shown" : ""}`}
    >
      <button
        type="button"
        className="series-cast-card__main"
        onClick={() => onSelect(member)}
      >
        <span className="artist-lineup-card__photo series-cast-card__photo">
          {baseUrl ? (
            <img
              src={baseUrl}
              alt=""
              className="series-cast-card__photo-layer series-cast-card__photo-layer--base"
              style={{
                opacity: actorVisible ? 0 : 1,
                transition: "opacity 220ms ease",
              }}
              onError={() => setPhotoFailed(true)}
            />
          ) : (
            <span
              className="artist-lineup-card__ph series-cast-card__photo-layer series-cast-card__photo-layer--base"
              style={{
                opacity: actorVisible ? 0 : 1,
                transition: "opacity 220ms ease",
              }}
            >
              {initials(member.name)}
            </span>
          )}
          {/* Keep overlay mounted whenever we have a src so opacity can transition. */}
          <img
            ref={hoverImgRef}
            src={actorSrc || baseUrl || undefined}
            alt=""
            className="series-cast-card__photo-layer series-cast-card__photo-layer--hover"
            style={{
              opacity: actorVisible && actorSrc ? 1 : 0,
              transition: "opacity 220ms ease",
              visibility: actorSrc ? "visible" : "hidden",
            }}
            onError={() => {
              if (actorSrc) clearActorPhoto();
            }}
          />
        </span>
        <span className="artist-lineup-card__name">
          {member.name}
          {member.is_deceased ? (
            <span className="artist-lineup-card__deceased" title="Deceased">
              †
            </span>
          ) : null}
        </span>
      </button>
      {characterCentered && actorGroups.length > 0 ? (
        <ul className="series-cast-card__actors">
          {actorGroups.map((g) => (
            <li key={g.language} className="series-cast-card__actor-line">
              <span
                className={`fi fi-${flagIso(g.language)} series-cast-card__flag`}
                aria-hidden
              />
              <span className="series-cast-card__actor-names">
                {g.people.map((person, idx) => {
                  const key = `${g.language}::${person.name}`;
                  const isActive = activeActorKey === key;
                  const photo = person.photo_url || null;
                  return (
                    <span key={key} className="series-cast-card__actor-chip">
                      {idx > 0 ? (
                        <span className="series-cast-card__actor-sep">, </span>
                      ) : null}
                      <button
                        type="button"
                        className={`series-cast-card__actor${
                          isActive ? " is-active" : ""
                        }`}
                        title={person.name}
                        aria-pressed={tapToSwap ? isActive : undefined}
                        onMouseEnter={() => {
                          if (!tapToSwap) activateActor(key, photo);
                        }}
                        onMouseLeave={() => {
                          if (!tapToSwap) deactivateActor();
                        }}
                        onFocus={() => {
                          if (!tapToSwap) activateActor(key, photo);
                        }}
                        onBlur={() => {
                          if (!tapToSwap) deactivateActor();
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (tapToSwap) {
                            if (isActive) deactivateActor();
                            else activateActor(key, photo);
                            return;
                          }
                          onSelect(member);
                        }}
                      >
                        <span className="series-cast-card__actor-name">
                          {person.name}
                        </span>
                      </button>
                    </span>
                  );
                })}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {staffSubtitle ? (
        <span className="artist-lineup-card__roles">{staffSubtitle}</span>
      ) : null}
    </div>
  );
}

function CastMemberModal({
  member,
  franchiseId,
  franchiseName,
  isAdmin,
  bucket,
  franchiseLangs,
  languageOptions,
  subseries,
  castSubFilter = "all",
  castApi = "series",
  filmId,
  onClose,
  onDataChanged,
}: {
  member: SeriesCastMember;
  franchiseId: string;
  franchiseName: string;
  isAdmin?: boolean;
  bucket: SeriesCastTab;
  franchiseLangs: string[];
  languageOptions: SeriesLanguageOption[];
  subseries: SeriesSubseriesCard[];
  castSubFilter?: string;
  castApi?: "series" | "movies";
  filmId?: string;
  onClose: () => void;
  onDataChanged: () => void;
}) {
  const characterCentered = bucket === "characters";
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);

  const defaultLang =
    franchiseLangs[0] || languageOptions[0]?.code || "en";
  const [charName, setCharName] = useState(
    member.character || member.name || ""
  );
  const [editLang, setEditLang] = useState(defaultLang);
  const [actorEntries, setActorEntries] = useState<
    { name: string; photo_url: string }[]
  >(() => {
    const people = actorsForLangDetailed(member, defaultLang, castSubFilter);
    return people.length
      ? people.map((p) => ({ name: p.name, photo_url: p.photo_url || "" }))
      : [{ name: "", photo_url: "" }];
  });
  const [rolesText, setRolesText] = useState(
    () => (member.roles || []).join(", ")
  );
  const [photoUrl, setPhotoUrl] = useState(member.photo_url || "");
  const [selectedSubs, setSelectedSubs] = useState<string[]>(
    () => member.subseries_ids || []
  );
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removeFromFranchise, setRemoveFromFranchise] = useState(false);

  useEffect(() => {
    const people = actorsForLangDetailed(member, editLang, castSubFilter);
    setActorEntries(
      people.length
        ? people.map((p) => ({ name: p.name, photo_url: p.photo_url || "" }))
        : [{ name: "", photo_url: "" }]
    );
  }, [editLang, member, castSubFilter]);

  const handleSave = async () => {
    if (member.id == null) return;
    setBusy(true);
    setError(null);
    try {
      const actors = actorEntries
        .map((a) => ({
          name: a.name.trim(),
          photo_url: a.photo_url.trim() || null,
        }))
        .filter((a) => a.name);
      const staffRoles = rolesText
        .split(/[;·,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const actorScope =
        castSubFilter && castSubFilter !== "all" ? [castSubFilter] : [];
      if (castApi === "movies") {
        if (!filmId) throw new Error("Missing film id");
        await patchMoviesFilmCastMember(filmId, member.id, {
          kind: bucket,
          bucket,
          name: charName,
          character: characterCentered ? charName : undefined,
          photo_url: photoUrl.trim() || null,
          actor_photo_url: characterCentered
            ? actors[0]?.photo_url || null
            : undefined,
          actors: characterCentered ? actors : undefined,
          roles: characterCentered
            ? actors.map((a) => a.name)
            : staffRoles,
          language: characterCentered ? editLang : undefined,
        });
      } else {
        await patchSeriesCastMember(franchiseId, member.id, {
          bucket,
          name: charName,
          character: characterCentered ? charName : undefined,
          photo_url: photoUrl.trim() || null,
          actor_photo_url: characterCentered
            ? actors[0]?.photo_url || null
            : undefined,
          actors: characterCentered ? actors : undefined,
          roles: characterCentered
            ? actors.map((a) => a.name)
            : staffRoles,
          language: characterCentered ? editLang : undefined,
          subseries_ids: selectedSubs,
          actor_subseries_ids: characterCentered ? actorScope : undefined,
        });
      }
      onDataChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (member.id == null) return;
    setBusy(true);
    setError(null);
    try {
      if (castApi === "movies") {
        if (!filmId) throw new Error("Missing film id");
        await patchMoviesFilmCastMember(filmId, member.id, {
          kind: bucket,
          bucket,
          delete: true,
        });
      } else {
        const scoped =
          castSubFilter && castSubFilter !== "all" && !removeFromFranchise;
        await removeSeriesCastMember(
          franchiseId,
          member.id,
          bucket,
          member.character || member.name,
          scoped
            ? {
                subseriesId: castSubFilter,
                fromFranchise: false,
                retainSubseriesIds: subseries
                  .map((s) => s.id)
                  .filter((id) => id !== castSubFilter),
              }
            : { fromFranchise: true }
        );
      }
      onDataChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setConfirmRemove(false);
    }
  };

  const displayPhoto = member.photo_url;
  const listed = actorsForDisplay(
    member,
    franchiseLangs,
    franchiseLangs[0],
    castSubFilter,
    franchiseLangs[0]
  );
  const relatedLabels =
    selectedSubs.length > 0
      ? subseries
          .filter((s) => selectedSubs.includes(s.id))
          .map((s) => s.title)
      : member.subseries_ids?.length
        ? subseries
            .filter((s) => (member.subseries_ids || []).includes(s.id))
            .map((s) => s.title)
        : [franchiseName];

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="modal-panel artist-member-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-panel-header artist-member-modal__header">
          <div className="artist-member-modal__header-actions">
            {isAdmin && member.id != null ? (
              <button
                type="button"
                className="artist-member-modal__edit-icon"
                aria-label="Edit member"
                title="Edit"
                onClick={() => setEditing((v) => !v)}
              >
                <IconEditProfile />
              </button>
            ) : null}
            <button
              type="button"
              className="modal-close-x"
              aria-label="Close"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </div>

        {!editing ? (
          <div className="artist-member-modal__body">
            <div className="artist-member-modal__hero">
              <span className="artist-member-modal__photo-btn">
                {displayPhoto && !photoFailed ? (
                  <img
                    src={displayPhoto}
                    alt=""
                    onError={() => setPhotoFailed(true)}
                  />
                ) : (
                  <span className="artist-member-modal__ph">
                    {initials(member.name)}
                  </span>
                )}
              </span>
              <div className="artist-member-modal__info">
                <p className="artist-member-modal__title">{member.name}</p>
                {characterCentered && listed.length > 0 ? (
                  <div className="artist-member-modal__row">
                    <span className="artist-member-modal__label">
                      Portrayed by:
                    </span>
                    <ul className="series-cast-modal__actors">
                      {listed.map((a) => (
                        <li key={`${a.language}-${a.name}`}>
                          <span
                            className={`fi fi-${flagIso(a.language)}`}
                            aria-hidden
                          />{" "}
                          {a.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {!characterCentered && member.roles?.length ? (
                  <p className="artist-member-modal__row">
                    <span className="artist-member-modal__label">Roles:</span>
                    <span className="artist-member-modal__value">
                      {member.roles.join(" · ")}
                    </span>
                  </p>
                ) : null}
                <div className="artist-member-modal__row artist-member-modal__row--projects">
                  <span className="artist-member-modal__label">
                    Related projects:
                  </span>
                  <ul className="artist-member-modal__projects">
                    {relatedLabels.map((t) => (
                      <li key={t}>
                        <span className="artist-member-modal__project-name">
                          {t}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                {error ? <p className="error">{error}</p> : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="artist-admin-form" style={{ padding: "0.5rem 0 1rem" }}>
            <div className="series-cast-edit__char-row">
              <label className="series-cast-edit__grow">
                {characterCentered ? "Character name" : "Name"}
                <input
                  value={charName}
                  onChange={(e) => setCharName(e.target.value)}
                />
              </label>
              {characterCentered ? (
                <label className="series-cast-edit__grow">
                  Character photo URL
                  <input
                    value={photoUrl}
                    onChange={(e) => setPhotoUrl(e.target.value)}
                  />
                </label>
              ) : (
                <label className="series-cast-edit__grow">
                  Photo URL
                  <input
                    value={photoUrl}
                    onChange={(e) => setPhotoUrl(e.target.value)}
                  />
                </label>
              )}
            </div>
            {!characterCentered ? (
              <label>
                Roles
                <input
                  value={rolesText}
                  onChange={(e) => setRolesText(e.target.value)}
                  placeholder="Director, Writer, …"
                />
              </label>
            ) : null}
            {characterCentered ? (
              <>
                <label>
                  Language
                  <select
                    value={editLang}
                    onChange={(e) => setEditLang(e.target.value)}
                  >
                    {(franchiseLangs.length
                      ? franchiseLangs.map((c) => {
                          const opt = languageOptions.find(
                            (o) => o.code.toLowerCase() === c.toLowerCase()
                          );
                          return {
                            code: c,
                            label: opt?.label || c,
                          };
                        })
                      : languageOptions
                    ).map((o) => (
                      <option key={o.code} value={o.code}>
                        {o.label.replace(/\s*\(origin\)\s*$/i, "")}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="series-cast-edit__actors">
                  <span className="series-cast-edit__actors-label">
                    Actors for this language
                  </span>
                  {actorEntries.map((entry, idx) => (
                    <div key={idx} className="series-cast-edit__actor-row">
                      <input
                        value={entry.name}
                        onChange={(e) => {
                          const next = [...actorEntries];
                          next[idx] = { ...next[idx], name: e.target.value };
                          setActorEntries(next);
                        }}
                        placeholder={idx === 0 ? "Actor name" : "Additional actor"}
                      />
                      <input
                        value={entry.photo_url}
                        onChange={(e) => {
                          const next = [...actorEntries];
                          next[idx] = {
                            ...next[idx],
                            photo_url: e.target.value,
                          };
                          setActorEntries(next);
                        }}
                        placeholder="Actor photo URL"
                      />
                      {actorEntries.length > 1 ? (
                        <button
                          type="button"
                          className="btn link-form__delete"
                          aria-label="Remove actor"
                          onClick={() =>
                            setActorEntries(
                              actorEntries.filter((_, i) => i !== idx)
                            )
                          }
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn series-cast-edit__add-actor"
                    onClick={() =>
                      setActorEntries([
                        ...actorEntries,
                        { name: "", photo_url: "" },
                      ])
                    }
                  >
                    Add actor
                  </button>
                </div>
              </>
            ) : null}
            {subseries.length > 0 ? (
              <fieldset className="series-cast-edit__subseries">
                <legend>Appears in subseries</legend>
                <p className="muted series-cast-edit__hint">
                  Leave all unchecked to show in every subseries (All).
                </p>
                <div className="series-cast-edit__subseries-list">
                  {subseries.map((s) => {
                    const checked = selectedSubs.includes(s.id);
                    return (
                      <label key={s.id} className="series-cast-edit__sub-item">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setSelectedSubs((prev) =>
                              checked
                                ? prev.filter((id) => id !== s.id)
                                : [...prev, s.id]
                            );
                          }}
                        />
                        {s.title}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}
            {error ? <p className="error">{error}</p> : null}
            <div className="modal-actions-row">
              <button
                type="button"
                className="btn link-form__delete"
                disabled={busy}
                onClick={() => {
                  setRemoveFromFranchise(false);
                  setConfirmRemove(true);
                }}
              >
                Remove
              </button>
              <span className="modal-actions__spacer" />
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy || !charName.trim()}
                onClick={() => void handleSave()}
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>
      {confirmRemove ? (
        <div
          className="modal-backdrop series-cast-confirm-backdrop"
          onClick={() => !busy && setConfirmRemove(false)}
        >
          <div
            className="modal-panel series-cast-confirm"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-panel-header">
              <h3>Remove from cast</h3>
              <button
                type="button"
                className="modal-close-x"
                aria-label="Close"
                disabled={busy}
                onClick={() => setConfirmRemove(false)}
              >
                ×
              </button>
            </div>
            <p>
              Remove “{member.name}” from cast
              {castSubFilter && castSubFilter !== "all" && !removeFromFranchise
                ? " for this subseries"
                : ""}
              ?
            </p>
            {castSubFilter && castSubFilter !== "all" ? (
              <label className="series-cast-confirm__check">
                <input
                  type="checkbox"
                  checked={removeFromFranchise}
                  onChange={(e) => setRemoveFromFranchise(e.target.checked)}
                />
                Also remove from the entire franchise
              </label>
            ) : null}
            <div className="modal-panel-actions modal-panel-actions--end">
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() => void handleRemove()}
              >
                {busy ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ModalPortal>
  );
}

export function AddCastModal({
  franchiseId,
  bucket,
  languageOptions,
  defaultLanguage,
  subseries,
  defaultSubseriesIds,
  castApi = "series",
  filmId,
  characterOnly = false,
}: {
  franchiseId: string;
  bucket: SeriesCastTab;
  languageOptions: SeriesLanguageOption[];
  defaultLanguage: string | null;
  subseries: SeriesSubseriesCard[];
  defaultSubseriesIds?: string[];
  castApi?: "series" | "movies" | "books";
  filmId?: string;
  characterOnly?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const characterCentered = bucket === "characters";
  const [charName, setCharName] = useState("");
  const [actorEntries, setActorEntries] = useState<
    { name: string; photo_url: string }[]
  >([{ name: "", photo_url: "" }]);
  const [rolesText, setRolesText] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [lang, setLang] = useState(
    defaultLanguage || languageOptions[0]?.code || "en"
  );
  const [selectedSubs, setSelectedSubs] = useState<string[]>(
    () => defaultSubseriesIds || []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!charName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const actors = actorEntries
        .map((a) => ({
          name: a.name.trim(),
          photo_url: a.photo_url.trim() || null,
        }))
        .filter((a) => a.name);
      const staffRoles = rolesText
        .split(/[;·,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (castApi === "movies") {
        if (!filmId) throw new Error("Missing film id");
        const created = await addMoviesFilmCastMember(filmId, {
          kind: bucket,
          bucket,
          name: characterCentered
            ? actors[0]?.name || charName.trim()
            : charName.trim(),
          character: characterCentered ? charName.trim() : undefined,
          photo_url: characterCentered
            ? actors[0]?.photo_url || undefined
            : photoUrl.trim() || undefined,
          character_photo_url: characterCentered
            ? photoUrl.trim() || undefined
            : undefined,
          roles: characterCentered
            ? actors.length
              ? actors.map((a) => a.name)
              : undefined
            : staffRoles.length
              ? staffRoles
              : undefined,
          language: characterCentered ? lang : undefined,
        });
        if (characterCentered && created?.id != null && actors.length > 0) {
          await patchMoviesFilmCastMember(filmId, created.id, {
            kind: bucket,
            bucket,
            character: charName.trim(),
            photo_url: photoUrl.trim() || null,
            actor_photo_url: actors[0]?.photo_url || null,
            actors,
            language: lang,
          });
        }
      } else if (castApi === "books") {
        if (!filmId) throw new Error("Missing book id");
        await addBooksBookCastMember(filmId, {
          kind: bucket,
          bucket,
          name: charName.trim(),
          character: characterCentered ? charName.trim() : undefined,
          photo_url: photoUrl.trim() || undefined,
          character_photo_url: characterCentered
            ? photoUrl.trim() || undefined
            : undefined,
          roles: characterCentered
            ? undefined
            : staffRoles.length
              ? staffRoles
              : undefined,
          language: characterCentered ? lang : undefined,
        });
      } else {
        const created = await addSeriesCastMember(franchiseId, {
          bucket,
          name: characterCentered
            ? actors[0]?.name || charName.trim()
            : charName.trim(),
          character: characterCentered ? charName.trim() : undefined,
          photo_url: characterCentered
            ? actors[0]?.photo_url || undefined
            : photoUrl.trim() || undefined,
          character_photo_url: characterCentered
            ? photoUrl.trim() || undefined
            : undefined,
          roles: characterCentered
            ? actors.length
              ? actors.map((a) => a.name)
              : undefined
            : staffRoles.length
              ? staffRoles
              : undefined,
          language: characterCentered ? lang : undefined,
          subseries_ids: selectedSubs.length ? selectedSubs : undefined,
        });
        if (
          characterCentered &&
          created?.id != null &&
          (actors.length > 0 || selectedSubs.length)
        ) {
          await patchSeriesCastMember(franchiseId, created.id, {
            bucket,
            character: charName.trim(),
            photo_url: photoUrl.trim() || null,
            actor_photo_url: actors[0]?.photo_url || null,
            actors,
            language: lang,
            subseries_ids: selectedSubs,
          });
        } else if (
          !characterCentered &&
          created?.id != null &&
          selectedSubs.length
        ) {
          await patchSeriesCastMember(franchiseId, created.id, {
            bucket,
            name: charName.trim(),
            photo_url: photoUrl.trim() || null,
            roles: staffRoles,
            subseries_ids: selectedSubs,
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
  };

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="modal-panel artist-admin-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-panel-header">
          <h3>
            Add {characterCentered ? "character" : "staff member"}
          </h3>
          <button type="button" className="modal-close-x" onClick={onClose}>
            ×
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <div className="artist-admin-form">
          <div className="series-cast-edit__char-row">
            <label className="series-cast-edit__grow">
              {characterCentered ? "Character name" : "Name"}
              <input
                value={charName}
                onChange={(e) => setCharName(e.target.value)}
                autoFocus
              />
            </label>
            <label className="series-cast-edit__grow">
              {characterCentered ? "Character photo URL" : "Photo URL"}{" "}
              (optional)
              <input
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
              />
            </label>
          </div>
          {characterCentered ? (
            <>
              <label>
                Language
                <select value={lang} onChange={(e) => setLang(e.target.value)}>
                  {(languageOptions.length
                    ? languageOptions
                    : [{ code: "en", label: "English" }]
                  ).map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.label.replace(/\s*\(origin\)\s*$/i, "")}
                    </option>
                  ))}
                </select>
              </label>
              {!characterOnly ? (
              <div className="series-cast-edit__actors">
                <span className="series-cast-edit__actors-label">Actors</span>
                {actorEntries.map((entry, idx) => (
                  <div key={idx} className="series-cast-edit__actor-row">
                    <input
                      value={entry.name}
                      onChange={(e) => {
                        const next = [...actorEntries];
                        next[idx] = { ...next[idx], name: e.target.value };
                        setActorEntries(next);
                      }}
                      placeholder={
                        idx === 0 ? "Actor name" : "Additional actor"
                      }
                    />
                    <input
                      value={entry.photo_url}
                      onChange={(e) => {
                        const next = [...actorEntries];
                        next[idx] = {
                          ...next[idx],
                          photo_url: e.target.value,
                        };
                        setActorEntries(next);
                      }}
                      placeholder="Actor photo URL"
                    />
                    {actorEntries.length > 1 ? (
                      <button
                        type="button"
                        className="btn link-form__delete"
                        aria-label="Remove actor"
                        onClick={() =>
                          setActorEntries(
                            actorEntries.filter((_, i) => i !== idx)
                          )
                        }
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                ))}
                <button
                  type="button"
                  className="btn series-cast-edit__add-actor"
                  onClick={() =>
                    setActorEntries([
                      ...actorEntries,
                      { name: "", photo_url: "" },
                    ])
                  }
                >
                  Add actor
                </button>
              </div>
              ) : null}
            </>
          ) : (
            <label>
              Roles (optional)
              <input
                value={rolesText}
                onChange={(e) => setRolesText(e.target.value)}
                placeholder="Director, Writer, …"
              />
            </label>
          )}
          {subseries.length > 0 && !characterOnly ? (
            <fieldset className="series-cast-edit__subseries">
              <legend>Appears in subseries</legend>
              <p className="muted series-cast-edit__hint">
                Leave all unchecked to show in every subseries (All).
              </p>
              <div className="series-cast-edit__subseries-list">
                {subseries.map((s) => {
                  const checked = selectedSubs.includes(s.id);
                  return (
                    <label key={s.id} className="series-cast-edit__sub-item">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedSubs((prev) =>
                            checked
                              ? prev.filter((id) => id !== s.id)
                              : [...prev, s.id]
                          );
                        }}
                      />
                      {s.title}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : null}
        </div>
        <div className="modal-panel-actions modal-panel-actions--end">
          <button
            type="button"
            className="btn btn--primary"
            disabled={saving || !charName.trim()}
            onClick={() => void save()}
          >
            {saving ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}

export default function SeriesCast({
  franchiseId,
  franchiseName,
  cast,
  languages,
  languageOptions,
  originLanguage,
  activeLanguage,
  subseries = [],
  castSubFilter = "all",
  layout: castLayout = "grid",
  tab,
  isAdmin,
  addOpen,
  onAddClose,
  onAddEmptyClick,
  onDataChanged,
  castApi = "series",
  filmId,
  characterOnly = false,
}: Props) {
  const [modalMember, setModalMember] = useState<SeriesCastMember | null>(null);
  const deviceLayout = useDeviceLayout();
  const characterCentered = tab === "characters";

  const franchiseLangs = useMemo(() => {
    const langs = languages?.length
      ? [...languages]
      : originLanguage
        ? [originLanguage]
        : [];
    // Prefer active language first, then origin, then the rest.
    const preferred = activeLanguage || originLanguage;
    if (preferred && langs.length) {
      return [
        preferred,
        ...langs.filter((l) => l.toLowerCase() !== preferred.toLowerCase()),
      ];
    }
    if (originLanguage && langs.length) {
      return [
        originLanguage,
        ...langs.filter(
          (l) => l.toLowerCase() !== originLanguage.toLowerCase()
        ),
      ];
    }
    return langs;
  }, [languages, originLanguage, activeLanguage]);

  const members = useMemo(() => {
    const list =
      tab === "characters"
        ? cast.characters || cast.animated || []
        : cast.staff || cast.people || [];
    const filtered =
      castSubFilter === "all"
        ? list
        : list.filter((m) => {
            const ids = m.subseries_ids;
            if (!ids || !ids.length) return true;
            return ids.includes(castSubFilter);
          });
    // Prefer scoped members; if none are tagged for this subseries, show the
    // full franchise cast rather than an empty panel.
    const resolved = filtered.length > 0 ? filtered : list;
    if (castLayout === "row") return resolved;
    return resolved.slice(0, 8);
  }, [cast, tab, castSubFilter, castLayout]);

  const rows = useMemo(
    () =>
      castLayout === "row"
        ? { top: members, bottom: [] as SeriesCastMember[] }
        : splitRows(
            members,
            deviceLayout === "mobile-landscape" ? 5 : undefined
          ),
    [members, deviceLayout, castLayout]
  );

  const franchiseLangOptions = useMemo(() => {
    const byCode = new Map(
      (languageOptions || []).map((o) => [o.code.toLowerCase(), o] as const)
    );
    if (franchiseLangs.length) {
      return franchiseLangs.map((code) => {
        const opt = byCode.get(code.toLowerCase());
        return {
          code,
          label: (opt?.label || code).replace(/\s*\(origin\)\s*$/i, ""),
        };
      });
    }
    if (languageOptions?.length) {
      return languageOptions.map((o) => ({
        ...o,
        label: o.label.replace(/\s*\(origin\)\s*$/i, ""),
      }));
    }
    return [] as SeriesLanguageOption[];
  }, [languageOptions, franchiseLangs]);

  const castRowRef = useRef<HTMLDivElement | null>(null);
  const hasCastCarousel = castLayout === "row" && members.length > 6;

  const advanceCastCarousel = () => {
    const row = castRowRef.current;
    if (!row) return;
    const remaining = row.scrollWidth - row.clientWidth - row.scrollLeft;
    if (remaining <= 12) {
      row.scrollTo({ left: 0, behavior: "smooth" });
      return;
    }
    row.scrollBy({
      left: Math.max(row.clientWidth * 0.75, 160),
      behavior: "smooth",
    });
  };

  if (!members.length && !addOpen) {
    const emptyLabel =
      tab === "characters" ? "+ Add characters" : "+ Add personnel";
    return (
      <div className="artist-lineup">
        {onAddEmptyClick && isAdmin ? (
          <button
            type="button"
            className="series-cast__empty-cta"
            onClick={onAddEmptyClick}
          >
            {emptyLabel}
          </button>
        ) : (
          <p className="muted artist-lineup__empty">{emptyLabel}</p>
        )}
      </div>
    );
  }

  if (!members.length && addOpen && onAddClose) {
    return (
      <div className="artist-lineup">
        <AddCastModal
          franchiseId={franchiseId}
          bucket={tab}
          languageOptions={franchiseLangOptions}
          defaultLanguage={franchiseLangs[0] || null}
          subseries={characterOnly || castApi === "books" ? [] : subseries}
          castApi={castApi}
          filmId={filmId}
          characterOnly={characterOnly || castApi === "books"}
          onClose={onAddClose}
          onSaved={onDataChanged}
        />
      </div>
    );
  }

  return (
    <div
      className={
        castLayout === "row"
          ? `series-cast series-cast--row-scroll${
              hasCastCarousel ? " series-cast--carousel" : ""
            }`
          : "artist-lineup series-cast"
      }
      data-count={
        castLayout === "row"
          ? Math.min(Math.max(members.length, 1), 8)
          : undefined
      }
      style={
        castLayout === "row"
          ? ({
              ["--cast-visible" as string]: String(
                members.length <= 3
                  ? Math.max(members.length, 1)
                  : Math.min(members.length, 6)
              ),
            } as CSSProperties)
          : undefined
      }
    >
      {members.length === 0 ? (
        <p className="muted artist-lineup__empty">No members in this group.</p>
      ) : castLayout === "row" ? (
        <>
          <div className="series-cast__scroll" ref={castRowRef}>
            <div className="series-cast__row">
              {members.map((m, i) => (
                <MemberCard
                  key={`${m.id ?? m.name}-r${i}`}
                  member={m}
                  characterCentered={characterCentered}
                  franchiseLangs={franchiseLangs}
                  originLanguage={originLanguage}
                  activeLanguage={activeLanguage}
                  castSubFilter={castSubFilter}
                  onSelect={setModalMember}
                />
              ))}
            </div>
          </div>
          {hasCastCarousel ? (
            <button
              type="button"
              className="series-cast__chevron"
              onClick={advanceCastCarousel}
              aria-label="Show more cast"
            >
              <svg
                className="artist-page__catalog-chevron"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  d="M9 6l6 6-6 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ) : null}
        </>
      ) : (
        <div
          className="artist-lineup-grid"
          data-count={Math.min(Math.max(members.length, 1), 8)}
        >
          <div className="artist-lineup-row">
            {rows.top.map((m, i) => (
              <MemberCard
                key={`${m.id ?? m.name}-t${i}`}
                member={m}
                characterCentered={characterCentered}
                franchiseLangs={franchiseLangs}
                originLanguage={originLanguage}
                activeLanguage={activeLanguage}
                castSubFilter={castSubFilter}
                onSelect={setModalMember}
              />
            ))}
          </div>
          {rows.bottom.length > 0 ? (
            <div className="artist-lineup-row">
              {rows.bottom.map((m, i) => (
                <MemberCard
                  key={`${m.id ?? m.name}-b${i}`}
                  member={m}
                  characterCentered={characterCentered}
                  franchiseLangs={franchiseLangs}
                  originLanguage={originLanguage}
                  activeLanguage={activeLanguage}
                  castSubFilter={castSubFilter}
                  onSelect={setModalMember}
                />
              ))}
            </div>
          ) : null}
        </div>
      )}

      {modalMember ? (
        <CastMemberModal
          member={modalMember}
          franchiseId={franchiseId}
          franchiseName={franchiseName}
          isAdmin={isAdmin}
          bucket={tab}
          franchiseLangs={franchiseLangs}
          languageOptions={franchiseLangOptions}
          subseries={subseries}
          castSubFilter={castSubFilter}
          castApi={castApi}
          filmId={filmId}
          onClose={() => setModalMember(null)}
          onDataChanged={onDataChanged}
        />
      ) : null}

      {addOpen && onAddClose ? (
        <AddCastModal
          franchiseId={franchiseId}
          bucket={tab}
          languageOptions={franchiseLangOptions}
          defaultLanguage={franchiseLangs[0] || null}
          subseries={subseries}
          castApi={castApi}
          filmId={filmId}
          characterOnly={characterOnly || castApi === "books"}
          onClose={onAddClose}
          onSaved={onDataChanged}
        />
      ) : null}
    </div>
  );
}
