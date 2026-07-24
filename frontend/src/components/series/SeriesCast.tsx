import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  addSeriesCastMember,
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
  subseries?: SeriesSubseriesCard[];
  /** "all" or a subseries id — filters members by subseries_ids. */
  castSubFilter?: string;
  tab: SeriesCastTab;
  isAdmin?: boolean;
  addOpen?: boolean;
  onAddClose?: () => void;
  onDataChanged: () => void;
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

function performanceForLang(
  member: SeriesCastMember,
  lang: string | null
): SeriesCastPerformance | null {
  const perfs = member.performances || [];
  if (!perfs.length) return null;
  if (lang) {
    const match = perfs.find(
      (p) => (p.language || "").toLowerCase() === lang.toLowerCase()
    );
    if (match) return match;
  }
  return perfs[0];
}

function actorNamesFromPerf(perf: SeriesCastPerformance | null): string[] {
  if (!perf) return [];
  if (perf.actor_names?.length) {
    return perf.actor_names.map((n) => n.trim()).filter(Boolean);
  }
  if (perf.actor_name?.trim()) return [perf.actor_name.trim()];
  return [];
}

function actorNamesForLang(
  member: SeriesCastMember,
  lang: string | null
): string[] {
  const perf = performanceForLang(member, lang);
  const fromPerf = actorNamesFromPerf(perf);
  if (fromPerf.length) return fromPerf;
  if (member.actors?.length) {
    const byLang = lang
      ? member.actors.filter(
          (a) =>
            a.name &&
            (!a.language || a.language.toLowerCase() === lang.toLowerCase())
        )
      : member.actors.filter((a) => a.name);
    if (byLang.length) return byLang.map((a) => a.name);
  }
  return (member.roles || []).filter(Boolean);
}

function actorLabel(member: SeriesCastMember, lang: string | null): string {
  return actorNamesForLang(member, lang).join(", ");
}

/** Actors to list under a character, ordered by franchise language list
 *  (origin / first language first). One row per language; multiple actors
 *  joined with ", ". */
function actorsForDisplay(
  member: SeriesCastMember,
  franchiseLangs: string[],
  originLanguage?: string | null
): { language: string; name: string; photo_url?: string | null }[] {
  const out: {
    language: string;
    name: string;
    photo_url?: string | null;
  }[] = [];
  let langs =
    franchiseLangs.length > 0
      ? [...franchiseLangs]
      : (member.performances || [])
          .map((p) => p.language)
          .filter(Boolean) as string[];

  if (originLanguage) {
    langs = [
      originLanguage,
      ...langs.filter(
        (l) => l.toLowerCase() !== originLanguage.toLowerCase()
      ),
    ];
  }

  for (const lang of langs) {
    const names = actorNamesForLang(member, lang);
    if (!names.length) continue;
    const perf = performanceForLang(member, lang);
    const firstActor = (member.actors || []).find(
      (a) =>
        a.name &&
        a.name === names[0] &&
        (!a.language || a.language.toLowerCase() === lang.toLowerCase())
    );
    out.push({
      language: lang,
      name: names.join(", "),
      photo_url: perf?.photo_url || firstActor?.photo_url || null,
    });
  }

  if (!out.length && (member.roles?.length || member.actors?.length)) {
    const names = actorNamesForLang(member, originLanguage || franchiseLangs[0] || null);
    if (names.length) {
      out.push({
        language: originLanguage || franchiseLangs[0] || "ja",
        name: names.join(", "),
        photo_url:
          member.actors?.[0]?.photo_url ||
          member.actor_photo_url ||
          member.character_photo_url,
      });
    }
  }
  return out;
}

function MemberCard({
  member,
  characterCentered,
  franchiseLangs,
  originLanguage,
  onSelect,
}: {
  member: SeriesCastMember;
  characterCentered: boolean;
  franchiseLangs: string[];
  originLanguage?: string | null;
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
  const actors = characterCentered
    ? actorsForDisplay(member, franchiseLangs, originLanguage)
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
      {characterCentered && actors.length > 0 ? (
        <ul className="series-cast-card__actors">
          {actors.map((a) => {
            const photo = a.photo_url || null;
            const key = `${a.language}::${a.name}`;
            const isActive = activeActorKey === key;
            return (
              <li key={key}>
                <button
                  type="button"
                  className={`series-cast-card__actor${
                    isActive ? " is-active" : ""
                  }`}
                  title={a.name}
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
                  <span
                    className={`fi fi-${flagIso(a.language)} series-cast-card__flag`}
                    aria-hidden
                  />
                  <span className="series-cast-card__actor-name">{a.name}</span>
                </button>
              </li>
            );
          })}
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
  const [actorNames, setActorNames] = useState<string[]>(() => {
    const names = actorNamesForLang(member, defaultLang);
    return names.length ? names : [""];
  });
  const [photoUrl, setPhotoUrl] = useState(member.photo_url || "");
  const [actorPhotoUrl, setActorPhotoUrl] = useState(
    performanceForLang(member, defaultLang)?.photo_url ||
      member.actor_photo_url ||
      member.character_photo_url ||
      ""
  );
  const [selectedSubs, setSelectedSubs] = useState<string[]>(
    () => member.subseries_ids || []
  );

  useEffect(() => {
    const names = actorNamesForLang(member, editLang);
    setActorNames(names.length ? names : [""]);
    setActorPhotoUrl(performanceForLang(member, editLang)?.photo_url || "");
  }, [editLang, member]);

  const handleSave = async () => {
    if (member.id == null) return;
    setBusy(true);
    setError(null);
    try {
      const actors = actorNames.map((s) => s.trim()).filter(Boolean);
      await patchSeriesCastMember(franchiseId, member.id, {
        bucket,
        name: characterCentered ? charName : charName,
        character: characterCentered ? charName : undefined,
        photo_url: photoUrl.trim() || null,
        actor_photo_url: actorPhotoUrl.trim() || null,
        actors: characterCentered ? actors : undefined,
        roles: characterCentered ? actors : undefined,
        language: characterCentered ? editLang : undefined,
        subseries_ids: selectedSubs,
      });
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
    if (!window.confirm(`Remove “${member.name}” from cast?`)) return;
    setBusy(true);
    setError(null);
    try {
      await removeSeriesCastMember(franchiseId, member.id, bucket);
      onDataChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const displayPhoto = member.photo_url;
  const listed = actorsForDisplay(member, franchiseLangs, franchiseLangs[0]);
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
            <label>
              {characterCentered ? "Character name" : "Name"}
              <input
                value={charName}
                onChange={(e) => setCharName(e.target.value)}
              />
            </label>
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
                  {actorNames.map((name, idx) => (
                    <div key={idx} className="series-cast-edit__actor-row">
                      <input
                        value={name}
                        onChange={(e) => {
                          const next = [...actorNames];
                          next[idx] = e.target.value;
                          setActorNames(next);
                        }}
                        placeholder={idx === 0 ? "Actor name" : "Additional actor"}
                      />
                      {actorNames.length > 1 ? (
                        <button
                          type="button"
                          className="btn link-form__delete"
                          aria-label="Remove actor"
                          onClick={() =>
                            setActorNames(actorNames.filter((_, i) => i !== idx))
                          }
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setActorNames([...actorNames, ""])}
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
            <label>
              {characterCentered ? "Character photo URL" : "Photo URL"}
              <input
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
              />
            </label>
            {characterCentered ? (
              <label>
                Actor photo URL
                <input
                  value={actorPhotoUrl}
                  onChange={(e) => setActorPhotoUrl(e.target.value)}
                />
              </label>
            ) : null}
            {error ? <p className="error">{error}</p> : null}
            <div className="modal-actions-row">
              <button
                type="button"
                className="btn link-form__delete"
                disabled={busy}
                onClick={() => void handleRemove()}
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
    </ModalPortal>
  );
}

function AddCastModal({
  franchiseId,
  bucket,
  languageOptions,
  defaultLanguage,
  subseries,
  onClose,
  onSaved,
}: {
  franchiseId: string;
  bucket: SeriesCastTab;
  languageOptions: SeriesLanguageOption[];
  defaultLanguage: string | null;
  subseries: SeriesSubseriesCard[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const characterCentered = bucket === "characters";
  const [charName, setCharName] = useState("");
  const [actorNames, setActorNames] = useState<string[]>([""]);
  const [photoUrl, setPhotoUrl] = useState("");
  const [actorPhotoUrl, setActorPhotoUrl] = useState("");
  const [lang, setLang] = useState(
    defaultLanguage || languageOptions[0]?.code || "en"
  );
  const [selectedSubs, setSelectedSubs] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!charName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const actors = actorNames.map((s) => s.trim()).filter(Boolean);
      await addSeriesCastMember(franchiseId, {
        bucket,
        name: characterCentered
          ? actors[0] || charName.trim()
          : charName.trim(),
        character: characterCentered ? charName.trim() : undefined,
        photo_url: characterCentered
          ? actorPhotoUrl.trim() || undefined
          : photoUrl.trim() || undefined,
        character_photo_url: characterCentered
          ? photoUrl.trim() || undefined
          : undefined,
        roles: actors.length ? actors : undefined,
        language: characterCentered ? lang : undefined,
        subseries_ids: selectedSubs.length ? selectedSubs : undefined,
      });
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
          <label>
            {characterCentered ? "Character name" : "Name"}
            <input
              value={charName}
              onChange={(e) => setCharName(e.target.value)}
              autoFocus
            />
          </label>
          {characterCentered ? (
            <>
              <label>
                Language
                <select value={lang} onChange={(e) => setLang(e.target.value)}>
                  {languageOptions.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.label.replace(/\s*\(origin\)\s*$/i, "")}
                    </option>
                  ))}
                </select>
              </label>
              <div className="series-cast-edit__actors">
                <span className="series-cast-edit__actors-label">Actors</span>
                {actorNames.map((name, idx) => (
                  <div key={idx} className="series-cast-edit__actor-row">
                    <input
                      value={name}
                      onChange={(e) => {
                        const next = [...actorNames];
                        next[idx] = e.target.value;
                        setActorNames(next);
                      }}
                      placeholder={
                        idx === 0 ? "Actor name" : "Additional actor"
                      }
                    />
                    {actorNames.length > 1 ? (
                      <button
                        type="button"
                        className="btn link-form__delete"
                        aria-label="Remove actor"
                        onClick={() =>
                          setActorNames(actorNames.filter((_, i) => i !== idx))
                        }
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                ))}
                <button
                  type="button"
                  className="btn"
                  onClick={() => setActorNames([...actorNames, ""])}
                >
                  Add actor
                </button>
              </div>
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
                        <label
                          key={s.id}
                          className="series-cast-edit__sub-item"
                        >
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
              <label>
                Character photo URL (optional)
                <input
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                />
              </label>
              <label>
                Actor photo URL (optional)
                <input
                  value={actorPhotoUrl}
                  onChange={(e) => setActorPhotoUrl(e.target.value)}
                />
              </label>
            </>
          ) : (
            <label>
              Photo URL (optional)
              <input
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
              />
            </label>
          )}
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
  subseries = [],
  castSubFilter = "all",
  tab,
  isAdmin,
  addOpen,
  onAddClose,
  onDataChanged,
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
    if (originLanguage && langs.length) {
      return [
        originLanguage,
        ...langs.filter(
          (l) => l.toLowerCase() !== originLanguage.toLowerCase()
        ),
      ];
    }
    return langs;
  }, [languages, originLanguage]);

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
    return filtered.slice(0, 8);
  }, [cast, tab, castSubFilter]);

  const rows = useMemo(
    () =>
      splitRows(members, deviceLayout === "mobile-landscape" ? 5 : undefined),
    [members, deviceLayout]
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

  if (!members.length && !addOpen) {
    return (
      <div className="artist-lineup">
        <p className="muted artist-lineup__empty">
          No {tab === "characters" ? "characters" : "staff"} yet
          {castSubFilter !== "all" ? " for this subseries" : ""}. Use the menu
          → <strong>Add member</strong>
          {isAdmin ? "" : " (admin)"}, or refresh metadata from TMDb.
        </p>
        {addOpen && onAddClose ? (
          <AddCastModal
            franchiseId={franchiseId}
            bucket={tab}
            languageOptions={franchiseLangOptions}
            defaultLanguage={franchiseLangs[0] || null}
            subseries={subseries}
            onClose={onAddClose}
            onSaved={onDataChanged}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="artist-lineup series-cast">
      {members.length === 0 ? (
        <p className="muted artist-lineup__empty">No members in this group.</p>
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
          onClose={onAddClose}
          onSaved={onDataChanged}
        />
      ) : null}
    </div>
  );
}
